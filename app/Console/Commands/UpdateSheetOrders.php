<?php

namespace App\Console\Commands;

use Illuminate\Support\Facades\Cache;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Google_Client;
use Google_Service_Sheets;
use Google_Service_Sheets_ValueRange;
use Google_Service_Sheets_BatchUpdateValuesRequest;
use App\Models\SheetOrder;
use Carbon\Carbon;
use Exception;

class UpdateSheetOrders extends Command
{
    protected $signature = 'orders:update-sheets {--limit= : Maximum orders to process in one run}';
    protected $description = 'Automatically update orders in the Google Sheet';

    // The spreadsheet id that has a special layout (order no in column N)
    private $specialSheetId = '1x1Rntb-_BbXe5gvWIKN3Zr2Tnbyi9rSmbaieYzUryzU';

    // Maximum orders to process in one command run (Option B)
    private $maxPerRun = 1000;

    public function __construct()
    {
        parent::__construct();
    }

    public function handle()
    {
        $lock = Cache::lock('update-sheet-orders-lock', 300);

        if (! $lock->get()) {
            Log::info('UpdateSheetOrders command skipped to avoid overlap.');
            return 0;
        }

        try {
            // We fetch a larger set to have enough per-spreadsheet grouping,
            // but the actual per-run limit is enforced below.
            $fetchSize = max(1, (int) ($this->option('limit') ?: $this->maxPerRun));

            // Fetch records that are due for syncing. Future timestamps are used
            // as a retry delay, so they must not be picked up immediately.
            $sheetOrders = SheetOrder::whereNotNull('updated_at')
                ->where('updated_at', '<=', now())
                ->whereNotNull('sheet_id')
                ->whereNotNull('sheet_name')
                ->orderBy('updated_at')
                ->limit($fetchSize)
                ->get();

            if ($sheetOrders->isEmpty()) {
                Log::info('No sheet orders found to update.');
                return 0;
            }

            // Google Sheets API setup
            $client = new Google_Client();
            $client->setAuthConfig(storage_path('project-423911-84ac0fbdde59.json'));
            $client->addScope(Google_Service_Sheets::SPREADSHEETS);
            $service = new Google_Service_Sheets($client);

            // Group orders by spreadsheet ID (sheet_id)
            $ordersBySpreadsheet = $sheetOrders->groupBy('sheet_id');

            Log::info("Found " . $sheetOrders->count() . " pending orders across " . count($ordersBySpreadsheet) . " spreadsheets");

            $currentCount = 0;
            $maxLimit = $fetchSize;

            foreach ($ordersBySpreadsheet as $spreadsheetId => $orders) {
                $spreadsheetCount = $orders->count();
                $remaining = $maxLimit - $currentCount;

                // OPTION B rule: skip entire spreadsheet if it would exceed remaining capacity
                if ($spreadsheetCount > $remaining) {
                    Log::warning("Skipping spreadsheet {$spreadsheetId} — has {$spreadsheetCount} orders but only {$remaining} slots remain for this run.");
                    continue;
                }

                Log::info("Processing spreadsheet {$spreadsheetId} (orders: {$spreadsheetCount}; remaining slots: {$remaining})");

                $processedFromSpreadsheet = $this->processSpreadsheet($service, $spreadsheetId, $orders);

                $currentCount += $processedFromSpreadsheet;

                Log::info("Processed {$processedFromSpreadsheet} orders from spreadsheet {$spreadsheetId}. Total processed this run: {$currentCount}/{$maxLimit}");

                // Stop completely if we've reached our per-run cap
                if ($currentCount >= $maxLimit) {
                    Log::info("Reached max limit of {$maxLimit} orders for this run. Stopping.");
                    break;
                }

                // Small delay between spreadsheets to be kind to the API
                sleep(1);
            }

        } catch (Exception $e) {
            Log::error('Error initializing Google API client', ['message' => $e->getMessage(), 'trace' => $e->getTraceAsString()]);
        } finally {
            // Always release the lock
            try {
                $lock->release();
            } catch (Exception $e) {
                Log::warning('Failed to release lock: ' . $e->getMessage());
            }
        }

        return 0;
    }

