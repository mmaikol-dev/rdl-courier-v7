<?php

namespace App\Console\Commands;

use App\Models\PartnerOrderIntegration;
use App\Services\HealthilyVitaeOrdersApi;
use App\Services\PartnerOrderImporter;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class SyncPartnerOrders extends Command
{
    protected $signature = 'partner-orders:sync {--integration=}';
    protected $description = 'Sync external partner orders into the incoming order pipeline';

    public function handle(HealthilyVitaeOrdersApi $api, PartnerOrderImporter $importer): int
    {
        $query = PartnerOrderIntegration::query()->with('sheet');
        if ($this->option('integration')) {
            // An explicit manual run is allowed while a feed is paused.
            $query->whereKey($this->option('integration'));
        } else {
            $query->where('is_enabled', true);
        }

        foreach ($query->orderBy('id')->get() as $integration) {
            $lock = Cache::lock('partner-order-sync:'.$integration->id, 300);
            if (! $lock->get()) {
                $this->warn("Skipped {$integration->integration_name}: sync already running.");
                continue;
            }

            $count = 0;
            try {
                foreach ($api->orders($integration) as $order) {
                    $incoming = $importer->stage($integration, $order);
                    if ($incoming->wasRecentlyCreated) {
                        $count++;
                    }
                }
                $integration->forceFill([
                    'last_synced_at' => now(),
                    'orders_synced' => $integration->orders_synced + $count,
                    'last_error' => null,
                    'last_error_at' => null,
                ])->save();
                $this->info("{$integration->integration_name}: staged {$count} order(s).");
            } catch (\Throwable $exception) {
                $integration->forceFill([
                    'last_error' => mb_substr($exception->getMessage(), 0, 1000),
                    'last_error_at' => now(),
                ])->save();
                Log::error('Partner orders sync failed', [
                    'integration_id' => $integration->id,
                    'provider' => $integration->provider,
                    'error' => $exception->getMessage(),
                ]);
                $this->error("{$integration->integration_name}: {$exception->getMessage()}");
            } finally {
                $lock->release();
            }
        }

        return self::SUCCESS;
    }
}
