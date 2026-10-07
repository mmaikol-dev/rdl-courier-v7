<?php

namespace Tests\Feature;

use App\Exceptions\SheetImportException;
use App\Jobs\ProcessIncomingSheetOrder;
use App\Models\IncomingSheetOrder;
use App\Models\Sheet;
use App\Models\SheetOrder;
use App\Models\User;
use App\Services\GoogleSheetsReader;
use App\Services\SheetOrderPullImporter;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * Covers the Google Sheet pull import's two admission rules — blank status only,
 * never a duplicate order number — plus the reporting and access behaviour that
 * makes a rejected row visible instead of silently dropped.
 *
 * Must run under phpunit.mysql.xml: there is no migration creating
 * sheet_orders, so the sqlite in-memory schema cannot hold these tables.
 */
class SheetOrderPullImportTest extends TestCase
{
    use DatabaseTransactions;

    private const SPREADSHEET_ID = 'sheet-spreadsheet-id';

    /** Regular layout: A order_date, B order_no, C amount, ... L status */
    private function regularRow(
        string $orderNo,
        string $amount = '4,399.00',
        string $quantity = '2',
        string $status = '',
        string $client = 'Jane Doe',
        string $country = 'Kenya',
    ): array {
        return [
            '2026-01-15', $orderNo, $amount, $client, 'Nairobi', '0712345678',
            '', $country, 'Nairobi', 'Shoes', $quantity, $status,
            '2026-01-20', 'Agent A', 'Leave at gate', 'cc@shop.com', 'Acme', 'CODE1',
        ];
    }

    /** Header row matching the regular layout above. */
    private function headerRow(): array
    {
        return [
            'Order Date', 'Order No', 'Amount', 'Client Name', 'Address', 'Phone',
            'Alt No', 'Country', 'City', 'Product Name', 'Quantity', 'Status',
            'Delivery Date', 'Agent', 'Instructions', 'CC Email', 'Merchant', 'Code',
        ];
    }

    /**
     * Bind an importer backed by a fixed set of rows instead of the real API.
     *
     * @param  array<int, array<int, mixed>>  $rows
     * @param  array<int, string>  $tabs
     */
    private function fakeImporter(array $rows, array $tabs = ['Sheet1']): SheetOrderPullImporter
    {
        $reader = new class($rows, $tabs) extends GoogleSheetsReader
        {
            public function __construct(
                private readonly array $fakeRows,
                private readonly array $fakeTabs,
            ) {}

            public function tabNames(string $spreadsheetId): array
            {
                return $this->fakeTabs;
            }

            public function rows(string $spreadsheetId, string $tabName, ?string $columns = 'A:R', ?int $maxRows = null): array
            {
                return $maxRows !== null ? array_slice($this->fakeRows, 0, $maxRows) : $this->fakeRows;
            }
        };

        return new SheetOrderPullImporter($reader);
    }

    /**
     * `sheets.sheet_name` is the tab name inside the spreadsheet — that is what
     * the outbound sync groups on — and it is also what becomes the order's
     * merchant. So it must match one of the fake tabs.
     */
    private function makeSheet(array $overrides = []): Sheet
    {
        return Sheet::create([
            'sheet_id' => self::SPREADSHEET_ID,
            'sheet_name' => 'Sheet1',
            'store_name' => 'RDL1',
            'country' => 'Kenya',
            ...$overrides,
        ]);
    }

    private function existingOrder(string $orderNo, array $overrides = []): SheetOrder
    {
        return SheetOrder::create([
            'order_no' => $orderNo,
            'merchant' => 'Acme',
            'sheet_id' => self::SPREADSHEET_ID,
            'sheet_name' => 'Sheet1',
            'country' => 'Kenya',
            ...$overrides,
        ]);
    }

    // -----------------------------------------------------------------
    //  Rule 1 — only blank-status rows
    // -----------------------------------------------------------------

    public function test_blank_status_rows_are_queued_and_statused_rows_are_skipped(): void
    {
        Queue::fake();

        $summary = $this->fakeImporter([
            $this->headerRow(),
            $this->regularRow('ORD-1'),
            $this->regularRow('ORD-2', status: 'Scheduled'),
            $this->regularRow('ORD-3', status: 'Delivered'),
            $this->regularRow('ORD-4'),
        ])->import($this->makeSheet());

        $this->assertSame(2, $summary['queued'], 'Only the two blank-status rows should be queued.');
        $this->assertSame(2, $summary['skipped']['has_status']);
        $this->assertSame(4, $summary['scanned']);

        $this->assertEqualsCanonicalizing(
            ['ORD-1', 'ORD-4'],
            $summary['order_nos']
        );

        Queue::assertPushed(ProcessIncomingSheetOrder::class, 2);
    }

