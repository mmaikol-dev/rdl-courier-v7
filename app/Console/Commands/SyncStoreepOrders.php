<?php

namespace App\Console\Commands;

use App\Models\StoreepIntegration;
use App\Services\StoreepApiService;
use App\Services\StoreepOrderImporter;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * Pulls orders from each connected Storeep store and stages them into our
 * existing sheet-order pipeline.
 *
 * This is the reconciliation half of the integration. Webhooks, when they are
 * set up, give low latency; this command is what makes delivery guarantees
 * irrelevant, because every run re-walks the store from the integration's
 * `last_synced_at_remote` cursor and re-stages anything that changed.
 */
class SyncStoreepOrders extends Command
{
    protected $signature = 'storeep:sync-orders
        {--integration= : Sync only this integration id}
        {--limit= : Cap the number of orders staged per integration}
        {--full : Ignore the cursor and re-read the whole store}';

    protected $description = 'Sync orders from connected Storeep stores into the sheet order pipeline';

    public function handle(
        StoreepApiService $api,
        StoreepOrderImporter $importer,
    ): int {
        $query = StoreepIntegration::query()->where('is_enabled', true);

        if ($this->option('integration') !== null) {
            $query->whereKey($this->option('integration'));
        }

        $integrations = $query->orderBy('id')->get();

        if ($integrations->isEmpty()) {
            $this->info('No enabled Storeep integrations.');

            return self::SUCCESS;
        }

        $limit = $this->option('limit') !== null ? max(1, (int) $this->option('limit')) : null;
        $totalStaged = 0;

        foreach ($integrations as $integration) {
            $totalStaged += $this->syncOne($integration, $api, $importer, $limit);
        }

        $this->info("Staged {$totalStaged} order(s).");

        return self::SUCCESS;
    }

    private function syncOne(
        StoreepIntegration $integration,
        StoreepApiService $api,
        StoreepOrderImporter $importer,
        ?int $limit,
    ): int {
        // Belt-and-braces with withoutOverlapping(), matching UpdateSheetOrders.
        $lock = Cache::lock('storeep-sync:'.$integration->id, 300);

        if (! $lock->get()) {
            $this->line("Skipped [{$integration->store_name}]: another sync is running.");
            Log::info('Storeep sync skipped to avoid overlap', ['store' => $integration->store_name]);

            return 0;
        }

        $cursor = $this->option('full')
            ? null
            : $integration->last_synced_at_remote?->format('Y-m-d H:i:s');

        $staged = 0;
        $newestRemote = null;
        $seenIds = [];

        try {
            foreach ($api->ordersSince($integration, $cursor, $seenIds) as $order) {
                $importer->stage($integration, $order);
                $staged++;

                $remote = $order['updated_at_remote'] ?? null;

                if (is_string($remote) && ($newestRemote === null || $remote > $newestRemote)) {
                    $newestRemote = $remote;
                }

                if ($limit !== null && $staged >= $limit) {
                    break;
                }
            }

            $integration->forceFill([
                'last_synced_at' => now(),
                'last_synced_at_remote' => $newestRemote ?? $integration->last_synced_at_remote,
                'orders_synced' => $integration->orders_synced + $staged,
                'last_error' => null,
                'last_error_at' => null,
            ])->save();

            $this->line("[{$integration->store_name}] staged {$staged} order(s).");
            Log::info('✓ Storeep sync completed', [
                'store' => $integration->store_name,
                'staged' => $staged,
                'cursor' => $newestRemote,
            ]);
        } catch (\Throwable $exception) {
            $integration->forceFill([
                'last_error' => mb_substr($exception->getMessage(), 0, 1000),
                'last_error_at' => now(),
            ])->save();

            $this->error("[{$integration->store_name}] {$exception->getMessage()}");

            // One broken store must not stop the others from syncing.
            Log::error('❌ Storeep sync failed', [
                'store' => $integration->store_name,
                'error' => $exception->getMessage(),
            ]);
        } finally {
            $lock->release();
        }

        return $staged;
    }
}
