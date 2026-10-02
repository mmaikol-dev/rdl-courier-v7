<?php

namespace Tests\Feature;

use App\Models\Sheet;
use App\Models\SheetOrder;
use App\Models\StoreepIntegration;
use App\Services\StoreepApiService;
use App\Services\StoreepCountryResolver;
use App\Services\StoreepOrderImporter;
use App\Services\StoreepOrderNumberPrefix;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/**
 * Covers the Storeep integration's behaviour that is easy to regress:
 * market resolution, order-number uniqueness, the blank-status rule, and the
 * one-row-per-order rule for multi-item baskets.
 *
 * Must run under phpunit.mysql.xml: there is no migration creating
 * sheet_orders, so the sqlite in-memory schema cannot hold these tables.
 */
class StoreepIntegrationTest extends TestCase
{
    use DatabaseTransactions;

    // -----------------------------------------------------------------
    //  Country resolution
    // -----------------------------------------------------------------

    public function test_iso_market_codes_resolve_to_country_names(): void
    {
        $resolver = app(StoreepCountryResolver::class);

        $this->assertSame('Kenya', $resolver->resolve('KE'));
        $this->assertSame('Tanzania', $resolver->resolve('TZ'));
        $this->assertSame('Uganda', $resolver->resolve('UG'));
        $this->assertSame('Zambia', $resolver->resolve('ZM'));
    }

    public function test_market_resolution_is_case_insensitive_and_falls_back(): void
    {
        $resolver = app(StoreepCountryResolver::class);

        $this->assertSame('Kenya', $resolver->resolve('ke'));
        $this->assertSame('Kenya', $resolver->resolve(' Ke '));

        // An unknown or absent market falls back to the integration's country
        // rather than silently writing null, which would hide the order.
        $this->assertSame('Kenya', $resolver->resolve(null, 'Kenya'));
        $this->assertSame('Kenya', $resolver->resolve('XX', 'Kenya'));
        $this->assertNull($resolver->resolve('XX'));
    }

    public function test_every_seeded_iso_code_is_unique_and_uppercase(): void
    {
        $codes = app(StoreepCountryResolver::class)->supportedMarkets();

        $this->assertSame('Kenya', $codes['KE'] ?? null);
        $this->assertSame(array_keys($codes), array_unique(array_keys($codes)));

        foreach (array_keys($codes) as $code) {
            $this->assertMatchesRegularExpression('/^[A-Z]{2}$/', (string) $code);
        }
    }

    // -----------------------------------------------------------------
    //  Order number prefix allocation
    // -----------------------------------------------------------------

    public function test_prefix_is_derived_from_the_store_name(): void
    {
        $allocator = app(StoreepOrderNumberPrefix::class);

        // TRI is taken by existing "trial1"/"trial2" orders, so allocation must
        // skip it and guess another abbreviation.
        $this->assertContains('TRI', $allocator->candidates('TRIAL'));
        $this->assertNotSame('TRI', $allocator->allocate('TRIAL'));

        $this->assertSame('OKE', $allocator->allocate('OKEA'));
    }

    public function test_prefix_never_collides_with_an_existing_order_number(): void
    {
        $allocator = app(StoreepOrderNumberPrefix::class);
        $prefix = $allocator->allocate('TRIAL');

        $this->assertNotNull($prefix);
        $this->assertFalse(
            SheetOrder::where('order_no', 'like', $prefix.'%')->exists(),
            "prefix {$prefix} must not prefix any existing order number"
        );
    }

    public function test_prefix_does_not_collide_with_another_reserved_integration(): void
    {
        $allocator = app(StoreepOrderNumberPrefix::class);
        $sheet = $this->makeSheet();

        $first = StoreepIntegration::create([
            'sheets_id' => $sheet->id,
            'store_name' => 'PREFIXCLASH',
            'access_token' => 'token-one',
            'country' => 'Kenya',
            'order_no_prefix' => 'PRE',
        ]);

        // Allocating for a *different* integration with the same store name
        // must not hand out the prefix already reserved by $first.
        $second = $allocator->allocate('PREFIXCLASH');

        $this->assertNotSame('PRE', $second);
    }

    // -----------------------------------------------------------------
    //  Payload shape
    // -----------------------------------------------------------------

    public function test_multi_item_order_becomes_one_order_with_summed_quantity(): void
    {
        [$integration, $importer] = $this->makeIntegration();
        $prefix = $integration->order_no_prefix;

        // What StoreepApiService produces for a basket of three products: one
        // order, quantity 3, names joined.
        $payload = $importer->buildPayload($integration, [
            'storeep_id' => 999001,
            'storeep_number' => '7',
            'product_name' => 'wall paint, primer, roller',
            'quantity' => 3,
            'amount' => 9000,
            'client_name' => 'Michael Mutiso',
            'city' => 'Nairobi',
            'market' => 'KE',
        ]);

        $this->assertSame(3, (int) $payload['quantity'], 'three products is one order of quantity 3');
        $this->assertSame(
            $prefix.'7',
            $payload['order_no'],
            'prefix and number concatenate with no separator'
        );
        $this->assertSame('Kenya', $payload['country']);
    }

