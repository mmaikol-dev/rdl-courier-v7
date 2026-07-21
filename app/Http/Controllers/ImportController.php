<?php

namespace App\Http\Controllers;

use App\Models\Sheet;
use App\Models\SheetOrder;
use App\Services\ProductAutoMatchService;
use App\Support\CountryAccess;
use Illuminate\Http\Request;
use Inertia\Inertia;

class ImportController extends Controller
{
    public function __construct(
        private readonly ProductAutoMatchService $autoMatch = new ProductAutoMatchService,
    ) {}

    public function index(Request $request)
    {
        $sheets = CountryAccess::scopeByCountryName(
            Sheet::select('id', 'sheet_id', 'sheet_name', 'store_name', 'country'),
            $request->user()?->loadMissing('country')
        )->get();

        return Inertia::render('import/index', [
            'sheets' => $sheets,
        ]);
    }

    public function store(Request $request)
    {
        $user = $request->user()?->loadMissing('country');
        $request->validate([
            'file' => 'required|file|mimes:csv,txt,xlsx,xls',
            'sheet_id' => 'required|string',
            'sheet_name' => 'required|string',
            'store_name' => 'required|string',
            'country' => 'required|string',
            'merchant' => 'required|string',
        ]);

        $countryName = CountryAccess::resolveCountryNameForWrite($user, $request->country);

        if (! $countryName) {
            return response()->json(['message' => 'No country assigned to the current user.'], 422);
        }

        $file = $request->file('file');
        $path = $file->getRealPath();

        $created = 0;
        $updated = 0;

        // Open CSV file
        if (($handle = fopen($path, 'r')) !== false) {
            $header = fgetcsv($handle, 0, ','); // read first row as header

            // Build case-insensitive name → index map from the header row
            $headerMap = [];
            foreach (($header ?: []) as $i => $colName) {
                $headerMap[strtolower(trim($colName))] = $i;
            }

            // If 'order_no' is present in the header we treat this as a named CSV.
            // In named mode we look up columns by name only — no positional fallback —
            // so a partially-renamed/reordered file cannot silently import wrong values.
            // If 'order_no' is absent the file is treated as headerless (positional mode).
            $isNamedCsv = isset($headerMap['order_no']);

            $col = function (string $name, int $positionalFallback, $default = null) use (&$row, $headerMap, $isNamedCsv) {
                if ($isNamedCsv) {
                    $idx = $headerMap[strtolower($name)] ?? null;

                    return $idx !== null ? ($row[$idx] ?? $default) : $default;
                }

                return $row[$positionalFallback] ?? $default;
            };

            // Helper: convert empty string to null date
            $cleanDate = function ($value) {
                return ! empty($value) ? date('Y-m-d', strtotime($value)) : null;
            };

            while (($row = fgetcsv($handle, 0, ',')) !== false) {
                // Find existing order by order_no + merchant + sheet_id
                $existingOrder = SheetOrder::where('order_no', $col('order_no', 1))
                    ->where('merchant', $request->merchant)
                    ->where('sheet_id', $request->sheet_id)
                    ->where('country', $countryName)
                    ->first();

                $data = [
                    'order_date' => $cleanDate($col('order_date', 0)),
                    'order_no' => $col('order_no', 1, 'error'),
                    'amount' => ! empty($col('amount', 2)) ? (float) $col('amount', 2) : null,
                    'client_name' => $col('client_name', 3),
                    'address' => $col('address', 4),
                    'phone' => $col('phone', 5),
                    'alt_no' => $col('alt_no', 6),
                    'country' => $countryName,
                    'city' => $col('city', 8),
                    'product_name' => $col('product_name', 9),
                    'quantity' => ! empty($col('quantity', 10)) ? (int) $col('quantity', 10) : null,
                    'status' => $col('status', 11),
                    'delivery_date' => $cleanDate($col('delivery_date', 12)),
                    'agent' => $col('agent', 13),
                    'instructions' => $col('instructions', 14),
                    'cc_email' => $col('cc_email', 15),
                    'merchant' => $request->merchant,
                    'code' => $col('code', 17),
                    'order_type' => 'imported',
                    'sheet_id' => $request->sheet_id,
                    'sheet_name' => $request->sheet_name,
                    'updated_at' => null, // force NULL always
                ];

                if ($existingOrder) {
                    // Keep imported rows out of the update sync queue.
                    SheetOrder::withoutTimestamps(function () use ($existingOrder, $data): void {
                        $existingOrder->forceFill($data)->save();
                    });
                    $this->autoMatch->applyMatches($existingOrder, $this->autoMatch->match($existingOrder));
                    $updated++;
                } else {
                    // New imported rows keep created_at but always leave updated_at null.
                    SheetOrder::withoutTimestamps(function () use ($data): void {
                        SheetOrder::create([
                            ...$data,
                            'created_at' => now(),
                            'updated_at' => null,
                        ]);
                    });
                    $sheetOrder = SheetOrder::where('order_no', $data['order_no'])
                        ->where('sheet_id', $request->sheet_id)
                        ->first();
                    if ($sheetOrder) {
                        $this->autoMatch->applyMatches($sheetOrder, $this->autoMatch->match($sheetOrder));
                    }
                    $created++;
                }
            }

            fclose($handle);
        }

        return response()->json([
            'message' => "Import complete: {$created} created, {$updated} updated.",
            'created' => $created,
            'updated' => $updated,
        ]);
    }
}
