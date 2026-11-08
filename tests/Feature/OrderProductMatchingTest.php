<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\SheetOrder;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class OrderProductMatchingTest extends TestCase
{
    use DatabaseTransactions;

    private function user(string $name, string $role = 'admin'): User
    {
        return User::create([
            'name' => $name,
            'email' => Str::lower(Str::random(12)).'@example.test',
            'password' => bcrypt('password'),
            'email_verified_at' => now(),
            'roles' => $role,
            'store_address' => 'Kenya',
            'store_name' => $name.' store',
        ]);
    }

    private function product(User $owner, string $name, string $merchant = 'Acme', string $country = 'Kenya'): Product
    {
        return Product::create([
            'uuid' => (string) Str::uuid(),
            'user_id' => $owner->id,
            'name' => $name,
            'slug' => Str::slug($name).'-'.Str::random(6),
            'code' => 'MATCH-'.Str::upper(Str::random(8)),
            'quantity' => 100,
            'buying_price' => 10,
            'selling_price' => 20,
            'quantity_alert' => 5,
            'unit_id' => DB::table('units')->value('id'),
            'country' => $country,
            'merchant' => $merchant,
        ]);
    }

    private function order(string $orderNo, User $agent, array $overrides = []): SheetOrder
    {
        return SheetOrder::create([
            'order_no' => $orderNo,
            'merchant' => 'Acme',
            'sheet_id' => 'manual-match-sheet',
            'sheet_name' => 'Acme',
            'country' => 'Kenya',
            'product_name' => 'Shoes',
            'quantity' => 1,
            'status' => 'New Orders',
            'agent_id' => $agent->id,
            ...$overrides,
        ]);
    }

    public function test_orders_can_be_bulk_matched_to_a_product_and_page_filters_order_product_name(): void
    {
        $operator = $this->user('Matching Operator');
        $agent = $this->user('Assigned Matching Agent', 'agent');
        $product = $this->product($operator, 'Inventory Shoes');
        $filterName = 'ManualMatchFilter'.Str::random(10);
        $firstOrder = $this->order('MATCH-ORDER-1', $agent, ['product_name' => $filterName]);
        $secondOrder = $this->order('MATCH-ORDER-2', $agent, ['product_name' => $filterName]);
        $this->order('OTHER-ORDER', $agent, ['product_name' => 'Jacket']);

        $this->actingAs($operator)
            ->get('/order-product-matching?product_name='.$filterName)
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('orders/product-matching')
                ->loadDeferredProps(fn (Assert $deferredPage) => $deferredPage
                    ->where('orders.total', 2)
                    ->where('orders.data.0.product_name', $filterName)
                    ->where('orders.data.0.assigned_agent.name', $agent->name)
                )
            );

        $this->actingAs($operator)->post('/order-product-matching/bulk', [
            'order_ids' => [$firstOrder->id, $secondOrder->id],
            'inventory_product_id' => $product->id,
        ])->assertRedirect();

        $this->assertDatabaseHas('sheet_orders', [
            'id' => $firstOrder->id,
            'inventory_product_id' => $product->id,
        ]);
        $this->assertDatabaseHas('sheet_orders', [
            'id' => $secondOrder->id,
            'inventory_product_id' => $product->id,
        ]);
    }

    public function test_bulk_matching_rejects_products_outside_the_users_country_scope(): void
    {
        $operator = $this->user('Matching Security Operator', 'warehouse');
        $agent = $this->user('Matching Security Agent', 'agent');
        $otherMerchantProduct = $this->product($operator, 'Uganda Shoes', 'Acme', 'Uganda');
        $order = $this->order('MATCH-ORDER-3', $agent);

        $this->actingAs($operator)->from('/order-product-matching')->post('/order-product-matching/bulk', [
            'order_ids' => [$order->id],
            'inventory_product_id' => $otherMerchantProduct->id,
        ])->assertSessionHasErrors('inventory_product_id');

        $this->assertDatabaseHas('sheet_orders', [
            'id' => $order->id,
            'inventory_product_id' => null,
        ]);
    }
}
