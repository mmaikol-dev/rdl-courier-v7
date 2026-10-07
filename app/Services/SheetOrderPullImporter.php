<?php

namespace App\Services;

use App\Exceptions\SheetImportException;
use App\Jobs\ProcessIncomingSheetOrder;
use App\Models\IncomingSheetOrder;
use App\Models\Sheet;
use App\Models\SheetOrder;
use App\Support\SpreadsheetValue;
use Illuminate\Support\Facades\Log;

/**
 * Pulls new orders straight out of a merchant's Google Sheet.
 *
 * Two rules govern what gets taken, and both exist to stop the sheet from
 * fighting the database:
 *
 * 1. **Only blank-status rows.** A row that already carries a status has been
 *    triaged by someone, so it is never re-imported. This is also what makes the
 *    pull safely repeatable — nothing marks the sheet as consumed, so a second
 *    run simply sees the same rows as "existing" and moves on.
 * 2. **Never a duplicate order number.** Checked against `sheet_orders` (across
 *    every sheet, not just this one) *and* against the rest of the batch, so the
 *    same number appearing twice in one spreadsheet is imported once.
 *
 * Accepted rows are staged into `incoming_sheet_orders` and handed to
 * `ProcessIncomingSheetOrder` — the same durable, deduplicated, retrying path the
 * Apps Script and Storeep feeds use. That gives operator-visible retries at
 * /incoming-sheet-orders instead of a half-finished write if the queue dies
 * mid-run.
 */
class SheetOrderPullImporter
{
    /**
     * Rows read from a single tab. A tab larger than this is reported as
     * truncated rather than silently truncated.
     */
    private const MAX_ROWS_READ = 5000;

    /**
     * Orders staged per click. Keeps one mis-click from flooding the queue; the
     * run is resumable because rule 1 and rule 2 above make the next click pick
     * up exactly the rows this one left behind.
     */
    private const MAX_IMPORTS_PER_RUN = 1000;

    /**
     * Rejected rows reported back. The count is always accurate even when the
     * detail list is trimmed.
     */
    private const MAX_REPORTED_ERRORS = 50;

    /**
     * One spreadsheet has the order number in column N instead of B. Mirrors the
     * layout the outbound sync writes.
     */
    private const SPECIAL_SPREADSHEET_ID = '1x1Rntb-_BbXe5gvWIKN3Zr2Tnbyi9rSmbaieYzUryzU';

    /**
     * Regular layout, matching what the outbound sync writes.
     */
    private const REGULAR_LAYOUT = [
        'order_date' => 0, 'order_no' => 1, 'amount' => 2, 'client_name' => 3,
        'address' => 4, 'phone' => 5, 'alt_no' => 6, 'country' => 7, 'city' => 8,
        'product_name' => 9, 'quantity' => 10, 'status' => 11, 'delivery_date' => 12,
        'agent' => 13, 'instructions' => 14, 'cc_email' => 15, 'merchant' => 16, 'code' => 17,
    ];

    /**
     * Special layout. Column J carries the delivery date once an order is
     * Delivered and column Q carries it while it is still pending, so either may
     * hold the value.
     */
    private const SPECIAL_LAYOUT = [
        'order_date' => 0, 'client_name' => 1, 'address' => 2, 'city' => 3, 'phone' => 4,
        'product_name' => 5, 'amount' => 6, 'quantity' => 7, 'status' => 8,
        'delivered_date' => 9, 'instructions' => 11, 'cc_email' => 12, 'order_no' => 13,
        'merchant' => 14, 'code' => 15, 'pending_delivery' => 16, 'agent' => 17,
    ];

