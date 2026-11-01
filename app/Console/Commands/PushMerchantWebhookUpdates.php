<?php

namespace App\Console\Commands;

use App\Models\MerchantApiIntegration;
use App\Models\SheetOrder;
use App\Services\MerchantWebhookService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class PushMerchantWebhookUpdates extends Command
{
    protected $signature = 'merchant:push-order-updates
        {merchant : Merchant name as stored on the merchant user}
        {--order-no=* : Push only these order numbers}
        {--since= : Only orders updated (or created, when updated_at is null) on or after this date}
        {--limit=500 : Maximum orders to queue, 0 for no limit}
        {--dry-run : Show what would be sent without queueing webhooks}';

    protected $description = 'Queue Merchant API order.updated webhooks for a merchant without changing updated_at';

    public function handle(MerchantWebhookService $webhooks): int
    {
        $name = trim((string) $this->argument('merchant'));
        $max = max(0, (int) $this->option('limit'));
        $dryRun = (bool) $this->option('dry-run');

        Log::info('Merchant order update webhook push started', [
            'merchant' => $name,
            'order_numbers' => $this->option('order-no'),
            'since' => $this->option('since'),
            'limit' => $max,
            'dry_run' => $dryRun,
        ]);

        $integrations = MerchantApiIntegration::query()
            ->with('merchantUser:id,name,merchant_api_enabled')
            ->whereHas('merchantUser', function ($query) use ($name): void {
                $query->whereRaw('LOWER(TRIM(name)) = ?', [strtolower($name)])
                    ->where('merchant_api_enabled', true);
            })
            ->where('is_active', true)
            ->whereNotNull('webhook_url')
            ->whereNotNull('webhook_secret')
            ->whereJsonContains('scopes', 'orders:read')
            ->whereJsonContains('webhook_events', 'order.updated')
            ->get();

        if ($integrations->isEmpty()) {
            $this->error("No active integration for [{$name}] is subscribed to order.updated with the orders:read scope.");

            Log::warning('Merchant order update webhook push skipped: no eligible integration', [
                'merchant' => $name,
            ]);

            return self::FAILURE;
        }

        $merchantName = (string) $integrations->first()->merchantUser->name;

        $this->info("Matched {$integrations->count()} integration(s) for {$merchantName}.");

        $query = SheetOrder::query()
            ->whereRaw('LOWER(TRIM(merchant)) = ?', [strtolower($merchantName)])
            ->when($this->option('order-no'), fn ($builder, $orderNos) => $builder->whereIn('order_no', $orderNos))
            ->when($this->option('since'), function ($builder, $since): void {
                $builder->where(function ($query) use ($since): void {
                    $query->where('updated_at', '>=', $since)
                        ->orWhere(fn ($query) => $query->whereNull('updated_at')->where('created_at', '>=', $since));
                });
            });

        $matched = 0;
        $queued = 0;

        $query->chunkById(200, function ($orders) use ($webhooks, $merchantName, $max, $dryRun, &$matched, &$queued): bool {
            foreach ($orders as $order) {
                if ($max > 0 && $matched >= $max) {
                    return false;
                }

                $matched++;

                if ($dryRun) {
                    $this->line("Would send order.updated for {$order->order_no} (id {$order->id})");

                    continue;
                }

                $webhooks->send($merchantName, 'order.updated', [
                    'id' => $order->id,
                    'order_no' => $order->order_no,
                    'status' => $order->status,
                    'updated_at' => ($order->updated_at ?? $order->created_at)?->toIso8601String(),
                ]);

                Log::debug('Merchant order update webhook queued', [
                    'merchant' => $merchantName,
                    'order_id' => $order->id,
                    'order_no' => $order->order_no,
                    'event' => 'order.updated',
                ]);

                $queued++;
            }

            return true;
        });

        if ($dryRun) {
            $this->info("Dry run complete: {$matched} order(s) would be queued for {$merchantName}.");

            Log::info('Merchant order update webhook dry run completed', [
                'merchant' => $merchantName,
                'integration_ids' => $integrations->pluck('id')->all(),
                'orders_matched' => $matched,
            ]);

            return self::SUCCESS;
        }

        $this->info("Queued {$queued} order.updated webhook(s) for {$merchantName}.");

        if ($queued > 0) {
            $this->line('Run `php artisan queue:work --tries=3` to deliver the queued webhooks.');
        }

        Log::info('Merchant order update webhooks queued manually', [
            'merchant' => $merchantName,
            'integration_ids' => $integrations->pluck('id')->all(),
            'orders_matched' => $matched,
            'webhooks_queued' => $queued,
        ]);

        return self::SUCCESS;
    }
}
