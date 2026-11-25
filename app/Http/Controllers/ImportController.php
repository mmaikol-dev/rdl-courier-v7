<?php

namespace App\Http\Controllers;

use App\Models\Sheet;
use App\Models\SheetOrder;
use App\Services\ProductAutoMatchService;
use App\Services\SheetOrderImportService;
use App\Support\CountryAccess;
use App\Support\SpreadsheetValue;
use DateTimeInterface;
use Generator;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Inertia\Inertia;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\RichText\RichText;

class ImportController extends Controller
{
    public function __construct(
        private readonly ProductAutoMatchService $autoMatch = new ProductAutoMatchService,
        private readonly SheetOrderImportService $sheetOrderImport = new SheetOrderImportService,
    ) {}

    public function index(Request $request)
    {
        $user = $request->user()?->loadMissing('country');

        $sheetsQuery = CountryAccess::scopeByCountryName(
            Sheet::select('id', 'sheet_id', 'sheet_name', 'store_name', 'country', 'auto_pickup_tabs'),
            $user
        );

        // Merchants may only import against sheets belonging to them.
        if (strtolower(trim((string) ($user?->roles ?? ''))) === 'merchant') {
            $names = array_values(array_unique(array_filter([
                mb_strtolower(trim((string) $user->name)),
                mb_strtolower(trim((string) $user->username)),
            ])));

            $sheetsQuery->where(function ($q) use ($names) {
                foreach ($names as $name) {
                    $q->orWhereRaw('LOWER(TRIM(sheet_name)) = ?', [$name]);
                }
            });
        }

        return Inertia::render('import/index', [
            'sheets' => Inertia::defer(fn () => $sheetsQuery->get()),
            'userCountry' => CountryAccess::userCountryName($user),
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
            'generated_order_numbers' => 'nullable|string',
        ]);

        // Merchants may only import against their own sheet, regardless of what the
        // request body claims, and the country always comes from that sheet
        // (merchants legitimately trade across countries). Resolve server-side.
        if (strtolower(trim((string) ($user?->roles ?? ''))) === 'merchant') {
            $ownSheets = Sheet::where(function ($q) use ($user) {
                foreach (array_unique(array_filter([
                    mb_strtolower(trim((string) $user->name)),
                    mb_strtolower(trim((string) $user->username)),
                ])) as $name) {
                    $q->orWhereRaw('LOWER(TRIM(sheet_name)) = ?', [$name]);
                }
            })->get();

            if ($ownSheets->isEmpty()) {
                return response()->json(['message' => 'No merchant sheet is linked to your account.'], 422);
            }

            // Merchants can hold several sheets, so honour their pick when it is one of
            // their own; otherwise fall back to their first.
            $ownSheet = $ownSheets->firstWhere(
                fn ($sheet) => (string) $sheet->sheet_id === (string) $request->input('sheet_id')
            ) ?? $ownSheets->first();

            $request->merge([
                'sheet_id' => $ownSheet->sheet_id,
                'store_name' => $ownSheet->store_name,
                'merchant' => $ownSheet->sheet_name,
                'country' => $ownSheet->country,
            ]);
        }

        $countryName = CountryAccess::resolveCountryNameForWrite($user, $request->country);

        if (! $countryName) {
            return response()->json(['message' => 'No country assigned to the current user.'], 422);
        }

        $sourceSheet = Sheet::query()->where('sheet_id', $request->sheet_id)->first();

        $file = $request->file('file');

        $created = 0;
        $updated = 0;

        $headerMap = [];
        $isNamedCsv = false;
        $row = [];

        // Captured by reference: the header is parsed on the first iteration, so these
        // are still empty/false at this point and must not be frozen into the closure.
        $col = function (string $name, int $positionalFallback, $default = null) use (&$row, &$headerMap, &$isNamedCsv) {
            if ($isNamedCsv) {
                $idx = $headerMap[strtolower($name)] ?? null;

                return $idx !== null ? ($row[$idx] ?? $default) : $default;
            }

            return $row[$positionalFallback] ?? $default;
        };

        // Helper: parse a date cell strictly so an unreadable value becomes null
        // instead of being coerced by strtotime() into 1970-01-01.
        $cleanDate = function ($value) {
            return SpreadsheetValue::date($value);
        };

        $isHeaderRow = true;
        $generatedOrderNumbers = json_decode((string) $request->input('generated_order_numbers', '[]'), true);
        $generatedOrderNumbers = is_array($generatedOrderNumbers)
            ? array_values(array_filter($generatedOrderNumbers, static fn ($item): bool => is_array($item) && isset($item['target'])))
            : [];
        $reservedGeneratedOrderNumbers = [];
        $importedRowIndex = 0;

        // Header first, then one row per record — identical for CSV and Excel.
        foreach ($this->rowsFromUpload($file) as $row) {
            if ($isHeaderRow) {
                $isHeaderRow = false;

                // Build case-insensitive name → index map from the header row
                foreach ($row as $i => $colName) {
                    $headerMap[$this->normaliseHeaderName($colName)] = $i;
                }

                // If 'order_no' is present in the header we treat this as a named file.
                // In named mode we look up columns by name only — no positional fallback —
                // so a partially-renamed/reordered file cannot silently import wrong values.
                // If 'order_no' is absent the file is treated as headerless (positional mode).
                $isNamedCsv = isset($headerMap['order_no']);

                continue;
            }

            $orderNo = (string) $col('order_no', 1);
            $orderChange = $generatedOrderNumbers[$importedRowIndex++] ?? null;
            $isGeneratedOrderNumber = is_array($orderChange) && (string) ($orderChange['target'] ?? '') === $orderNo;
            $sourceOrderNo = $isGeneratedOrderNumber ? trim((string) ($orderChange['source'] ?? '')) : '';
            $findScopedOrder = fn (string $number) => SheetOrder::where('order_no', $number)
                ->where('merchant', $request->merchant)
                ->where('sheet_id', $request->sheet_id)
                ->where('country', $countryName)->first();
            $existingOrder = null;

            if ($isGeneratedOrderNumber) {
                $existingSourceOrder = $sourceOrderNo !== '' && strcasecmp($sourceOrderNo, $orderNo) !== 0
                    ? $findScopedOrder($sourceOrderNo)
                    : null;
                $existingTargetOrder = $findScopedOrder($orderNo);

                if ($existingSourceOrder) {
                    $existingOrder = $existingSourceOrder;
                    $orderNo = $this->nextAvailableGeneratedOrderNumber($orderNo, $reservedGeneratedOrderNumbers);
                } elseif ($existingTargetOrder && isset($reservedGeneratedOrderNumbers[strtolower($orderNo)])) {
                    $orderNo = $this->nextAvailableGeneratedOrderNumber($orderNo, $reservedGeneratedOrderNumbers);
                    $existingOrder = $findScopedOrder($orderNo);
                } elseif ($existingTargetOrder) {
                    $existingOrder = $existingTargetOrder;
                } else {
                    $orderNo = $this->nextAvailableGeneratedOrderNumber($orderNo, $reservedGeneratedOrderNumbers);
                    $existingOrder = $findScopedOrder($orderNo);
                }
            } else {
                $existingOrder = $findScopedOrder($orderNo);
            }

            $quantity = $this->parseDecimal($col('quantity', 10));
            $importedOrderDate = $cleanDate($col('order_date', 0));

            $data = [
                // Fall back to the upload date when the file leaves it blank.
                'order_date' => $importedOrderDate ?? now()->toDateString(),
                'order_no' => $orderNo,
                'amount' => $this->parseDecimal($col('amount', 2)),
                'client_name' => $col('client_name', 3),
                'address' => $col('address', 4),
                'phone' => $col('phone', 5),
                'alt_no' => $col('alt_no', 6),
                'country' => $countryName,
                'city' => $col('city', 8),
                'product_name' => $col('product_name', 9),
                'quantity' => $quantity === null ? null : (int) round($quantity),
                'status' => $col('status', 11),
                'delivery_date' => $cleanDate($col('delivery_date', 12)),
                'agent' => $col('agent', 13),
                'instructions' => $col('instructions', 14),
                'cc_email' => $this->sheetOrderImport->resolveCcEmail($sourceSheet, [
                    'sheet_id' => $request->sheet_id,
                    'sheet_name' => $request->sheet_name,
                ]),
                'merchant' => $request->merchant,
                'code' => $col('code', 17),
                'order_type' => 'imported',
                'sheet_id' => $request->sheet_id,
                'sheet_name' => $request->sheet_name,
                'updated_at' => null, // force NULL always
            ];

            if ($existingOrder) {
                if ($isNamedCsv) {
                    foreach ([
                        'order_date',
                        'amount',
                        'client_name',
                        'address',
                        'phone',
                        'alt_no',
                        'city',
                        'product_name',
                        'quantity',
                        'status',
                        'delivery_date',
                        'agent',
                        'instructions',
                        'code',
                    ] as $field) {
                        if (! array_key_exists($field, $headerMap)) {
                            unset($data[$field]);
                        }
                    }
                }

                // Keep an existing order date when the incoming cell is blank
                // rather than replacing it with the upload date.
                if ($importedOrderDate === null && $existingOrder->order_date !== null) {
                    unset($data['order_date']);
                }

                // Keep imported rows out of the update sync queue.
                SheetOrder::withoutEditTracking(fn () => SheetOrder::withoutTimestamps(function () use ($existingOrder, $data): void {
                    $existingOrder->forceFill($data)->save();
                }));
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

        return response()->json([
            'message' => "Import complete: {$created} created, {$updated} updated.",
            'created' => $created,
            'updated' => $updated,
        ]);
    }

    /**
     * Keep auto-generated import numbers unique. If a candidate is already in
     * use, advance its numeric suffix until a free value is found.
     *
     * @param  array<string, bool>  $reserved
     */
    private function nextAvailableGeneratedOrderNumber(string $candidate, array &$reserved): string
    {
        if (! preg_match('/^([A-Z0-9]+?)(\d+)$/i', $candidate, $matches)) {
            return $candidate;
        }

        $prefix = $matches[1];
        $number = (int) $matches[2];

        $candidate = $prefix.$number;
        do {
            $candidate = $prefix.$number;
            $normalized = strtolower($candidate);
            $exists = isset($reserved[$normalized]) || SheetOrder::query()
                ->whereRaw('LOWER(order_no) = ?', [$normalized])
                ->exists();
            $number++;
        } while ($exists);

        $reserved[$normalized] = true;

        return $candidate;
    }

    /**
     * Yield the rows of an uploaded CSV/TXT/XLS/XLSX file as plain arrays, header
     * row first. Excel files are binary archives, so they must be decoded rather
     * than parsed as CSV — reading an .xlsx with fgetcsv() yields invalid UTF-8.
     */
    private function rowsFromUpload(UploadedFile $file): Generator
    {
        $path = $file->getRealPath();

        $extension = strtolower((string) ($file->getClientOriginalExtension() ?: $file->guessExtension()));

        if (in_array($extension, ['xlsx', 'xls', 'xlsm', 'xltx', 'xlsb'], true)) {
            yield from $this->spreadsheetRows($path);

            return;
        }

        $handle = fopen($path, 'r');

        if ($handle === false) {
            return;
        }

        try {
            while (($row = fgetcsv($handle, 0, ',')) !== false) {
                yield $row;
            }
        } finally {
            fclose($handle);
        }
    }

    /**
     * Parse a number out of a spreadsheet cell.
     *
     * Delegates to the shared parser so uploaded files and Google Sheets cells
     * are read identically — see SpreadsheetValue::decimal() for the formats it
     * handles.
     */
    private function parseDecimal(mixed $value): ?float
    {
        return SpreadsheetValue::decimal($value);
    }

    /**
     * @return Generator<int, array<int, mixed>>
     */
    private function spreadsheetRows(string $path): Generator
    {
        $spreadsheet = IOFactory::load($path);

        try {
            $sheet = $spreadsheet->getSheet(0);
            $highestRow = $sheet->getHighestRow();
            $highestColumn = Coordinate::columnIndexFromString($sheet->getHighestColumn());

            for ($rowIndex = 1; $rowIndex <= $highestRow; $rowIndex++) {
                $row = [];

                for ($colIndex = 1; $colIndex <= $highestColumn; $colIndex++) {
                    $row[] = $this->normaliseCellValue(
                        $sheet->getCell(Coordinate::stringFromColumnIndex($colIndex) . $rowIndex)->getValue()
                    );
                }

                yield $row;
            }
        } finally {
            $spreadsheet->disconnectWorksheets();
            unset($spreadsheet);
        }
    }

    /**
     * Flatten the cell types Excel returns into scalars the row mapper can use.
     */
    private function normaliseCellValue(mixed $value): mixed
    {
        if ($value instanceof DateTimeInterface) {
            return $value->format('Y-m-d');
        }

        if ($value instanceof RichText) {
            return $value->getPlainText();
        }

        return $value;
    }

    /**
     * Header names are matched case-insensitively; strip any UTF-8 BOM and stray
     * whitespace so "Order No" and "﻿Order No" resolve to the same column.
     */
    private function normaliseHeaderName(mixed $value): string
    {
        return strtolower(trim(preg_replace('/^\xEF\xBB\xBF/', '', (string) $value) ?? ''));
    }
}