    /**
     * Accepted header spellings, normalised before matching. Merchant sheets are
     * hand-built, so "Order No", "ORDER_NO", "OrderNo" and "Order no." all mean
     * the same column.
     */
    private const HEADER_ALIASES = [
        'order_no' => ['order_no', 'orderno', 'order number', 'order', 'no', 'ref', 'reference'],
        'status' => ['status', 'order_status', 'orderstatus', 'state'],
        'amount' => ['amount', 'total', 'price'],
        'quantity' => ['quantity', 'qty', 'pieces', 'units'],
        'client_name' => ['client_name', 'clientname', 'client', 'name', 'customer', 'customer name'],
        'address' => ['address'],
        'phone' => ['phone', 'mobile', 'phone_number', 'phonenumber', 'contact'],
        'alt_no' => ['alt_no', 'altno', 'alt phone', 'alt_phone', 'alt', 'alternate phone'],
        'country' => ['country'],
        'city' => ['city', 'town'],
        'product_name' => ['product_name', 'productname', 'product', 'item', 'item_name', 'description'],
        'delivery_date' => ['delivery_date', 'deliverydate', 'delivery', 'delivery date', 'due_date', 'duedate'],
        'agent' => ['agent', 'dispatch_agent', 'rider', 'driver'],
        'instructions' => ['instructions', 'instruction', 'notes', 'note', 'remarks'],
        'cc_email' => ['cc_email', 'ccemail', 'cc email', 'cc'],
        'merchant' => ['merchant', 'store', 'shop'],
        'code' => ['code'],
        'order_date' => ['order_date', 'orderdate', 'order date', 'date'],
    ];

    /** @var array<string, string> normalised alias => field */
    private readonly array $headerLookup;

    public function __construct(
        private readonly GoogleSheetsReader $reader = new GoogleSheetsReader,
    ) {
        $lookup = [];

        foreach (self::HEADER_ALIASES as $field => $aliases) {
            foreach ($aliases as $alias) {
                $lookup[$this->normaliseHeader($alias)] = $field;
            }
        }

        $this->headerLookup = $lookup;
    }

    /**
     * Pull every eligible order out of one tab of one sheet.
     *
     * @return array<string, mixed> summary for the caller to surface
     *
     * @throws SheetImportException when the tab cannot be read or its layout is unsafe
     */
    public function import(Sheet $sheet, ?string $tab = null, ?int $maxImports = null): array
    {
        $spreadsheetId = trim((string) $sheet->sheet_id);

        if ($spreadsheetId === '') {
            throw new SheetImportException("Sheet [{$sheet->sheet_name}] has no spreadsheet ID configured.");
        }

        $tabs = $this->reader->tabNames($spreadsheetId);

        if ($tabs === []) {
            throw new SheetImportException("Spreadsheet for [{$sheet->sheet_name}] contains no tabs.");
        }

        $tabName = $this->resolveTab($tab, $sheet, $tabs);

        $rows = $this->reader->rows($spreadsheetId, $tabName, 'A:R', self::MAX_ROWS_READ);

        $summary = $this->blankSummary($tabName, count($rows) >= self::MAX_ROWS_READ);

        if ($rows === []) {
            return $summary;
        }

        $headerRowIndex = $this->detectHeaderRow($rows);

        if ($headerRowIndex === null && $this->hasPartialHeader($rows)) {
            throw new SheetImportException(
                'This tab has a header row but no column could be identified for the order number '
                .'and status. Rename the headers to include "Order No" and "Status", then try again. '
                .'Nothing was imported, because orders that already have a status cannot be told apart '
                .'from new ones.'
            );
        }

        $map = $headerRowIndex !== null
            ? $this->mapHeaderRow($rows[$headerRowIndex])
            : ($spreadsheetId === self::SPECIAL_SPREADSHEET_ID ? self::SPECIAL_LAYOUT : self::REGULAR_LAYOUT);

        $country = trim((string) ($sheet->country ?? '')) ?: null;

        [$candidates, $summary] = $this->collectRows(
            $rows,
            $map,
            $headerRowIndex,
            $sheet,
            $tabName,
            $country,
            $summary
        );

        // One query for the whole batch beats a lookup per row.
        $existing = $candidates === []
            ? []
            : SheetOrder::query()
                ->whereIn('order_no', array_column($candidates, 'order_no'))
                ->pluck('order_no')
                ->all();

        $existingLookup = array_fill_keys(array_map('strval', $existing), true);

        $importable = [];

        foreach ($candidates as $candidate) {
            if (isset($existingLookup[$candidate['order_no']])) {
                $summary['skipped']['existing_order']++;
                continue;
            }

            $importable[] = $candidate;
        }

        $limit = $maxImports !== null ? max(0, $maxImports) : self::MAX_IMPORTS_PER_RUN;
        $summary['remaining'] = max(0, count($importable) - $limit);
        $summary['skipped_total'] = array_sum($summary['skipped']);
        $summary['eligible'] = count($importable);

        foreach (array_slice($importable, 0, $limit) as $candidate) {
            $this->stage($sheet, $tabName, $candidate, $summary);
        }

        return $summary;
    }