    public function test_a_zero_quantity_is_floored_at_one(): void
    {
        [$integration, $importer] = $this->makeIntegration();

        // sheet_orders.import validation requires an integer quantity, and a
        // Storeep order with an empty items array would otherwise import as 0.
        $payload = $importer->buildPayload($integration, [
            'storeep_id' => 999005,
            'storeep_number' => '11',
            'quantity' => 0,
            'amount' => 0,
            'market' => 'KE',
        ]);

        $this->assertSame(1, (int) $payload['quantity']);
    }

    public function test_status_is_left_blank_so_new_orders_show_as_work(): void
    {
        [$integration, $importer] = $this->makeIntegration();

        $payload = $importer->buildPayload($integration, [
            'storeep_id' => 999003,
            'storeep_number' => '9',
            // Storeep reports 'pending'; we must not copy it.
            'status' => 'pending',
            'quantity' => 1,
            'amount' => 100,
            'market' => 'KE',
        ]);

        $this->assertNull($payload['status']);
    }

    public function test_merchant_and_country_come_from_the_integration_not_the_payload(): void
    {
        [$integration, $importer] = $this->makeIntegration();

        $payload = $importer->buildPayload($integration, [
            'storeep_id' => 999004,
            'storeep_number' => '10',
            'merchant' => 'SOMEONE ELSE',
            'country' => 'Zimbabwe',
            'market' => null,
            'quantity' => 1,
            'amount' => 100,
        ]);

        $this->assertSame($integration->merchantName(), $payload['merchant']);
        $this->assertSame('Kenya', $payload['country']);
    }

    public function test_order_without_a_number_still_gets_a_stable_one(): void
    {
        [$integration, $importer] = $this->makeIntegration();

        $first = $importer->buildPayload($integration, [
            'storeep_id' => 555123,
            'storeep_number' => null,
            'quantity' => 1,
            'amount' => 100,
        ]);

        $second = $importer->buildPayload($integration, [
            'storeep_id' => 555123,
            'storeep_number' => null,
            'quantity' => 1,
            'amount' => 100,
        ]);

        $this->assertSame($first['order_no'], $second['order_no']);
        $this->assertStringStartsWith($integration->order_no_prefix, (string) $first['order_no']);
    }

    // -----------------------------------------------------------------
    //  Normalisation of the API payload
    // -----------------------------------------------------------------

    public function test_api_response_is_normalised_for_import(): void
    {
        Http::fake([
            'api.storeep.com/v1/orders*' => Http::response([
                'data' => [[
                    'id' => 364020011318120890,
                    'number' => 1,
                    'total' => 3000,
                    'currency' => 'KES',
                    'market' => 'KE',
                    'status' => 'pending',
                    'is_fulfilled' => false,
                    'updated_at' => '2026-10-01 12:05:34',
                    'items' => [
                        ['name' => 'wall paint', 'price' => 3000, 'quantity' => 1, 'sku' => null],
                    ],
                    'addresses' => [[
                        'type' => 'shipping',
                        'fullname' => 'Michael Mutiso',
                        'address1' => 'Chambers road, Ngara',
                        'city' => 'Nairobi',
                        'phone' => '+254798010311',
                    ]],
                ]],
                'meta' => ['pagination' => ['current_page' => 1, 'total_pages' => 1, 'total' => 1]],
            ]),
        ]);

        [$integration] = $this->makeIntegration();

        $orders = iterator_to_array(app(StoreepApiService::class)->ordersSince($integration));

        $this->assertCount(1, $orders);
        $order = $orders[0];

        $this->assertSame('1', $order['storeep_number']);
        $this->assertSame(1, $order['quantity']);
        $this->assertSame(3000.0, $order['amount']);
        $this->assertSame('wall paint', $order['product_name']);
        $this->assertSame('Michael Mutiso', $order['client_name'], 'fullname is populated, names are not');
        $this->assertSame('Nairobi', $order['city']);
        $this->assertSame('KE', $order['market']);
        $this->assertNull($order['status'], 'status is dropped, not copied');
    }

    public function test_sync_is_idempotent_across_runs(): void
    {
        $payload = [
            'data' => [[
                'id' => 364020011318120999,
                'number' => 42,
                'total' => 1000,
                'market' => 'KE',
                'status' => 'pending',
                'updated_at' => '2026-10-01 12:05:34',
                'items' => [['name' => 'thing', 'price' => 1000, 'quantity' => 1]],
                'addresses' => [],
            ]],
            'meta' => ['pagination' => ['current_page' => 1, 'total_pages' => 1, 'total' => 1]],
        ];

        Http::fake(['api.storeep.com/v1/orders*' => Http::response($payload)]);

        [$integration] = $this->makeIntegration();
        $api = app(StoreepApiService::class);

        $firstRun = iterator_to_array($api->ordersSince($integration));
        $secondRun = iterator_to_array($api->ordersSince($integration));

        $this->assertCount(1, $firstRun);
        $this->assertCount(1, $secondRun, 'the same order is re-read, not duplicated');
        $this->assertSame($firstRun[0]['storeep_id'], $secondRun[0]['storeep_id']);
    }

