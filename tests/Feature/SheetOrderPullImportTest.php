<?php

namespace Tests\Feature;

use App\Exceptions\SheetImportException;
use App\Jobs\ProcessIncomingSheetOrder;
use App\Models\IncomingSheetOrder;
use App\Models\Sheet;
use App\Models\SheetOrder;
use App\Models\User;
use App\Services\GoogleSheetsReader;
use App\Services\SheetOrderImportService;
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

            public function rows(
                string $spreadsheetId,
                string $tabName,
                ?string $columns = 'A:R',
                ?int $maxRows = null,
                int $startRow = 1
            ): array
            {
                return $maxRows !== null ? array_slice($this->fakeRows, $startRow - 1, $maxRows) : $this->fakeRows;
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

    public function test_an_existing_order_number_from_a_different_sheet_is_not_a_duplicate(): void
    {
        Queue::fake();

        // The identity is scoped to a spreadsheet and tab.
        $this->existingOrder('ORD-1', ['sheet_id' => 'other-sheet', 'sheet_name' => 'Other', 'merchant' => 'Zebra']);

        $summary = $this->fakeImporter([
            $this->headerRow(),
            $this->regularRow('ORD-1'),
        ])->import($this->makeSheet());

        $this->assertSame(1, $summary['queued']);
        $this->assertSame(0, $summary['skipped']['existing_order']);
    }

    public function test_automatic_pickup_requires_column_c_and_stamps_the_system_entry_date(): void
    {
        Queue::fake();

        $rows = [
            $this->headerRow(),
            $this->regularRow('ORD-READY'),
            array_replace($this->regularRow('ORD-WAIT'), [2 => '']),
        ];

        $summary = $this->fakeImporter($rows)->importForAutomaticPickup($this->makeSheet(), 'Sheet1');

        $this->assertSame(1, $summary['queued']);
        $this->assertSame(1, $summary['skipped']['missing_priority']);
        $this->assertSame(0, $summary['errors_total']);

        $incoming = IncomingSheetOrder::where('order_no', 'ORD-READY')->firstOrFail();
        $this->assertSame(now()->toDateString(), $incoming->payload['order_date']);
    }

    public function test_automatic_pickup_preserves_the_first_entry_date_when_requeued(): void
    {
        Queue::fake();

        try {
            \Illuminate\Support\Carbon::setTestNow('2026-10-25 23:59:00');
            $sheet = $this->makeSheet();
            $rows = [$this->headerRow(), $this->regularRow('ORD-STABLE-DATE')];

            $this->fakeImporter($rows)->importForAutomaticPickup($sheet, 'Sheet1');

            \Illuminate\Support\Carbon::setTestNow('2026-10-26 00:01:00');
            $this->fakeImporter($rows)->importForAutomaticPickup($sheet, 'Sheet1');

            $incoming = IncomingSheetOrder::where('order_no', 'ORD-STABLE-DATE')->firstOrFail();
            $this->assertSame('2026-10-25', $incoming->payload['order_date']);
        } finally {
            \Illuminate\Support\Carbon::setTestNow();
        }
    }

    public function test_manual_sheet_pull_keeps_the_order_date_from_the_sheet(): void
    {
        Queue::fake();

        $this->fakeImporter([
            $this->headerRow(),
            $this->regularRow('ORD-MANUAL'),
        ])->import($this->makeSheet());

        $incoming = IncomingSheetOrder::where('order_no', 'ORD-MANUAL')->firstOrFail();
        $this->assertSame('2026-01-15', $incoming->payload['order_date']);
    }

    public function test_automatic_pickup_can_continue_from_a_later_row_window(): void
    {
        Queue::fake();

        $rows = [
            $this->headerRow(),
            $this->regularRow('ORD-1'),
            $this->regularRow('ORD-2'),
            $this->regularRow('ORD-3'),
        ];

        $summary = $this->fakeImporter($rows)->importForAutomaticPickup(
            $this->makeSheet(),
            'Sheet1',
            25,
            4
        );

        $this->assertSame(1, $summary['queued']);
        $this->assertSame(1, $summary['rows_read']);
        $this->assertSame(['ORD-3'], $summary['order_nos']);
    }

    public function test_app_script_intake_uses_and_preserves_the_first_system_entry_date(): void
    {
        Queue::fake();

        try {
            \Illuminate\Support\Carbon::setTestNow('2026-10-25 23:59:00');
            $payload = [
                'order_no' => 'ORD-APPSCRIPT',
                'sheet_id' => self::SPREADSHEET_ID,
                'sheet_name' => 'Sheet1',
                'order_date' => '2020-01-01',
                'client_name' => 'First',
            ];

            $this->postJson('/api/sheet-orders', $payload)->assertAccepted();

            \Illuminate\Support\Carbon::setTestNow('2026-10-26 00:01:00');
            $payload['client_name'] = 'Updated';
            $payload['order_date'] = '2020-02-02';

            $this->postJson('/api/sheet-orders', $payload)->assertAccepted();

            $summary = $this->fakeImporter([
                $this->headerRow(),
                $this->regularRow('ORD-APPSCRIPT'),
            ])->importForAutomaticPickup($this->makeSheet(), 'Sheet1');

            $incoming = IncomingSheetOrder::where('order_no', 'ORD-APPSCRIPT')->firstOrFail();
            $this->assertSame(1, IncomingSheetOrder::where('order_no', 'ORD-APPSCRIPT')->count());
            $this->assertSame(1, $summary['requeued']);
            $this->assertSame('2026-10-25', $incoming->payload['order_date']);
        } finally {
            \Illuminate\Support\Carbon::setTestNow();
        }
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

    public function test_a_header_with_missing_cells_still_imports_using_the_column_positions(): void
    {
        Queue::fake();

        // The merchant left the order number, status, amount and date header
        // cells blank. The data underneath is still in the columns the layout
        // describes, so the import must read it from there.
        $header = $this->headerRow();
        $header[0] = '';  // A order date
        $header[1] = '';  // B order number
        $header[2] = '';  // C amount
        $header[11] = ''; // L status

        $summary = $this->fakeImporter([
            $header,
            $this->regularRow('ORD-1'),
            $this->regularRow('ORD-2', status: 'Scheduled'),
        ])->import($this->makeSheet());

        $this->assertSame(1, $summary['queued'], 'The blank status cell still means column L holds the status.');
        $this->assertSame(['ORD-1'], $summary['order_nos']);
        $this->assertSame(1, $summary['skipped']['has_status']);
    }

    public function test_a_partly_named_header_keeps_the_named_columns_and_falls_back_to_positions(): void
    {
        Queue::fake();

        // Order No is named but Status is not. There is no way to apply the
        // blank-status rule from the header alone, so the columns that were
        // not named are read from their position instead of aborting the run.
        $summary = $this->fakeImporter([
            ['Order No', 'Amount', 'Quantity'],
            ['ORD-1', '100', '1'],
        ])->import($this->makeSheet());

        $this->assertSame(1, $summary['queued']);
        $this->assertSame(['ORD-1'], $summary['order_nos']);

        $columns = array_column($summary['columns'], null, 'field');

        $this->assertSame('A', $columns['order_no']['column']);
        $this->assertSame('header', $columns['order_no']['source']);
        $this->assertSame('L', $columns['status']['column'], 'Status keeps its canonical column.');
        $this->assertSame('position', $columns['status']['source']);
    }

    public function test_the_summary_reports_which_column_letter_held_each_field(): void
    {
        Queue::fake();

        $summary = $this->fakeImporter([
            $this->headerRow(),
            $this->regularRow('ORD-1'),
        ])->import($this->makeSheet());

        $columns = array_column($summary['columns'], null, 'field');

        $this->assertSame('A', $columns['order_date']['column']);
        $this->assertSame('Order Date', $columns['order_date']['label']);
        $this->assertSame('B', $columns['order_no']['column']);
        $this->assertSame('Order Number', $columns['order_no']['label']);
        $this->assertSame('L', $columns['status']['column']);
        $this->assertSame('header', $columns['status']['source']);
    }

    public function test_the_special_spreadsheet_is_read_from_its_own_columns(): void
    {
        Queue::fake();

        // This one spreadsheet keeps the order number in column N and the
        // status in column I, so its own layout has to be used.
        $row = array_fill(0, 18, '');
        $row[0] = '2026-01-15';  // A  order date
        $row[1] = 'Jane Doe';    // B  client name
        $row[2] = 'Nairobi';     // C  address
        $row[3] = 'Nairobi';     // D  city
        $row[4] = '0712345678';  // E  phone
        $row[5] = 'Shoes';       // F  product
        $row[6] = '4,399.00';    // G  amount
        $row[7] = '2';           // H  quantity
        $row[8] = '';            // I  status
        $row[13] = 'ORD-SPECIAL';// N  order number
        $row[16] = '2026-01-20'; // Q  pending delivery

        $summary = $this->fakeImporter([$row])->import(
            $this->makeSheet(['sheet_id' => '1x1Rntb-_BbXe5gvWIKN3Zr2Tnbyi9rSmbaieYzUryzU'])
        );

        $this->assertSame(1, $summary['queued']);
        $this->assertSame(['ORD-SPECIAL'], $summary['order_nos']);

        $columns = array_column($summary['columns'], null, 'field');

        $this->assertSame('N', $columns['order_no']['column']);
        $this->assertSame('I', $columns['status']['column']);
        $this->assertSame('G', $columns['amount']['column']);
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
    //  Order date
    // -----------------------------------------------------------------

    public function test_a_blank_imported_order_date_falls_back_to_the_current_date(): void
    {
        $result = app(SheetOrderImportService::class)->import([
            'order_no' => 'ORD-NO-DATE',
            'store_name' => 'RDL1',
            'sheet_id' => 'test-sheet',
            'sheet_name' => 'Sheet1',
            'amount' => 100,
            'quantity' => 1,
            'country' => 'Kenya',
            'merchant' => 'Acme',
        ]);

        $this->assertTrue($result['created']);
        $this->assertSame(now()->toDateString(), $result['order']->order_date?->format('Y-m-d'));
    }

    public function test_an_imported_order_date_is_preserved_when_supplied(): void
    {
        $result = app(SheetOrderImportService::class)->import([
            'order_no' => 'ORD-WITH-DATE',
            'store_name' => 'RDL1',
            'sheet_id' => 'test-sheet',
            'sheet_name' => 'Sheet1',
            'order_date' => '2026-01-15',
            'amount' => 100,
            'quantity' => 1,
            'country' => 'Kenya',
            'merchant' => 'Acme',
        ]);

        $this->assertTrue($result['created']);
        $this->assertSame('2026-01-15', $result['order']->order_date?->format('Y-m-d'));
    }

    public function test_import_service_scopes_duplicate_order_numbers_to_the_source_tab(): void
    {
        $this->existingOrder('ORD-SAME-NUMBER', [
            'sheet_id' => self::SPREADSHEET_ID,
            'sheet_name' => 'OtherTab',
        ]);

        $result = app(SheetOrderImportService::class)->import([
            'order_no' => 'ORD-SAME-NUMBER',
            'store_name' => 'RDL1',
            'sheet_id' => self::SPREADSHEET_ID,
            'sheet_name' => 'Sheet1',
            'amount' => 100,
            'quantity' => 1,
            'country' => 'Kenya',
            'merchant' => 'Acme',
        ]);

        $this->assertTrue($result['created']);
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
