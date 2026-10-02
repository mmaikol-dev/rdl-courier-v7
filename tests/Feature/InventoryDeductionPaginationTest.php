<?php

namespace Tests\Feature;

use App\Models\SheetOrder;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class InventoryDeductionPaginationTest extends TestCase
{
    use DatabaseTransactions;

    private function makeUser(): User
    {
        $user = User::factory()->create();
        $user->forceFill(['roles' => 'G.O.D', 'store_address' => 'Kenya'])->save();

        return $user;
    }

    private function makeOrder(string $merchant, int $quantity = 1, string $country = 'Kenya'): SheetOrder
    {
        return SheetOrder::create([
            'order_no' => 'PAG-'.uniqid(),
            'client_name' => 'Paginated Client',
            'product_name' => 'Widget',
            'code' => 'WDG-1',
            'quantity' => $quantity,
            'amount' => 100,
            'status' => 'Delivered',
            'merchant' => $merchant,
            'country' => $country,
            // sheet_orders.sheet_id / sheet_name are NOT NULL with no default in the
            // imported schema, so every fixture has to supply them.
            'sheet_id' => 'pagination-test-sheet',
            'sheet_name' => 'Pagination Test Sheet',
            'delivered_at' => now(),
        ]);
    }

    public function test_index_requires_auth(): void
    {
        $this->get('/inventory-deductions')->assertRedirect('/login');
    }

    public function test_orders_prop_is_a_paginator_not_a_bare_array(): void
    {
        $merchant = 'PAGINATED MERCHANT '.uniqid();
        $this->makeOrder($merchant);

        $response = $this->actingAs($this->makeUser())
            ->get('/inventory-deductions?merchant='.urlencode($merchant));

        $response->assertOk();

        $response->assertInertia(fn (Assert $page) => $page
            ->component('inventory-deductions/index')
            ->where('selectedMerchant', $merchant)
            ->has('orders')
            ->has('orders.data')
            ->has('orders.current_page')
            ->has('orders.last_page')
            ->has('orders.per_page')
            ->has('orders.total')
            ->has('orders.links')
        );

        // The critical regression guard: the prop must be a paginator object.
        $orders = $response->viewData('page')['props']['orders'] ?? null;
        $this->assertIsArray($orders, 'orders prop should serialize to an array');
        $this->assertArrayHasKey('data', $orders);
        $this->assertArrayHasKey('total', $orders);
        $this->assertArrayHasKey('links', $orders);
    }

    public function test_no_merchant_selected_still_returns_a_paginator_shape(): void
    {
        // Regression guard: the empty state used to serialise `orders` as a bare []
        // while the populated state was a paginator object. The React page reads
        // `orders.data`, so the bare array white-screened the page. Both states must
        // expose the same keys.
        $response = $this->actingAs($this->makeUser())
            ->get('/inventory-deductions')
            ->assertOk();

        $response->assertInertia(fn (Assert $page) => $page
            ->component('inventory-deductions/index')
            ->where('selectedMerchant', null)
            ->has('orders')
            ->has('orders.data')
            ->has('orders.current_page')
            ->has('orders.last_page')
            ->has('orders.per_page')
            ->has('orders.total')
            ->has('orders.links')
        );

        $orders = $response->viewData('page')['props']['orders'];

        $this->assertIsArray($orders, 'orders must serialise to an array, not a bare JSON list');
        $this->assertSame([], $orders['data']);
        $this->assertSame(0, $orders['total']);
    }

    public function test_empty_and_populated_states_expose_the_same_order_keys(): void
    {
        $merchant = 'PAGINATED MERCHANT '.uniqid();
        $this->makeOrder($merchant);

        $user = $this->makeUser();

        $empty = $this->actingAs($user)
            ->get('/inventory-deductions')
            ->viewData('page')['props']['orders'];

        $populated = $this->actingAs($user)
            ->get('/inventory-deductions?merchant='.urlencode($merchant))
            ->viewData('page')['props']['orders'];

        // array_diff(empty_keys, populated_keys) is empty by construction, so it can
        // never fail. Compare both directions to actually catch a missing key.
        $this->assertEquals(
            [],
            array_diff(array_keys($empty), array_keys($populated)),
            'the empty-state paginator must expose every key the populated one does'
        );

        $this->assertEquals(
            [],
            array_diff(array_keys($populated), array_keys($empty)),
            'the populated-state paginator must expose every key the empty one does'
        );
    }

    public function test_each_order_exposes_city_and_code(): void
    {
        $merchant = 'CITY MERCHANT '.uniqid();

        SheetOrder::create([
            'order_no' => 'CITY-'.uniqid(),
            'client_name' => 'City Client',
            'product_name' => 'Widget',
            'code' => 'WDG-9',
            'city' => 'Solwezi',
            'quantity' => 2,
            'amount' => 100,
            'status' => 'Delivered',
            'merchant' => $merchant,
            'country' => 'Kenya',
            'sheet_id' => 'pagination-test-sheet',
            'sheet_name' => 'Pagination Test Sheet',
            'delivered_at' => now(),
        ]);

        $orders = $this->actingAs($this->makeUser())
            ->get('/inventory-deductions?merchant='.urlencode($merchant))
            ->viewData('page')['props']['orders'];

        $this->assertCount(1, $orders['data']);
        $this->assertArrayHasKey('city', $orders['data'][0], 'orders must expose city for the table column');
        $this->assertArrayHasKey('code', $orders['data'][0], 'orders must expose code for the table column');
        $this->assertSame('Solwezi', $orders['data'][0]['city']);
        $this->assertSame('WDG-9', $orders['data'][0]['code']);
    }

    public function test_orders_are_split_across_pages(): void
    {
        $merchant = 'PAGINATED MERCHANT '.uniqid();

        // 30 orders, 25 per page => 2 pages.
        for ($i = 0; $i < 30; $i++) {
            $this->makeOrder($merchant);
        }

        $user = $this->makeUser();

        $pageOne = $this->actingAs($user)
            ->get('/inventory-deductions?merchant='.urlencode($merchant).'&page=1');
        $pageTwo = $this->actingAs($user)
            ->get('/inventory-deductions?merchant='.urlencode($merchant).'&page=2');

        $ordersOne = $pageOne->viewData('page')['props']['orders'];
        $ordersTwo = $pageTwo->viewData('page')['props']['orders'];

        $this->assertCount(25, $ordersOne['data'], 'first page should hold per_page rows');
        $this->assertCount(5, $ordersTwo['data'], 'remainder lands on the second page');
        $this->assertSame(30, $ordersOne['total']);
        $this->assertSame(2, $ordersOne['last_page']);
        $this->assertSame(1, $ordersOne['current_page']);
        $this->assertSame(2, $ordersTwo['current_page']);

        // No row may appear on both pages.
        $idsOne = array_column($ordersOne['data'], 'id');
        $idsTwo = array_column($ordersTwo['data'], 'id');
        $this->assertEmpty(array_intersect($idsOne, $idsTwo), 'pages must not overlap');
    }

    public function test_per_page_is_honoured_and_clamped_to_allowed_values(): void
    {
        $merchant = 'PAGINATED MERCHANT '.uniqid();

        for ($i = 0; $i < 30; $i++) {
            $this->makeOrder($merchant);
        }

        $user = $this->makeUser();

        $ten = $this->actingAs($user)
            ->get('/inventory-deductions?merchant='.urlencode($merchant).'&per_page=10')
            ->viewData('page')['props']['orders'];

        $this->assertSame(10, $ten['per_page']);
        $this->assertCount(10, $ten['data']);
        $this->assertSame(3, $ten['last_page']);

        // A value outside the allow-list falls back to the 25 default.
        $bogus = $this->actingAs($user)
            ->get('/inventory-deductions?merchant='.urlencode($merchant).'&per_page=999')
            ->viewData('page')['props']['orders'];

        $this->assertSame(25, $bogus['per_page']);
    }

    public function test_pagination_links_preserve_the_merchant_filter(): void
    {
        $merchant = 'PAGINATED MERCHANT '.uniqid();

        for ($i = 0; $i < 30; $i++) {
            $this->makeOrder($merchant);
        }

        $orders = $this->actingAs($this->makeUser())
            ->get('/inventory-deductions?merchant='.urlencode($merchant))
            ->viewData('page')['props']['orders'];

        $links = array_column($orders['links'], 'url');

        $this->assertNotEmpty($links);

        foreach ($links as $url) {
            if ($url === null) {
                continue;
            }

            $this->assertStringContainsString(
                'page=',
                $url,
                'pagination links must carry the page number so Inertia can request the next page'
            );
        }

        // withQueryString() must keep the merchant so the next page is not unscoped.
        $this->assertNotEmpty(
            array_filter($links, fn ($url) => $url !== null && str_contains($url, 'merchant=')),
            'pagination links must preserve the merchant filter'
        );
    }

    public function test_deducted_orders_are_excluded_from_every_page(): void
    {
        $merchant = 'PAGINATED MERCHANT '.uniqid();

        $visible = $this->makeOrder($merchant);

        $alreadyDeducted = $this->makeOrder($merchant);
        $alreadyDeducted->forceFill(['inventory_deducted_at' => now()])->save();

        $orders = $this->actingAs($this->makeUser())
            ->get('/inventory-deductions?merchant='.urlencode($merchant))
            ->viewData('page')['props']['orders'];

        $ids = array_column($orders['data'], 'id');

        $this->assertContains($visible->id, $ids);
        $this->assertNotContains($alreadyDeducted->id, $ids);
        $this->assertSame(1, $orders['total']);
    }

    public function test_order_rows_keep_integer_quantity_and_float_amount(): void
    {
        $merchant = 'PAGINATED MERCHANT '.uniqid();
        $this->makeOrder($merchant, quantity: 3);

        $row = $this->actingAs($this->makeUser())
            ->get('/inventory-deductions?merchant='.urlencode($merchant))
            ->viewData('page')['props']['orders']['data'][0];

        // The through() mapping casts these; the table does arithmetic on both.
        $this->assertIsInt($row['quantity']);
        $this->assertIsFloat($row['amount']);
    }

    public function test_undelivered_orders_are_not_paginated_in(): void
    {
        $merchant = 'PAGINATED MERCHANT '.uniqid();

        $pending = SheetOrder::create([
            'order_no' => 'PAG-'.uniqid(),
            'client_name' => 'Pending Client',
            'product_name' => 'Widget',
            'code' => 'WDG-1',
            'quantity' => 1,
            'amount' => 100,
            'status' => 'Pending',
            'merchant' => $merchant,
            'country' => 'Kenya',
            'sheet_id' => 'pagination-test-sheet',
            'sheet_name' => 'Pagination Test Sheet',
        ]);

        $orders = $this->actingAs($this->makeUser())
            ->get('/inventory-deductions?merchant='.urlencode($merchant))
            ->viewData('page')['props']['orders'];

        $this->assertNotContains($pending->id, array_column($orders['data'], 'id'));
        $this->assertSame(0, $orders['total']);
    }

    public function test_orders_are_scoped_to_the_users_country(): void
    {
        $kenyan = $this->makeOrder('SCOPED MERCHANT', country: 'Kenya');
        $tanzanian = $this->makeOrder('SCOPED MERCHANT', country: 'Tanzania');

        // A non-global user pinned to Kenya must not see the Tanzania row.
        $scoped = User::factory()->create();
        $scoped->forceFill(['roles' => 'finance', 'store_address' => 'Kenya'])->save();

        $orders = $this->actingAs($scoped)
            ->get('/inventory-deductions?merchant=SCOPED%20MERCHANT')
            ->viewData('page')['props']['orders'];

        $ids = array_column($orders['data'], 'id');

        $this->assertContains($kenyan->id, $ids);
        $this->assertNotContains($tanzanian->id, $ids, 'country scoping must survive pagination');
    }

    public function test_page_beyond_last_page_returns_empty_data_not_an_error(): void
    {
        $merchant = 'PAGINATED MERCHANT '.uniqid();
        $this->makeOrder($merchant);

        $orders = $this->actingAs($this->makeUser())
            ->get('/inventory-deductions?merchant='.urlencode($merchant).'&page=99')
            ->viewData('page')['props']['orders'];

        $this->assertSame([], $orders['data']);
    }
}