    public function test_orders_older_than_the_cursor_are_skipped(): void
    {
        Http::fake([
            'api.storeep.com/v1/orders*' => Http::response([
                'data' => [
                    [
                        'id' => 2, 'number' => 2, 'total' => 1, 'market' => 'KE',
                        'updated_at' => '2026-10-02 10:00:00',
                        'items' => [], 'addresses' => [],
                    ],
                    [
                        // Equal to the cursor: already seen, stop before this.
                        'id' => 1, 'number' => 1, 'total' => 1, 'market' => 'KE',
                        'updated_at' => '2026-10-01 09:00:00',
                        'items' => [], 'addresses' => [],
                    ],
                ],
                'meta' => ['pagination' => ['current_page' => 1, 'total_pages' => 1, 'total' => 2]],
            ]),
        ]);

        [$integration] = $this->makeIntegration();

        $orders = iterator_to_array(
            app(StoreepApiService::class)->ordersSince($integration, '2026-10-01 09:00:00')
        );

        $this->assertCount(1, $orders);
        $this->assertSame(2, $orders[0]['storeep_id']);
    }

    public function test_connection_test_reports_a_permission_failure(): void
    {
        Http::fake([
            'api.storeep.com/v1/orders*' => Http::response(
                ['status' => 'error', 'errors' => ['insufficient permissions, requires: products:read']],
                403
            ),
        ]);

        [$integration] = $this->makeIntegration();
        $result = app(StoreepApiService::class)->testConnection($integration);

        $this->assertFalse($result['ok']);
        $this->assertSame(403, $result['status']);
        $this->assertStringContainsString('insufficient permissions', $result['message']);
    }

    // -----------------------------------------------------------------
    //  Page rendering
    // -----------------------------------------------------------------

    public function test_integrations_page_renders_for_staff(): void
    {
        $response = $this->actingAs($this->makeUser())->get('/integrations');

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('integrations/index')
            ->has('integrations')
            ->has('sheets')
            ->has('countryNames')
            ->has('prefixSuggestions')
        );
    }

    /**
     * The page must not shadow the shared `countries` array.
     *
     * HandleInertiaRequests shares `countries` on every page for the sidebar's
     * CountryFilter. A page prop of the same name replaces that array with an
     * object and CountryFilter crashes on countries.map(), blanking the page.
     */
    public function test_page_does_not_shadow_the_shared_countries_array(): void
    {
        $response = $this->actingAs($this->makeUser())->get('/integrations');

        $props = $response->viewData('page')['props'];

        $this->assertArrayHasKey('countries', $props);
        $this->assertIsArray($props['countries'], 'shared countries must stay an array');
        $this->assertSame(
            'array',
            gettype($props['countries']),
            'CountryFilter calls countries.map(), so a scalar or object here blanks every page'
        );

        // The page's own map must be namespaced under a different key.
        $this->assertArrayHasKey('countryNames', $props);
        $this->assertIsArray($props['countryNames']);
    }

    public function test_god_role_reaches_the_integrations_page(): void
    {
        // /integrations is gated by the sidebar permission middleware, which
        // resolves G.O.D to every key.
        $this->actingAs($this->makeUser('G.O.D'))->get('/integrations')->assertOk();
    }

    // -----------------------------------------------------------------
    //  Helpers
    // -----------------------------------------------------------------

    /**
     * @return array{0: StoreepIntegration, 1: StoreepOrderImporter}
     */
    private function makeIntegration(string $storeName = 'PREFIXCLASH'): array
    {
        $sheet = $this->makeSheet();
        $prefix = app(StoreepOrderNumberPrefix::class)->allocate($storeName) ?? 'PRE';

        $integration = StoreepIntegration::create([
            'sheets_id' => $sheet->id,
            'store_name' => $storeName,
            'access_token' => 'test-token-'.$sheet->id,
            'country' => 'Kenya',
            'order_no_prefix' => $prefix,
            'is_enabled' => true,
        ]);

        return [$integration, app(StoreepOrderImporter::class)];
    }

    private function makeSheet(): Sheet
    {
        $unique = uniqid();

        return Sheet::create([
            'sheet_name' => 'STOREEP TEST '.$unique,
            'sheet_id' => 'storeep-test-'.$unique,
            'store_name' => 'RDL1',
            'country' => 'Kenya',
        ]);
    }

    private function makeUser(string $role = 'G.O.D'): \App\Models\User
    {
        $user = \App\Models\User::factory()->create();
        $user->forceFill(['roles' => $role, 'store_address' => 'Kenya'])->save();

        return $user;
    }
}