    public function test_whitespace_only_status_counts_as_blank(): void
    {
        Queue::fake();

        $summary = $this->fakeImporter([
            $this->headerRow(),
            $this->regularRow('ORD-1', status: '   '),
        ])->import($this->makeSheet());

        $this->assertSame(1, $summary['queued']);
        $this->assertSame(0, $summary['skipped']['has_status']);
    }

    // -----------------------------------------------------------------
    //  Rule 2 — never a duplicate order number
    // -----------------------------------------------------------------

    public function test_order_numbers_already_in_the_database_are_skipped(): void
    {
        Queue::fake();

        $this->existingOrder('ORD-1');

        $summary = $this->fakeImporter([
            $this->headerRow(),
            $this->regularRow('ORD-1'),
            $this->regularRow('ORD-2'),
        ])->import($this->makeSheet());

        $this->assertSame(1, $summary['queued']);
        $this->assertSame(1, $summary['skipped']['existing_order']);
        $this->assertSame(['ORD-2'], $summary['order_nos']);
    }

    public function test_an_existing_order_number_from_a_different_sheet_is_still_a_duplicate(): void
    {
        Queue::fake();

        // Same number, different merchant: still a duplicate order number.
        $this->existingOrder('ORD-1', ['sheet_id' => 'other-sheet', 'sheet_name' => 'Other', 'merchant' => 'Zebra']);

        $summary = $this->fakeImporter([
            $this->headerRow(),
            $this->regularRow('ORD-1'),
        ])->import($this->makeSheet());

        $this->assertSame(0, $summary['queued']);
        $this->assertSame(1, $summary['skipped']['existing_order']);
    }

    public function test_a_duplicate_order_number_inside_one_sheet_is_imported_once(): void
    {
        Queue::fake();

        $summary = $this->fakeImporter([
            $this->headerRow(),
            $this->regularRow('ORD-1', client: 'First'),
            $this->regularRow('ORD-1', client: 'Second'),
            $this->regularRow('ORD-1', client: 'Third'),
        ])->import($this->makeSheet());

        $this->assertSame(1, $summary['queued']);
        $this->assertSame(2, $summary['skipped']['duplicate_in_sheet']);
    }

    public function test_running_the_import_twice_queues_nothing_the_second_time(): void
    {
        Queue::fake();

        $sheet = $this->makeSheet();
        $rows = [$this->headerRow(), $this->regularRow('ORD-1'), $this->regularRow('ORD-2')];

        $first = $this->fakeImporter($rows)->import($sheet);
        $this->assertSame(2, $first['queued']);

        // The first run has landed, so the orders now exist.
        foreach ($first['order_nos'] as $orderNo) {
            $this->existingOrder($orderNo);
        }

        $second = $this->fakeImporter($rows)->import($sheet);

        $this->assertSame(0, $second['queued']);
        $this->assertSame(2, $second['skipped']['existing_order']);
    }

    // -----------------------------------------------------------------
    //  Reporting — rejected rows stay visible
    // -----------------------------------------------------------------

    public function test_rows_missing_an_amount_or_quantity_are_reported_without_stopping_the_run(): void
    {
        Queue::fake();

        $summary = $this->fakeImporter([
            $this->headerRow(),
            $this->regularRow('ORD-1'),
            $this->regularRow('ORD-BAD-AMOUNT', amount: 'not a number'),
            $this->regularRow('ORD-BAD-QTY', quantity: ''),
            $this->regularRow('ORD-ZERO-QTY', quantity: '0'),
            $this->regularRow('ORD-2'),
        ])->import($this->makeSheet());

        $this->assertSame(2, $summary['queued'], 'Good rows either side of the bad ones still import.');
        $this->assertSame(3, $summary['errors_total']);

        $reasons = array_column($summary['errors'], 'reason', 'order_no');
        $this->assertStringContainsString('Amount', $reasons['ORD-BAD-AMOUNT']);
        $this->assertStringContainsString('Quantity', $reasons['ORD-BAD-QTY']);
        $this->assertStringContainsString('at least 1', $reasons['ORD-ZERO-QTY']);

        // Errors point at the spreadsheet row so the merchant can find them.
        $this->assertSame([3, 4, 5], array_column($summary['errors'], 'row'));
    }

