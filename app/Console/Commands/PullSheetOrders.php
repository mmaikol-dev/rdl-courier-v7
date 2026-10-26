<?php

namespace App\Console\Commands;

use App\Models\Sheet;
use App\Services\GoogleSheetsReader;
use App\Services\SheetOrderPullImporter;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

class PullSheetOrders extends Command
{
    protected $signature = 'orders:pull-sheets
        {--tab-limit=20 : Maximum active tabs to read in one run}
        {--order-limit=250 : Maximum orders to stage in one run}
        {--sheet-id= : Restrict polling to one spreadsheet ID}';

    protected $description = 'Poll enabled Google Sheet tabs and queue eligible new orders';

    private const CURSOR_KEY = 'orders:pull-sheets:cursor';

    public function handle(GoogleSheetsReader $reader, SheetOrderPullImporter $importer): int
    {
        $lock = Cache::lock('pull-sheet-orders-lock', 180);

        if (! $lock->get()) {
            $this->info('Sheet order pickup skipped because another run is active.');

            return self::SUCCESS;
        }

        try {
            $targets = $this->targets($this->option('sheet-id'));

            if ($targets === []) {
                $this->info('No enabled spreadsheets have active tabs.');

                return self::SUCCESS;
            }

            $cursor = ((int) Cache::get(self::CURSOR_KEY, 0)) % count($targets);
            $rotatedTargets = array_merge(
                array_slice($targets, $cursor),
                array_slice($targets, 0, $cursor)
            );
            $tabLimit = max(1, (int) $this->option('tab-limit'));
            $orderBudget = max(1, (int) $this->option('order-limit'));
            $batch = array_slice($rotatedTargets, 0, $tabLimit);
            $staged = 0;
            $errors = 0;
            $attempted = 0;
            $scanned = 0;

            foreach ($batch as $target) {
                if ($staged >= $orderBudget) {
                    break;
                }

                [$retryKey, $attemptKey] = $this->retryKeys($target);
                $rowCursorKey = $this->rowCursorKey($target);
                $retryAfter = (int) Cache::get($retryKey, 0);

                if ($retryAfter > now()->timestamp) {
                    $attempted++;
                    continue;
                }

                try {
                    $startRow = max(1, (int) Cache::get($rowCursorKey, 1));
                    $summary = $importer->importForAutomaticPickup(
                        $target['sheet'],
                        $target['tab'],
                        $orderBudget - $staged,
                        $startRow
                    );

                    $staged += $summary['queued'] + $summary['requeued'];
                    $scanned++;
                    $attempted++;
                    Cache::forget($retryKey);
                    Cache::forget($attemptKey);

                    if ($summary['remaining'] === 0) {
                        $nextRow = $summary['rows_read'] >= SheetOrderPullImporter::AUTOMATIC_ROWS_PER_SCAN
                            ? $startRow + SheetOrderPullImporter::AUTOMATIC_ROWS_PER_SCAN
                            : 1;
                        Cache::put($rowCursorKey, $nextRow, now()->addYear());
                    }

                    Log::info('Automatic Google Sheet order poll completed', [
                        'sheet_id' => $target['sheet']->sheet_id,
                        'tab' => $target['tab'],
                        'scanned' => $summary['scanned'],
                        'rows_read' => $summary['rows_read'],
                        'queued' => $summary['queued'],
                        'requeued' => $summary['requeued'],
                        'remaining' => $summary['remaining'],
                        'truncated' => $summary['truncated'],
                    ]);
                } catch (Throwable $exception) {
                    $errors++;
                    $attempted++;
                    $attempt = (int) Cache::get($attemptKey, 0);
                    $delay = min(64, 2 ** min($attempt, 6)) + random_int(0, 1000) / 1000;
                    Cache::put($attemptKey, $attempt + 1, now()->addDay());
                    Cache::put($retryKey, now()->addSeconds((int) ceil($delay))->timestamp, now()->addDay());
                    $this->error("Failed [{$target['sheet']->sheet_name} / {$target['tab']}]: {$exception->getMessage()}");

                    Log::error('Automatic Google Sheet order poll failed', [
                        'sheet_id' => $target['sheet']->sheet_id,
                        'tab' => $target['tab'],
                        'error' => $exception->getMessage(),
                    ]);
                }
            }

            Cache::put(self::CURSOR_KEY, ($cursor + $attempted) % count($targets), now()->addYear());

            $this->info("Scanned {$scanned} tab(s); queued {$staged} order(s); {$errors} tab(s) failed.");

            return $errors === 0 ? self::SUCCESS : self::FAILURE;
        } finally {
            $lock->release();
        }
    }

    /**
     * @return array<int, array{sheet: Sheet, tab: string}>
     */
    private function targets(?string $sheetId = null): array
    {
        $sheets = Sheet::query()
            ->where('auto_pickup_enabled', true)
            ->when($sheetId, fn ($query) => $query->where('sheet_id', $sheetId))
            ->orderBy('id')
            ->get(['id', 'sheet_id', 'sheet_name', 'country', 'auto_pickup_tabs']);

        $targets = [];

        foreach ($sheets as $sheet) {
            foreach (array_unique($sheet->auto_pickup_tabs ?? []) as $tab) {
                $tab = trim((string) $tab);

                if ($tab !== '') {
                    $targets[] = ['sheet' => $sheet, 'tab' => $tab];
                }
            }
        }

        return $targets;
    }

    /**
     * @param  array{sheet: Sheet, tab: string}  $target
     * @return array{string, string}
     */
    private function retryKeys(array $target): array
    {
        $identity = hash('sha256', $target['sheet']->sheet_id."\0".$target['tab']);

        return [
            'orders:pull-sheets:retry-after:'.$identity,
            'orders:pull-sheets:retry-attempt:'.$identity,
        ];
    }

    /**
     * @param  array{sheet: Sheet, tab: string}  $target
     */
    private function rowCursorKey(array $target): string
    {
        $identity = hash('sha256', $target['sheet']->sheet_id."\0".$target['tab']);

        return 'orders:pull-sheets:row-cursor:'.$identity;
    }
}
