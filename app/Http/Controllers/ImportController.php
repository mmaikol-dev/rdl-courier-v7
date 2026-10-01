<?php

namespace App\Http\Controllers;

use App\Models\Sheet;
use App\Models\SheetOrder;
use App\Services\ProductAutoMatchService;
use App\Support\CountryAccess;
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
    ) {}

    public function index(Request $request)
    {
        $user = $request->user()?->loadMissing('country');

        $sheetsQuery = CountryAccess::scopeByCountryName(
            Sheet::select('id', 'sheet_id', 'sheet_name', 'store_name', 'country'),
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
            'sheets' => $sheetsQuery->get(),
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

        // Helper: convert empty string to null date
        $cleanDate = function ($value) {
            return ! empty($value) ? date('Y-m-d', strtotime($value)) : null;
        };

        $isHeaderRow = true;

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

            // Find existing order by order_no + merchant + sheet_id
            $existingOrder = SheetOrder::where('order_no', $col('order_no', 1))
                ->where('merchant', $request->merchant)
                ->where('sheet_id', $request->sheet_id)
                ->where('country', $countryName)
                ->first();

            $quantity = $this->parseDecimal($col('quantity', 10));

            $data = [
                'order_date' => $cleanDate($col('order_date', 0)),
                'order_no' => $col('order_no', 1, 'error'),
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

        return response()->json([
            'message' => "Import complete: {$created} created, {$updated} updated.",
            'created' => $created,
            'updated' => $updated,
        ]);
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
     * Excel/CSV cells are frequently text-formatted, so values arrive as
     * "4,399.00", "KES 4,399.00" or "(1,250.50)" for accounting negatives. A plain
     * (float) cast silently truncates all of those (4,399.00 becomes 4.0), so the
     * separators and currency noise are stripped first.
     *
     * Returns null when the cell holds no number at all, so genuine blanks are not
     * confused with a zero-value order.
     */
    private function parseDecimal(mixed $value): ?float
    {
        if ($value === null || is_bool($value) || is_array($value) || is_object($value)) {
            return null;
        }

        if (is_int($value) || is_float($value)) {
            return (float) $value;
        }

        // Normalise the various space characters spreadsheets use for thousands.
        $raw = str_replace(["\xC2\xA0", "\xE2\x80\xAF", "\xE2\x80\x89"], ' ', (string) $value);
        $raw = trim($raw);

        if ($raw === '') {
            return null;
        }

        $negative = false;

        // Accounting negatives: (1,250.50)
        if (preg_match('/^\((.*)\)$/s', $raw, $matches) === 1) {
            $negative = true;
            $raw = trim($matches[1]);
        } elseif (str_ends_with($raw, '-')) {
            $negative = true;
            $raw = rtrim(substr($raw, 0, -1));
        }

        if (str_starts_with($raw, '-')) {
            $negative = !$negative;
        }

        // Keep only digits and separators — this drops currency codes and symbols.
        $clean = preg_replace('/[^0-9.,]/', '', $raw);

        if ($clean === null || trim($clean, '.,') === '') {
            return null;
        }

        $lastComma = strrpos($clean, ',');
        $lastDot = strrpos($clean, '.');
        $commaCount = substr_count($clean, ',');
        $dotCount = substr_count($clean, '.');

        if ($lastComma !== false && $lastDot !== false) {
            // Both present: whichever comes last is the decimal separator.
            $decimal = $lastComma > $lastDot ? ',' : '.';
            $thousands = $decimal === ',' ? '.' : ',';
            $clean = str_replace($thousands, '', $clean);
            $clean = str_replace($decimal, '.', $clean);
        } elseif ($commaCount > 1 || $dotCount > 1) {
            // Repeated separators of one kind are always thousands grouping.
            $clean = str_replace([',', '.'], '', $clean);
        } elseif ($lastComma !== false) {
            // A single comma is a decimal point only when exactly 1-2 digits follow it.
            $clean = preg_match('/^\d+,\d{1,2}$/', $clean) === 1
                ? str_replace(',', '.', $clean)
                : str_replace(',', '', $clean);
        }

        if (preg_match('/^\d+(\.\d+)?$/', $clean) !== 1) {
            return null;
        }

        return ($negative ? -1 : 1) * (float) $clean;
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