    /**
     * Resolve the requested tab, falling back to the sheet's own tab name.
     *
     * @param  array<int, string>  $tabs
     */
    private function resolveTab(?string $requested, Sheet $sheet, array $tabs): string
    {
        $wanted = trim((string) ($requested ?: $sheet->sheet_name));

        if ($wanted === '') {
            return $tabs[0];
        }

        foreach ($tabs as $tab) {
            if (strcasecmp($tab, $wanted) === 0) {
                return $tab;
            }
        }

        throw new SheetImportException(
            "Tab [{$wanted}] was not found in the spreadsheet. Available tabs: ".implode(', ', $tabs)
        );
    }

    /**
     * First few rows may be preceded by a title or a blank spacer, so the header
     * is looked for rather than assumed to be row 1.
     *
     * @param  array<int, array<int, mixed>>  $rows
     */
    private function detectHeaderRow(array $rows): ?int
    {
        foreach (array_slice($rows, 0, 5, true) as $index => $row) {
            $map = $this->mapHeaderRow($row);

            if (isset($map['order_no'], $map['status'])) {
                return $index;
            }
        }

        return null;
    }

    /**
     * True when a header row is recognisable but incomplete. Importing anyway
     * would apply positional guesses on top of real column names, which is how
     * the wrong rows get imported.
     *
     * @param  array<int, array<int, mixed>>  $rows
     */
    private function hasPartialHeader(array $rows): bool
    {
        foreach (array_slice($rows, 0, 5) as $row) {
            $map = $this->mapHeaderRow($row);

            if ($map !== [] && (isset($map['order_no']) || isset($map['status']))) {
                return true;
            }
        }

        return false;
    }

    /**
     * Map header text to field names by normalised alias.
     *
     * @param  array<int, mixed>  $row
     * @return array<string, int>
     */
    private function mapHeaderRow(array $row): array
    {
        $map = [];

        foreach ($row as $index => $cell) {
            $key = $this->normaliseHeader(SpreadsheetValue::text($cell) ?? '');

            if ($key !== '' && isset($this->headerLookup[$key]) && ! isset($map[$this->headerLookup[$key]])) {
                $map[$this->headerLookup[$key]] = $index;
            }
        }

        return $map;
    }

    /**
     * Lowercase and collapse punctuation so "Order No.", "ORDER_NO" and
     * "order  no" all resolve to the same alias.
     */
    private function normaliseHeader(string $value): string
    {
        $normalised = preg_replace('/[^a-z0-9]+/', '_', mb_strtolower(trim($value))) ?? '';

        return trim($normalised, '_');
    }