    public function test_blank_order_numbers_are_counted_separately_from_errors(): void
    {
        Queue::fake();

        $summary = $this->fakeImporter([
            $this->headerRow(),
            $this->regularRow(''),
            ['2026-01-15', '   ', '100', 'No Number', '', '', '', '', '', '', '1', '', '', '', '', '', '', ''],
            $this->regularRow('ORD-1'),
        ])->import($this->makeSheet());

        $this->assertSame(1, $summary['queued']);
        $this->assertSame(2, $summary['skipped']['blank_order_no']);
        $this->assertSame(0, $summary['errors_total']);
    }

    public function test_an_empty_tab_reports_cleanly(): void
    {
        Queue::fake();

        $summary = $this->fakeImporter([])->import($this->makeSheet());

        $this->assertSame(0, $summary['scanned']);
        $this->assertSame(0, $summary['queued']);
    }

    // -----------------------------------------------------------------
    //  Layout detection
    // -----------------------------------------------------------------

    public function test_a_headerless_tab_falls_back_to_the_positional_layout(): void
    {
        Queue::fake();

        $summary = $this->fakeImporter([
            $this->regularRow('ORD-1'),
            $this->regularRow('ORD-2', status: 'Scheduled'),
        ])->import($this->makeSheet());

        $this->assertSame(1, $summary['queued']);
        $this->assertSame(1, $summary['skipped']['has_status']);
    }

    public function test_a_title_row_above_the_header_is_tolerated(): void
    {
        Queue::fake();

        $summary = $this->fakeImporter([
            ['ACME ORDERS - JANUARY'],
            [],
            $this->headerRow(),
            $this->regularRow('ORD-1'),
        ])->import($this->makeSheet());

        $this->assertSame(1, $summary['queued']);
        $this->assertSame(1, $summary['scanned'], 'The title row must not count as data.');
    }

    public function test_header_columns_are_matched_by_name_so_reordered_sheets_work(): void
    {
        Queue::fake();

        // Same data, columns deliberately shuffled.
        $reordered = [
            ['Order No', 'Status', 'Amount', 'Quantity'],
            ['ORD-1', '', '1,500.00', '3'],
        ];

        $summary = $this->fakeImporter($reordered)->import($this->makeSheet());

        $this->assertSame(1, $summary['queued']);
        $this->assertSame('ORD-1', $summary['order_nos'][0]);
    }

    public function test_an_incomplete_header_aborts_instead_of_guessing_columns(): void
    {
        Queue::fake();

        $this->expectException(SheetImportException::class);
        $this->expectExceptionMessageMatches('/Status/');

        // Order No is recognised but Status is not, so the blank-status rule
        // cannot be applied safely.
        $this->fakeImporter([
            ['Order No', 'Amount', 'Quantity'],
            ['ORD-1', '100', '1'],
        ])->import($this->makeSheet());
    }

    public function test_a_missing_tab_aborts_with_the_available_tabs(): void
    {
        Queue::fake();

        $this->expectException(SheetImportException::class);
        $this->expectExceptionMessageMatches('/November/');

        $this->fakeImporter([], ['October', 'November'])
            ->import($this->makeSheet(), 'December');
    }

    public function test_the_tab_falls_back_to_the_sheets_own_name(): void
    {
        Queue::fake();

        // The spreadsheet has a tab matching the sheet's own name.
        $summary = $this->fakeImporter(
            [$this->headerRow(), $this->regularRow('ORD-1')],
            ['Other', 'Acme']
        )->import($this->makeSheet(['sheet_name' => 'Acme']));

        $this->assertSame('Acme', $summary['tab']);
        $this->assertSame(1, $summary['queued']);
    }

    public function test_a_sheet_without_a_spreadsheet_id_aborts(): void
    {
        Queue::fake();

        $this->expectException(SheetImportException::class);
        $this->expectExceptionMessageMatches('/no spreadsheet ID/i');

        $this->fakeImporter([])->import($this->makeSheet(['sheet_id' => '']));
    }

    // -----------------------------------------------------------------
    //  Staging
    // -----------------------------------------------------------------

