<?php

namespace Tests\Feature;

use App\Models\Deduction;
use App\Models\Product;
use App\Models\Transfer;
use App\Models\User;
use App\Services\OpenwaService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Covers the "Returned quantities" flow — an agent sending products back to
 * the main office. One return deducts the product from several agents at
 * once, every row of that return shares one generated code
 * (RET-001-2026-04-24, RET-001-2026-04-24-02, ...) and only the selected
 * agents are touched.
 *
 * Must run under phpunit.local.xml: the sqlite in-memory schema has no
 * transfers/deductions tables.
 */
class TransferReturnTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();

        $this->mock(OpenwaService::class, function ($mock) {
            $mock->shouldReceive('sendToGroup')->andReturn([
                'to' => 'group@example.test',
                'message_id' => 'test-message-id',
            ]);
        });
    }

    private function operator(string $country = 'Kenya'): User
    {
        return User::create([
            'name' => 'Operator ' . Str::random(4),
            'email' => Str::lower(Str::random(12)) . '@example.test',
            'password' => bcrypt('password'),
            'email_verified_at' => now(),
            'roles' => 'admin',
            'store_address' => $country,
            'store_name' => 'Operator store',
        ]);
    }

    private function agent(string $name, string $country = 'Kenya'): User
    {
        return User::create([
            'name' => $name,
            'email' => Str::lower(Str::random(12)) . '@example.test',
            'password' => bcrypt('password'),
            'email_verified_at' => now(),
            'roles' => 'agent',
            'store_address' => $country,
            'store_name' => $name . ' store',
        ]);
    }

    private function product(User $owner, string $name = 'Returnable Widget', string $country = 'Kenya'): Product
    {
        return Product::create([
            'uuid' => (string) Str::uuid(),
            'user_id' => $owner->id,
            'name' => $name,
            'slug' => Str::slug($name) . '-' . Str::random(6),
            'code' => 'RET-TEST-' . Str::upper(Str::random(8)),
            'quantity' => 100,
            'buying_price' => 10,
            'selling_price' => 20,
            'quantity_alert' => 5,
            'unit_id' => DB::table('units')->value('id'),
            'country' => $country,
            'merchant' => 'Test Merchant',
        ]);
    }

    private function transfer(Product $product, User $agent, int $quantity, string $country = 'Kenya'): Transfer
    {
        return Transfer::create([
            'product_id' => $product->id,
            'merchant' => $product->merchant,
            'quantity' => $quantity,
            'agent_id' => $agent->id,
            'date' => now()->toDateString(),
            'region' => 'Nairobi',
            'store_name' => $product->name,
            'from' => 'Main Warehouse',
            'country' => $country,
            'transfer_by' => 'Seeder',
        ]);
    }

    public function test_a_return_deducts_the_product_from_the_selected_agents_only()
    {
        $operator = $this->operator();
        $product = $this->product($operator);
        $first = $this->agent('First Agent');
        $second = $this->agent('Second Agent');
        $skipped = $this->agent('Skipped Agent');

        $this->transfer($product, $first, 5);
        $this->transfer($product, $second, 3);
        $this->transfer($product, $skipped, 7);

        $response = $this->actingAs($operator)->postJson('/transfers/bulk-deduct', [
            'product_id' => $product->id,
            'agent_ids' => [$first->id, $second->id],
        ]);

        $response->assertOk()->assertJsonPath('agents', 2)->assertJsonPath('units', 8);

        $deductions = Deduction::query()
            ->where('product_id', $product->id)
            ->orderBy('id')
            ->get();

        $this->assertCount(2, $deductions);
        $this->assertSame(5, (int) $deductions[0]->quantity);
        $this->assertSame(3, (int) $deductions[1]->quantity);
        $this->assertSame($first->id, (int) $deductions[0]->agent_id);
        $this->assertSame($second->id, (int) $deductions[1]->agent_id);

        $base = $deductions[0]->code;
        $this->assertMatchesRegularExpression('/^RET-\d{3}-\d{4}-\d{2}-\d{2}$/', $base);
        $this->assertSame($base . '-02', $deductions[1]->code);
        $this->assertSame('Product returned to main office', $deductions[0]->reason);

        $this->assertDatabaseMissing('deductions', [
            'product_id' => $product->id,
            'agent_id' => $skipped->id,
        ]);
    }

    public function test_a_return_only_takes_what_the_agent_has_left()
    {
        $operator = $this->operator();
        $product = $this->product($operator);
        $agent = $this->agent('Half Returned Agent');

        $this->transfer($product, $agent, 10);

        Deduction::create([
            'code' => 'PRE-' . Str::upper(Str::random(8)),
            'product_id' => $product->id,
            'agent_id' => $agent->id,
            'quantity' => 4,
            'reason' => 'Earlier write-off',
            'deducted_by' => 'Seeder',
            'country' => 'Kenya',
        ]);

        $this->actingAs($operator)->postJson('/transfers/bulk-deduct', [
            'product_id' => $product->id,
            'agent_ids' => [$agent->id],
        ])->assertOk()->assertJsonPath('units', 6);

        $this->assertDatabaseHas('deductions', [
            'product_id' => $product->id,
            'agent_id' => $agent->id,
            'quantity' => 6,
        ]);
    }

    public function test_each_return_gets_its_own_code_number()
    {
        $operator = $this->operator();
        $product = $this->product($operator);
        $agent = $this->agent('Twice Returning Agent');

        $this->transfer($product, $agent, 5);

        $this->actingAs($operator)->postJson('/transfers/bulk-deduct', [
            'product_id' => $product->id,
            'agent_ids' => [$agent->id],
        ])->assertOk();

        $this->transfer($product, $agent, 4);

        $this->actingAs($operator)->postJson('/transfers/bulk-deduct', [
            'product_id' => $product->id,
            'agent_ids' => [$agent->id],
        ])->assertOk();

        $codes = Deduction::query()
            ->where('product_id', $product->id)
            ->orderBy('id')
            ->pluck('code')
            ->all();

        $this->assertCount(2, $codes);
        $this->assertSame(1, preg_match('/^RET-(\d{3})-\d{4}-\d{2}-\d{2}$/', $codes[0], $matches));
        $this->assertSame(1, preg_match('/^RET-(\d{3})-\d{4}-\d{2}-\d{2}$/', $codes[1], $secondMatches));

        $this->assertSame((int) $matches[1] + 1, (int) $secondMatches[1]);
    }

    public function test_a_return_needs_at_least_one_agent()
    {
        $operator = $this->operator();
        $product = $this->product($operator);

        $this->actingAs($operator)->postJson('/transfers/bulk-deduct', [
            'product_id' => $product->id,
            'agent_ids' => [],
        ])->assertStatus(422)->assertJsonValidationErrors('agent_ids');

        $this->assertDatabaseCount('deductions', Deduction::query()->count());
    }

    public function test_agents_from_another_country_cannot_be_deducted()
    {
        $operator = $this->operator();
        $product = $this->product($operator);
        $otherCountryAgent = $this->agent('Ugandan Agent', 'Uganda');

        $this->transfer($product, $otherCountryAgent, 5, 'Uganda');

        $this->actingAs($operator)->postJson('/transfers/bulk-deduct', [
            'product_id' => $product->id,
            'agent_ids' => [$otherCountryAgent->id],
        ])->assertStatus(422);

        $this->assertDatabaseMissing('deductions', [
            'product_id' => $product->id,
            'agent_id' => $otherCountryAgent->id,
        ]);
    }

    public function test_only_products_with_stock_held_by_agents_are_listed()
    {
        $operator = $this->operator();
        $held = $this->product($operator, 'Held Product');
        $notHeld = $this->product($operator, 'Never Transferred Product');
        $agent = $this->agent('Holder Agent');

        $this->transfer($held, $agent, 4);

        $response = $this->actingAs($operator)->getJson('/transfers/returnable-products?search=Product');
        $response->assertOk();

        $ids = collect($response->json())->pluck('id')->all();

        $this->assertContains($held->id, $ids);
        $this->assertNotContains($notHeld->id, $ids);
    }

    public function test_the_holders_of_a_product_show_what_is_left()
    {
        $operator = $this->operator();
        $product = $this->product($operator);
        $agent = $this->agent('Holding Agent');

        $this->transfer($product, $agent, 9);

        Deduction::create([
            'code' => 'PRE-' . Str::upper(Str::random(8)),
            'product_id' => $product->id,
            'agent_id' => $agent->id,
            'quantity' => 2,
            'reason' => 'Earlier write-off',
            'deducted_by' => 'Seeder',
            'country' => 'Kenya',
        ]);

        $response = $this->actingAs($operator)->getJson('/transfers/product-holders?product_id=' . $product->id);
        $response->assertOk();

        $holders = collect($response->json('agents'));

        $this->assertCount(1, $holders);
        $this->assertSame($agent->id, (int) $holders[0]['agent_id']);
        $this->assertSame(9, (int) $holders[0]['transferred']);
        $this->assertSame(2, (int) $holders[0]['deducted']);
        $this->assertSame(7, (int) $holders[0]['remaining']);
    }
}