    /**
     * Walk the data rows, applying the blank-status rule, per-batch duplicate
     * detection and field validation.
     *
     * @param  array<int, array<int, mixed>>  $rows
     * @param  array<string, int>  $map
     * @param  array<string, mixed>  $summary
     * @return array{0: array<int, array<string, mixed>>, 1: array<string, mixed>}
     */
    private function collectRows(
        array $rows,
        array $map,
        ?int $headerRowIndex,
        Sheet $sheet,
        string $tabName,
        ?string $country,
        array $summary
    ): array {
        $candidates = [];
        $seenInBatch = [];

        foreach ($rows as $rowIndex => $row) {
            // Everything at or above a detected header row is preamble — titles,
            // blank spacers, the header itself — never data.
            if ($headerRowIndex !== null && $rowIndex <= $headerRowIndex) {
                continue;
            }

            // Entirely blank spacer row.
            if (SpreadsheetValue::text(implode('', array_map('strval', $row))) === null) {
                continue;
            }

            $summary['scanned']++;

            $rowNumber = $rowIndex + 1;

            // Rule 1: a status means the row has already been triaged.
            $status = $this->cell($row, $map, 'status');

            if (SpreadsheetValue::text($status) !== null) {
                $summary['skipped']['has_status']++;
                continue;
            }

            $orderNo = SpreadsheetValue::text($this->cell($row, $map, 'order_no'));

            if ($orderNo === null) {
                $summary['skipped']['blank_order_no']++;
                continue;
            }

            // Rule 2, first half: the same number twice in one spreadsheet.
            if (isset($seenInBatch[$orderNo])) {
                $summary['skipped']['duplicate_in_sheet']++;
                continue;
            }

            $amount = SpreadsheetValue::decimal($this->cell($row, $map, 'amount'));
            $quantity = SpreadsheetValue::integer($this->cell($row, $map, 'quantity'));

            if ($amount === null) {
                $this->addError($summary, $rowNumber, $orderNo, 'Amount is missing or is not a number.');
                continue;
            }

            if ($quantity === null || $quantity < 1) {
                $this->addError(
                    $summary,
                    $rowNumber,
                    $orderNo,
                    $quantity === null
                        ? 'Quantity is missing or is not a number.'
                        : "Quantity [{$quantity}] must be at least 1."
                );
                continue;
            }

            $seenInBatch[$orderNo] = true;

            $candidates[] = [
                'order_no' => $orderNo,
                'payload' => $this->buildPayload($row, $map, $sheet, $tabName, $country, $amount, $quantity),
            ];
        }

        return [$candidates, $summary];
    }

    /**
     * Shape a validated row into the payload `SheetOrderImportService` expects.
     *
     * @param  array<int, mixed>  $row
     * @param  array<string, int>  $map
     * @return array<string, mixed>
     */
    private function buildPayload(
        array $row,
        array $map,
        Sheet $sheet,
        string $tabName,
        ?string $country,
        float $amount,
        int $quantity
    ): array {
        // The special layout splits the delivery date across two columns
        // depending on status; take whichever carries a value.
        $deliveryDate = SpreadsheetValue::date($this->cell($row, $map, 'delivery_date'))
            ?? SpreadsheetValue::date($this->cell($row, $map, 'delivered_date'))
            ?? SpreadsheetValue::date($this->cell($row, $map, 'pending_delivery'));

        return [
            // Blank by design: rule 1 only lets untriaged rows through, and
            // writing a status would remove the row from future pulls.
            'status' => null,
            'order_no' => SpreadsheetValue::text($this->cell($row, $map, 'order_no')),
            'order_date' => SpreadsheetValue::date($this->cell($row, $map, 'order_date')),
            'amount' => $amount,
            'quantity' => $quantity,
            'client_name' => SpreadsheetValue::text($this->cell($row, $map, 'client_name')),
            'address' => SpreadsheetValue::text($this->cell($row, $map, 'address')),
            'city' => SpreadsheetValue::text($this->cell($row, $map, 'city')),
            'phone' => SpreadsheetValue::text($this->cell($row, $map, 'phone')),
            'alt_no' => SpreadsheetValue::text($this->cell($row, $map, 'alt_no')),
            'product_name' => SpreadsheetValue::text($this->cell($row, $map, 'product_name')),
            'delivery_date' => $deliveryDate,
            'agent' => SpreadsheetValue::text($this->cell($row, $map, 'agent')),
            'instructions' => SpreadsheetValue::text($this->cell($row, $map, 'instructions')),
            'code' => SpreadsheetValue::text($this->cell($row, $map, 'code')),
            // The sheet record is authoritative for country and merchant; the
            // row's own values are only a fallback.
            'country' => $country ?? SpreadsheetValue::text($this->cell($row, $map, 'country')),
            'merchant' => $sheet->sheet_name,
            'sheet_id' => $sheet->sheet_id,
            'sheet_name' => $tabName,
            'store_name' => trim((string) ($sheet->store_name ?? '')) ?: 'RDL1',
        ];
    }