    public function test_queued_rows_are_staged_as_pending_with_a_provider_scoped_hash(): void
    {
        Queue::fake();

        $summary = $this->fakeImporter([
            $this->headerRow(),
            $this->regularRow('ORD-1'),
        ])->import($this->makeSheet());

        $incoming = IncomingSheetOrder::where('order_no', 'ORD-1')->firstOrFail();

        $this->assertSame('pending', $incoming->status);
        $this->assertSame(64, strlen($incoming->source_hash));
        $this->assertSame('ORD-1', $incoming->order_no);
        $this->assertSame(self::SPREADSHEET_ID, $incoming->sheet_id);

        // The payload must carry the NOT NULL columns and a blank status, so the
        // row stays eligible for future pulls and satisfies sheet_orders.
        $this->assertNull($incoming->payload['status']);
        $this->assertSame('Sheet1', $incoming->payload['merchant']);
        $this->assertSame('Sheet1', $incoming->payload['sheet_name']);
        $this->assertSame('Kenya', $incoming->payload['country']);
        // JSON storage drops the float's zero fraction, so compare numerically.
        $this->assertEquals(4399.0, $incoming->payload['amount']);
        $this->assertEquals(2, $incoming->payload['quantity']);

        $this->assertSame(1, $summary['queued']);
    }

    public function test_a_staged_row_is_not_queued_again_on_a_repeat_click(): void
    {
        Queue::fake();

        $sheet = $this->makeSheet();
        $rows = [$this->headerRow(), $this->regularRow('ORD-1')];

        $this->fakeImporter($rows)->import($sheet);
        $second = $this->fakeImporter($rows)->import($sheet);

        // The first row was never processed (the queue is faked), so it is
        // re-armed rather than staged a second time.
        $this->assertSame(0, $second['queued']);
        $this->assertSame(1, $second['requeued']);
        $this->assertSame(1, IncomingSheetOrder::where('order_no', 'ORD-1')->count());
    }

    public function test_an_already_processed_row_is_not_dispatched_again(): void
    {
        Queue::fake();

        $sheet = $this->makeSheet();
        $rows = [$this->headerRow(), $this->regularRow('ORD-1')];

        $this->fakeImporter($rows)->import($sheet);

        IncomingSheetOrder::where('order_no', 'ORD-1')->update(['status' => 'processed']);

        $second = $this->fakeImporter($rows)->import($sheet);

        $this->assertSame(0, $second['queued']);
        $this->assertSame(0, $second['requeued']);
        $this->assertSame(1, $second['already_staged']);
    }

    public function test_the_per_run_cap_leaves_the_remainder_reported_and_resumable(): void
    {
        Queue::fake();

        $rows = [$this->headerRow()];
        for ($i = 1; $i <= 5; $i++) {
            $rows[] = $this->regularRow("ORD-{$i}");
        }

        $summary = $this->fakeImporter($rows)->import($this->makeSheet(), null, 2);

        $this->assertSame(2, $summary['queued']);
        $this->assertSame(3, $summary['remaining']);
        $this->assertSame(5, $summary['eligible']);
    }

    // -----------------------------------------------------------------
    //  Access control
    // -----------------------------------------------------------------

    public function test_a_user_cannot_import_a_sheet_from_another_country(): void
    {
        $user = User::factory()->create(['roles' => 'dispatch', 'store_address' => 'Kenya']);
        $this->actingAs($user);

        $this->actingAs($user)
            ->postJson("/sheets/{$this->makeSheet(['country' => 'Uganda'])->id}/import-orders")
            ->assertForbidden();
    }

    public function test_a_merchant_cannot_import_another_merchants_sheet(): void
    {
        $merchant = User::factory()->create([
            'roles' => 'merchant',
            'store_address' => 'Kenya',
            'name' => 'Someone Else',
        ]);

        // The sheet belongs to Acme, not to this merchant.
        $sheet = $this->makeSheet(['sheet_name' => 'Acme']);

        $this->actingAs($merchant)
            ->postJson("/sheets/{$sheet->id}/import-orders")
            ->assertForbidden();
    }

    public function test_a_merchant_may_import_their_own_sheet(): void
    {
        Queue::fake();

        $merchant = User::factory()->create([
            'roles' => 'merchant',
            'store_address' => 'Kenya',
            'name' => 'Acme',
        ]);

        $sheet = $this->makeSheet(['sheet_name' => 'Acme']);

        // Authorization passes, so the request reaches the API and fails there
        // (no credentials in the test environment) rather than at the guard.
        $this->actingAs($merchant)
            ->postJson("/sheets/{$sheet->id}/import-orders")
            ->assertStatus(502);
    }
}
