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

class ProcessSyncedOrders extends Command
{
    protected $signature = 'orders:process-synced';
    protected $description = 'Process orders that have been synced to Google Sheets (processed = 2)';

    private $specialSheetId = '1x1Rntb-_BbXe5gvWIKN3Zr2Tnbyi9rSmbaieYzUryzU';

    public function __construct()
    {
        parent::__construct();
    }

    public function handle()
    {
        $lock = Cache::lock('process-synced-orders-lock', 300);

        if ($lock->get()) {
            try {
                // Fetch records where processed = 2
                $sheetOrders = SheetOrder::where('processed', 2)
                    ->limit(80)
                    ->get();

                if ($sheetOrders->isEmpty()) {
                    Log::info('No synced sheet orders found to process.');
                    return 0;
                }

                Log::info("Found " . $sheetOrders->count() . " synced orders to process");

                // Google Sheets API setup
                $client = new Google_Client();
                $client->setAuthConfig(storage_path('project-423911-84ac0fbdde59.json'));
                $client->addScope(Google_Service_Sheets::SPREADSHEETS);
                $service = new Google_Service_Sheets($client);

                // Group orders by spreadsheet ID (sheet_id)
                $ordersBySpreadsheet = $sheetOrders->groupBy('sheet_id');

                Log::info("Processing " . count($ordersBySpreadsheet) . " spreadsheets with " . $sheetOrders->count() . " total orders");

                foreach ($ordersBySpreadsheet as $spreadsheetId => $orders) {
                    $this->processSpreadsheet($service, $spreadsheetId, $orders);
                    
                    // Small delay between spreadsheets to respect quota
                    sleep(1);
                }

            } catch (\Exception $e) {
                Log::error('Error initializing Google API client', ['message' => $e->getMessage()]);
            } finally {
                $lock->release();
            }
        } else {
            Log::info('ProcessSyncedOrders command skipped to avoid overlap.');
        }

        return 0;
    }