    /**
     * Stage one row and queue it for processing.
     *
     * @param  array<string, mixed>  $candidate
     * @param  array<string, mixed>  $summary
     */
    private function stage(Sheet $sheet, string $tabName, array $candidate, array &$summary): void
    {
        $orderNo = $candidate['order_no'];

        // Scoped to the spreadsheet and tab as well as the order number, so the
        // same number in two stores never collapses into one staged row.
        $sourceHash = hash('sha256', json_encode([
            'provider' => 'google-sheet',
            'sheet_id' => (string) $sheet->sheet_id,
            'tab' => $tabName,
            'order_no' => $orderNo,
        ]));

        $incoming = IncomingSheetOrder::firstOrCreate(
            ['source_hash' => $sourceHash],
            [
                'order_no' => $orderNo,
                'sheet_id' => $sheet->sheet_id,
                'sheet_name' => $tabName,
                'payload' => $candidate['payload'],
                'status' => 'pending',
                'available_at' => now(),
            ]
        );

        if (! $incoming->wasRecentlyCreated) {
            if ($incoming->status === 'processed') {
                $summary['already_staged']++;
                $summary['order_nos'][] = $orderNo;

                return;
            }

            // Already staged but not yet finished: re-arm it so a second click
            // can push a stuck or failed row through without duplicating it.
            $incoming->forceFill([
                'order_no' => $orderNo,
                'sheet_id' => $sheet->sheet_id,
                'sheet_name' => $tabName,
                'payload' => $candidate['payload'],
                'status' => 'pending',
                'error_message' => null,
                'available_at' => now(),
            ])->save();

            ProcessIncomingSheetOrder::dispatch($incoming->id);

            $summary['requeued']++;
            $summary['order_nos'][] = $orderNo;

            Log::info('🔁 Sheet order re-queued from pull import', [
                'sheet' => $sheet->sheet_name,
                'tab' => $tabName,
                'order_no' => $orderNo,
                'incoming_id' => $incoming->id,
            ]);

            return;
        }

        ProcessIncomingSheetOrder::dispatch($incoming->id);

        $summary['queued']++;
        $summary['order_nos'][] = $orderNo;

        Log::info('📥 Sheet order staged from pull import', [
            'sheet' => $sheet->sheet_name,
            'tab' => $tabName,
            'order_no' => $orderNo,
            'incoming_id' => $incoming->id,
        ]);
    }

    /**
     * @param  array<string, mixed>  $summary
     */
    private function addError(array &$summary, int $rowNumber, ?string $orderNo, string $reason): void
    {
        $summary['errors_total']++;

        if (count($summary['errors']) < self::MAX_REPORTED_ERRORS) {
            $summary['errors'][] = [
                'row' => $rowNumber,
                'order_no' => $orderNo,
                'reason' => $reason,
            ];
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function blankSummary(string $tabName, bool $truncated): array
    {
        return [
            'tab' => $tabName,
            'scanned' => 0,
            'eligible' => 0,
            'queued' => 0,
            'requeued' => 0,
            'already_staged' => 0,
            'remaining' => 0,
            'truncated' => $truncated,
            'skipped' => [
                'has_status' => 0,
                'existing_order' => 0,
                'duplicate_in_sheet' => 0,
                'blank_order_no' => 0,
            ],
            'skipped_total' => 0,
            'errors' => [],
            'errors_total' => 0,
            'order_nos' => [],
        ];
    }

    /**
     * @param  array<int, mixed>  $row
     * @param  array<string, int>  $map
     */
    private function cell(array $row, array $map, string $field): mixed
    {
        return isset($map[$field]) ? ($row[$map[$field]] ?? null) : null;
    }
}