    /**
     * Process a single spreadsheet (all sheets within it) and return how many orders were successfully processed (and marked).
     *
     * @param Google_Service_Sheets $service
     * @param string $spreadsheetId
     * @param \Illuminate\Support\Collection $orders  (Collection of SheetOrder models)
     * @return int  number of orders successfully processed and marked
     */
    private function processSpreadsheet($service, $spreadsheetId, $orders)
    {
        try {
            Log::info("Processing spreadsheet: {$spreadsheetId} with " . $orders->count() . " orders");

            // Verify spreadsheet exists and gather available sheet titles
            $spreadsheet = $service->spreadsheets->get($spreadsheetId);
            $sheets = $spreadsheet->getSheets();
            $availableSheets = [];

            foreach ($sheets as $sheet) {
                $availableSheets[] = $sheet->getProperties()->getTitle();
            }

            // Group orders by sheet_name within this spreadsheet
            $ordersBySheetName = $orders->groupBy('sheet_name');

            $allBatchData = [];
            $allProcessedOrders = [];

            foreach ($ordersBySheetName as $sheetName => $sheetOrders) {
                // Verify sheet exists
                if (! in_array($sheetName, $availableSheets)) {
                    Log::error("Sheet '{$sheetName}' not found in spreadsheet {$spreadsheetId}", [
                        'available_sheets' => $availableSheets,
                        'order_count' => $sheetOrders->count(),
                    ]);
                    continue;
                }

                Log::info("Preparing sheet '{$sheetName}' with " . $sheetOrders->count() . " orders");

                // Prepare batch data for this sheet
                $result = $this->prepareSheetBatchData(
                    $service,
                    $spreadsheetId,
                    $sheetName,
                    $sheetOrders
                );

                // Merge batch data and processed orders (arrays)
                $allBatchData = array_merge($allBatchData, $result['batch_data']);
                $allProcessedOrders = array_merge($allProcessedOrders, $result['processed_orders']);
            }

            // If there's nothing to update, return zero
            if (empty($allBatchData)) {
                Log::info("No batch data to send for spreadsheet {$spreadsheetId}");
                return 0;
            }

            // Execute ONE batch update for the entire spreadsheet
            try {
                $batchUpdateRequest = new Google_Service_Sheets_BatchUpdateValuesRequest([
                    'valueInputOption' => 'USER_ENTERED',
                    'data' => $allBatchData,
                ]);

                $service->spreadsheets_values->batchUpdate($spreadsheetId, $batchUpdateRequest);

                // Mark orders as synced after successful batch update
                // Only mark as fully processed if all required fields have values
                $fullyProcessedCount = 0;
                $partiallyProcessedCount = 0;

                foreach ($allProcessedOrders as $order) {
                    try {
                        // Check if all required fields have values
                        $hasStatus = !empty($order->status);
                        $hasDeliveryDate = !empty($order->delivery_date);
                        $hasInstructions = !empty($order->instructions);

                        if ($hasStatus && $hasDeliveryDate && $hasInstructions) {
                            // All required fields present - mark as fully synced
                            $order->updated_at = null;
                            $order->processed = 2;
                            $order->save();
                            $fullyProcessedCount++;

                            Log::debug("Order #{$order->order_no} marked as fully synced (all required fields present)");
                        } else {
                            // Some required fields missing - update the timestamp to delay retry
                            // This prevents it from being picked up immediately in the next run
                            $order->updated_at = now()->addMinutes(30);
                            $order->save();
                            $partiallyProcessedCount++;

                            Log::info("Order #{$order->order_no} synced to sheet but missing required fields - will retry in 30 minutes", [
                                'has_status' => $hasStatus,
                                'has_delivery_date' => $hasDeliveryDate,
                                'has_instructions' => $hasInstructions,
                            ]);
                        }
                    } catch (Exception $saveEx) {
                        // Log but continue marking others
                        Log::error("Failed to update order {$order->id}: " . $saveEx->getMessage());
                    }
                }

                Log::info("✓ Successfully batch updated spreadsheet {$spreadsheetId}", [
                    'fully_processed' => $fullyProcessedCount,
                    'partially_processed' => $partiallyProcessedCount,
                    'total_sheets' => count($ordersBySheetName)
                ]);

                // Return only the count of fully processed orders
                return $fullyProcessedCount;

            } catch (Exception $batchError) {
                $msg = $batchError->getMessage();
                $errorCode = method_exists($batchError, 'getCode') ? $batchError->getCode() : 0;

                // Rate limit / quota handling: don't mark orders, they will retry later
                if ($errorCode == 429 ||
                    str_contains($msg, '429') ||
                    str_contains($msg, 'Rate Limit') ||
                    str_contains($msg, 'Too Many Requests') ||
                    str_contains($msg, 'Quota exceeded') ||
                    str_contains($msg, 'rateLimitExceeded')) {

                    Log::warning("⚠ Quota/Rate limit (429) for spreadsheet {$spreadsheetId}. Orders will retry later.", [
                        'affected_orders' => count($allProcessedOrders),
                        'order_ids' => collect($allProcessedOrders)->pluck('id')->toArray(),
                        'error_code' => $errorCode,
                        'error_message' => $msg
                    ]);

                    // Don't mark orders; they still have updated_at set and will be retried.
                    sleep(120); // pause a bit before next spreadsheet/run
                    return 0;
                }

                // Other errors: log and do not mark orders
                Log::error("✗ Error updating spreadsheet {$spreadsheetId}. Orders will retry later.", [
                    'message' => $msg,
                    'error_code' => $errorCode,
                    'affected_orders' => count($allProcessedOrders),
                    'order_ids' => collect($allProcessedOrders)->pluck('id')->toArray(),
                ]);

                return 0;
            }

        } catch (Exception $e) {
            // General spreadsheet-level exceptions (e.g., spreadsheet not accessible)
            Log::error("✗ Error processing spreadsheet {$spreadsheetId}", [
                'message' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            // Orders are not marked and will be retried later
            return 0;
        }
    }

    /**
     * Prepare batch data and list of processed orders for a given sheet within a spreadsheet.
     *
     * @param Google_Service_Sheets $service
     * @param string $spreadsheetId
     * @param string $sheetName
     * @param \Illuminate\Support\Collection $sheetOrders
     * @return array ['batch_data' => array, 'processed_orders' => array]
     */
    private function prepareSheetBatchData($service, $spreadsheetId, $sheetName, $sheetOrders)
    {
        $escapedSheetName = str_replace("'", "''", $sheetName);
        $quotedSheetName = "'{$escapedSheetName}'";

        // Determine column layout
        $isSpecialSheet = ($spreadsheetId === $this->specialSheetId);
        $orderNoColumn = $isSpecialSheet ? 'N' : 'B';

        // Fetch all order numbers from this sheet in ONE call
        $range = "{$quotedSheetName}!{$orderNoColumn}:{$orderNoColumn}";
        $response = $service->spreadsheets_values->get($spreadsheetId, $range);
        $existingValues = $response->getValues() ?? [];

        // Build lookup map: order_no => row_index
        $orderRowMap = [];
        foreach ($existingValues as $i => $row) {
            if (isset($row[0]) && trim($row[0]) !== '') {
                $orderRowMap[trim($row[0])] = $i + 1;
            }
        }

        Log::info("Found " . count($orderRowMap) . " existing orders in sheet '{$sheetName}'");

        // Prepare batch data for this sheet
        $batchData = [];
        $processedOrders = [];

        foreach ($sheetOrders as $sheetOrder) {
            $rowValues = $this->buildRowData($sheetOrder, $isSpecialSheet);
            $rowIndex = $orderRowMap[$sheetOrder->order_no] ?? null;

            if ($rowIndex) {
                // UPDATE existing row
                $updateRange = "{$quotedSheetName}!A{$rowIndex}:R{$rowIndex}";

                $batchData[] = new Google_Service_Sheets_ValueRange([
                    'range' => $updateRange,
                    'majorDimension' => 'ROWS',
                    'values' => [$rowValues],
                ]);

                Log::debug("  → Update Order #{$sheetOrder->order_no} at row {$rowIndex}", [
                    'status' => $sheetOrder->status,
                    'delivery_date' => $sheetOrder->delivery_date,
                    'instructions' => $sheetOrder->instructions
                ]);
            } else {
                // INSERT new row (append)
                $batchData[] = new Google_Service_Sheets_ValueRange([
                    'range' => "{$quotedSheetName}!A:R",
                    'majorDimension' => 'ROWS',
                    'values' => [$rowValues],
                ]);

                Log::debug("  → Insert Order #{$sheetOrder->order_no} as new row");
            }

            $processedOrders[] = $sheetOrder;
        }

        return [
            'batch_data' => $batchData,
            'processed_orders' => $processedOrders,
        ];
    }

    /**
     * Build the row array for a given SheetOrder depending on layout.
     *
     * @param \App\Models\SheetOrder $sheetOrder
     * @param bool $isSpecialSheet
     * @return array
     */
    private function buildRowData($sheetOrder, $isSpecialSheet)
    {
        // Format dates consistently
        $orderDate = $sheetOrder->order_date
            ? Carbon::parse($sheetOrder->order_date)->format('Y-m-d')
            : '';
        $deliveryDate = $sheetOrder->delivery_date
            ? Carbon::parse($sheetOrder->delivery_date)->format('Y-m-d')
            : '';

        // Ensure all values are strings, never null
        $status = (string)($sheetOrder->status ?? '');
        $instructions = (string)($sheetOrder->instructions ?? '');

        if ($isSpecialSheet) {
            // Special sheet layout: Order No in column N
            $row = [
                (string)$orderDate,                                            // A - Order Date
                (string)($sheetOrder->client_name ?? ''),                      // B - Client Name
                (string)($sheetOrder->address ?? ''),                          // C - Address
                (string)($sheetOrder->city ?? ''),                             // D - City
                (string)($sheetOrder->phone ?? ''),                            // E - Phone
                (string)($sheetOrder->product_name ?? ''),                     // F - Product
                (string)($sheetOrder->amount ?? ''),                           // G - Amount
                (string)($sheetOrder->quantity ?? ''),                         // H - Quantity
                $status,                                                       // I - Status
                ($status === 'Delivered') ? (string)$deliveryDate : '',        // J - Delivered Date
                '',                                                            // K - Empty
                $instructions,                                                 // L - Instructions
                (string)($sheetOrder->cc_email ?? ''),                         // M - CC Email
                (string)($sheetOrder->order_no ?? ''),                         // N - Order No
                (string)($sheetOrder->merchant ?? ''),                         // O - Merchant
                (string)($sheetOrder->code ?? ''),                             // P - Code
                ($status !== 'Delivered') ? (string)$deliveryDate : '',        // Q - Pending Delivery
                (string)($sheetOrder->agent ?? ''),                            // R - Agent
            ];
        } else {
            // Regular sheet layout: Order No in column B
            $row = [
                (string)$orderDate,                      // A - Order Date
                (string)($sheetOrder->order_no ?? ''),   // B - Order No
                (string)($sheetOrder->amount ?? ''),     // C - Amount
                (string)($sheetOrder->client_name ?? ''),// D - Client Name
                (string)($sheetOrder->address ?? ''),    // E - Address
                (string)($sheetOrder->phone ?? ''),      // F - Phone
                (string)($sheetOrder->alt_no ?? ''),     // G - Alt Phone
                (string)($sheetOrder->country ?? ''),    // H - Country
                (string)($sheetOrder->city ?? ''),       // I - City
                (string)($sheetOrder->product_name ?? ''),// J - Product
                (string)($sheetOrder->quantity ?? ''),   // K - Quantity
                $status,                                 // L - Status
                (string)$deliveryDate,                   // M - Delivery Date
                (string)($sheetOrder->agent ?? ''),      // N - Agent
                $instructions,                           // O - Instructions
                (string)($sheetOrder->cc_email ?? ''),   // P - CC Email
                (string)($sheetOrder->merchant ?? ''),   // Q - Merchant
                (string)($sheetOrder->code ?? ''),       // R - Code
            ];
        }

        // Log for debugging
        Log::debug("Built row data for Order #{$sheetOrder->order_no}", [
            'is_special_sheet' => $isSpecialSheet,
            'status_column' => $isSpecialSheet ? 'I' : 'L',
            'status_value' => $status,
            'instructions_column' => $isSpecialSheet ? 'L' : 'O',
            'instructions_value' => $instructions,
        ]);

        return $row;
    }
}