    private function processSpreadsheet($service, $spreadsheetId, $orders)
    {
        try {
            Log::info("Processing spreadsheet: {$spreadsheetId} with " . count($orders) . " orders");

            // Verify spreadsheet exists and get available sheets
            $spreadsheet = $service->spreadsheets->get($spreadsheetId);
            $sheets = $spreadsheet->getSheets();
            $availableSheets = [];
            
            foreach ($sheets as $sheet) {
                $availableSheets[] = $sheet->getProperties()->getTitle();
            }

            // Group orders by sheet_name within this spreadsheet
            $ordersBySheetName = $orders->groupBy('sheet_name');

            // Collect all batch updates for this spreadsheet
            $allBatchData = [];
            $allProcessedOrders = [];

            foreach ($ordersBySheetName as $sheetName => $sheetOrders) {
                // Verify sheet exists
                if (!in_array($sheetName, $availableSheets)) {
                    Log::error("Sheet '{$sheetName}' not found in spreadsheet {$spreadsheetId}", [
                        'available_sheets' => $availableSheets,
                        'order_count' => count($sheetOrders),
                    ]);
                    continue;
                }

                Log::info("Processing sheet: {$sheetName} with " . count($sheetOrders) . " orders");

                // Process this sheet and collect batch data
                $result = $this->prepareSheetBatchData(
                    $service, 
                    $spreadsheetId, 
                    $sheetName, 
                    $sheetOrders
                );

                $allBatchData = array_merge($allBatchData, $result['batch_data']);
                $allProcessedOrders = array_merge($allProcessedOrders, $result['processed_orders']);
            }

            // Execute ONE batch update for entire spreadsheet
            if (!empty($allBatchData)) {
                $batchUpdateRequest = new Google_Service_Sheets_BatchUpdateValuesRequest([
                    'valueInputOption' => 'RAW',
                    'data' => $allBatchData,
                ]);

                $service->spreadsheets_values->batchUpdate($spreadsheetId, $batchUpdateRequest);

                // Update processed status to 3 (or whatever next status you need)
            foreach ($allProcessedOrders as $order) {
    $order->processed = 3;
    $order->timestamps = false;
    $order->save();
}

                Log::info("✓ Successfully processed " . count($allProcessedOrders) . " synced orders across " . count($ordersBySheetName) . " sheets in spreadsheet {$spreadsheetId}");
            }

        } catch (\Exception $e) {
            $msg = $e->getMessage();

            if (str_contains($msg, 'Rate Limit') || str_contains($msg, 'Too Many Requests')) {
                Log::warning("⚠ Quota reached for spreadsheet {$spreadsheetId}. Waiting 2 minutes...");
                sleep(120);
            } else {
                Log::error("✗ Error processing spreadsheet {$spreadsheetId}", [
                    'message' => $msg,
                    'trace' => $e->getTraceAsString(),
                ]);
            }
        }
    }

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
                // UPDATE existing row - use exact range A{row}:R{row}
                $updateRange = "{$quotedSheetName}!A{$rowIndex}:R{$rowIndex}";
                $batchData[] = new Google_Service_Sheets_ValueRange([
                    'range' => $updateRange,
                    'majorDimension' => 'ROWS',
                    'values' => [$rowValues],
                ]);
                Log::debug("  → Update Order #{$sheetOrder->order_no} at row {$rowIndex}");
            } else {
                // INSERT new row - append to the sheet
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

    private function buildRowData($sheetOrder, $isSpecialSheet)
    {
        // Format dates consistently
        $orderDate = $sheetOrder->order_date 
            ? Carbon::parse($sheetOrder->order_date)->format('Y-m-d') 
            : '';
        $deliveryDate = $sheetOrder->delivery_date 
            ? Carbon::parse($sheetOrder->delivery_date)->format('Y-m-d') 
            : '';

        if ($isSpecialSheet) {
            // Special sheet layout: Order No in column N
            return [
                $orderDate,                                                    // A - Order Date
                $sheetOrder->client_name ?? '',                                // B - Client Name
                $sheetOrder->address ?? '',                                    // C - Address
                $sheetOrder->city ?? '',                                       // D - City
                $sheetOrder->phone ?? '',                                      // E - Phone
                $sheetOrder->product_name ?? '',                               // F - Product
                $sheetOrder->amount ?? '',                                     // G - Amount
                $sheetOrder->quantity ?? '',                                   // H - Quantity
                $sheetOrder->status ?? '',                                     // I - Status
                ($sheetOrder->status === 'Delivered') ? $deliveryDate : '',   // J - Delivered Date
                '',                                                            // K - Empty
                $sheetOrder->instructions ?? '',                               // L - Instructions
                $sheetOrder->cc_email ?? '',                                   // M - CC Email
                $sheetOrder->order_no ?? '',                                   // N - Order No
                $sheetOrder->merchant ?? '',                                   // O - Merchant
                $sheetOrder->code ?? '',                                       // P - Code
                ($sheetOrder->status !== 'Delivered') ? $deliveryDate : '',   // Q - Pending Delivery
                $sheetOrder->agent ?? '',                                      // R - Agent
            ];
        } else {
            // Regular sheet layout: Order No in column B
            return [
                $orderDate,                      // A - Order Date
                $sheetOrder->order_no ?? '',     // B - Order No
                $sheetOrder->amount ?? '',       // C - Amount
                $sheetOrder->client_name ?? '',  // D - Client Name
                $sheetOrder->address ?? '',      // E - Address
                $sheetOrder->phone ?? '',        // F - Phone
                $sheetOrder->alt_no ?? '',       // G - Alt Phone
                $sheetOrder->country ?? '',      // H - Country
                $sheetOrder->city ?? '',         // I - City
                $sheetOrder->product_name ?? '', // J - Product
                $sheetOrder->quantity ?? '',     // K - Quantity
                $sheetOrder->status ?? '',       // L - Status
                $deliveryDate,                   // M - Delivery Date
                $sheetOrder->agent ?? '',        // N - Agent
                $sheetOrder->instructions ?? '', // O - Instructions
                $sheetOrder->cc_email ?? '',     // P - CC Email
                $sheetOrder->merchant ?? '',     // Q - Merchant
                $sheetOrder->code ?? '',         // R - Code
            ];
        }
    }
}