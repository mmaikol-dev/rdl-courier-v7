<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Country;
use App\Models\IncomingSheetOrder;
use App\Models\MerchantApiIntegration;
use App\Models\Product;
use App\Models\SheetOrder;
use App\Models\Unit;
use App\Models\User;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Str;
use Tests\TestCase;

class MerchantApiWriteTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        foreach ([
            'merchant_api_request_logs', 'order_histories', 'inventory_logs', 'sheet_orders',
            'incoming_sheet_orders', 'merchant_api_integrations', 'products', 'categories',
            'units', 'countries', 'users',
        ] as $table) {
            Schema::dropIfExists($table);
        }

        Schema::create('users', function (Blueprint $table): void {
            $table->id();
            $table->uuid()->nullable();
            $table->string('photo')->nullable();
            $table->string('name');
            $table->string('username')->nullable();
            $table->string('email')->unique();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password');
            $table->string('store_name')->nullable();
            $table->string('store_address')->nullable();
            $table->string('store_phone')->nullable();
            $table->string('store_email')->nullable();
            $table->string('roles')->nullable();
            $table->unsignedBigInteger('country_id')->nullable();
            $table->boolean('merchant_api_enabled')->default(false);
            $table->json('merchant_api_scopes')->nullable();
            $table->rememberToken();
            $table->timestamps();
        });

        Schema::create('countries', function (Blueprint $table): void {
            $table->id();
            $table->string('name')->unique();
            $table->string('code')->nullable();
            $table->string('currency')->nullable();
            $table->timestamps();
        });

        Schema::create('categories', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('short_code')->nullable();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->timestamps();
        });

        Schema::create('units', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('short_code')->nullable();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->timestamps();
        });

        Schema::create('products', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->uuid('uuid')->nullable();
            $table->string('name');
            $table->string('code')->unique();
            $table->string('slug')->unique();
            $table->decimal('quantity', 12, 2)->default(0);
            $table->unsignedInteger('quantity_alert')->nullable();
            $table->decimal('buying_price', 12, 2)->nullable();
            $table->decimal('selling_price', 12, 2)->nullable();
            $table->decimal('tax', 8, 2)->nullable();
            $table->string('tax_type')->nullable();
            $table->text('notes')->nullable();
            $table->string('product_image')->nullable();
            $table->unsignedBigInteger('category_id')->nullable();
            $table->string('store_name')->nullable();
            $table->string('merchant')->nullable();
            $table->string('country')->nullable();
            $table->unsignedBigInteger('unit_id')->nullable();
            $table->integer('movement_score')->nullable();
            $table->timestamps();
        });

        Schema::create('merchant_api_integrations', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('merchant_user_id');
            $table->string('name');
            $table->string('token_hash')->unique();
            $table->string('token_prefix');
            $table->json('scopes')->nullable();
            $table->string('webhook_url')->nullable();
            $table->text('webhook_secret')->nullable();
            $table->json('webhook_events')->nullable();
            $table->json('transfer_fields')->nullable();
            $table->json('cc_emails')->nullable();
            $table->json('cc_country_assignments')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();
        });

        Schema::create('incoming_sheet_orders', function (Blueprint $table): void {
            $table->id();
            $table->string('source_hash')->unique();
            $table->string('order_no');
            $table->string('sheet_id')->nullable();
            $table->string('sheet_name')->nullable();
            $table->json('payload');
            $table->string('status')->default('pending');
            $table->unsignedInteger('attempts')->default(0);
            $table->text('error_message')->nullable();
            $table->timestamp('processed_at')->nullable();
            $table->timestamp('available_at')->nullable();
            $table->timestamps();
        });

        Schema::create('sheet_orders', function (Blueprint $table): void {
            $table->id();
            $table->string('order_no');
            $table->dateTime('order_date')->nullable();
            $table->decimal('amount', 12, 2)->nullable();
            $table->integer('quantity')->nullable();
            $table->string('product_name')->nullable();
            $table->dateTime('delivery_date')->nullable();
            $table->string('client_name')->nullable();
            $table->text('address')->nullable();
            $table->string('city')->nullable();
            $table->string('country')->nullable();
            $table->string('phone')->nullable();
            $table->string('alt_no')->nullable();
            $table->string('merchant')->nullable();
            $table->string('status')->nullable();
            $table->text('instructions')->nullable();
            $table->string('code')->nullable();
            $table->string('sheet_id')->nullable();
            $table->string('sheet_name')->nullable();
            $table->timestamp('inventory_deducted_at')->nullable();
            $table->dateTime('edited_at')->nullable();
            $table->timestamps();
        });

        Schema::create('order_histories', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('order_id');
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('attribute');
            $table->text('old_value')->nullable();
            $table->text('new_value')->nullable();
            $table->timestamps();
        });

        Schema::create('inventory_logs', function (Blueprint $table): void {
            $table->id();
            $table->string('product_name');
            $table->string('product_code');
            $table->decimal('quantity_added', 12, 2);
            $table->decimal('remaining_qnty', 12, 2);
            $table->string('added_by')->nullable();
            $table->unsignedBigInteger('product_unit_id')->nullable();
            $table->dateTime('date_added')->nullable();
            $table->timestamps();
        });

        Schema::create('merchant_api_request_logs', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('merchant_api_integration_id');
            $table->string('method');
            $table->string('path');
            $table->unsignedSmallInteger('status_code');
            $table->unsignedInteger('duration_ms')->default(0);
            $table->timestamp('requested_at');
            $table->timestamps();
        });
    }

    private function merchantApi(array $scopes): array
    {
        $merchant = User::factory()->create([
            'name' => 'CODSwiftly',
            'roles' => 'merchant',
            'merchant_api_enabled' => true,
            'merchant_api_scopes' => $scopes,
            'store_address' => 'Uganda',
            'store_name' => 'CODSwiftly',
        ]);
        $token = 'rdl_live_'.Str::random(40);
        MerchantApiIntegration::create([
            'merchant_user_id' => $merchant->id,
            'name' => 'CODSwiftly API',
            'token_hash' => hash('sha256', $token),
            'token_prefix' => substr($token, 0, 16),
            'scopes' => $scopes,
            'webhook_events' => [],
            'is_active' => true,
        ]);

        return [$merchant, $token];
    }

    public function test_products_can_be_created_with_a_merchant_supplied_sku_and_merchant_country(): void
    {
        [$merchant, $token] = $this->merchantApi(['products:write']);
        Country::firstOrCreate(['name' => 'Uganda'], ['code' => 'UG', 'currency' => 'UGX']);
        Country::firstOrCreate(['name' => 'Kenya'], ['code' => 'KE', 'currency' => 'KES']);
        Category::firstOrCreate(['slug' => 'merchant-products'], ['name' => 'Merchant products', 'user_id' => $merchant->id]);
        Unit::firstOrCreate(['slug' => 'piece'], ['name' => 'Piece', 'short_code' => 'pc', 'user_id' => $merchant->id]);

        $response = $this->withToken($token)->postJson('/api/merchant/v1/products', [
            'name' => 'Example item',
            'sku' => 'ANY-MERCHANT-CODE-7788',
            'country' => 'Uganda',
            'quantity' => 0,
        ]);

        $response->assertCreated()
            ->assertJsonPath('product.sku', 'ANY-MERCHANT-CODE-7788')
            ->assertJsonPath('product.country', 'Uganda');

        $this->assertDatabaseHas('products', [
            'code' => 'ANY-MERCHANT-CODE-7788',
            'merchant' => $merchant->name,
            'user_id' => $merchant->id,
            'country' => 'Uganda',
            'buying_price' => 0,
            'selling_price' => 0,
            'quantity_alert' => 0,
        ]);
        $createdProduct = Product::query()->where('code', 'ANY-MERCHANT-CODE-7788')->firstOrFail();
        $this->assertNotNull($createdProduct->category_id);
        $this->assertDatabaseHas('categories', ['id' => $createdProduct->category_id]);

        $this->withToken($token)->postJson('/api/merchant/v1/products', [
            'name' => 'Wrong country item',
            'sku' => 'ANOTHER-USER-SUPPLIED-CODE',
            'country' => 'Kenya',
        ])->assertCreated()->assertJsonPath('product.country', 'Kenya');
    }

    public function test_processed_orders_can_be_edited_and_cancelled_before_dispatch(): void
    {
        Queue::fake();
        [, $token] = $this->merchantApi(['orders:write']);
        $externalId = 'codswiftly-ug-1001';

        $this->withToken($token)->postJson('/api/merchant/v1/orders', [
            'external_order_id' => $externalId,
            'order_no' => 'CSW-1001',
            'amount' => 500,
            'quantity' => 1,
            'client_name' => 'Jane',
        ])->assertAccepted();

        $sourceHash = hash('sha256', json_encode([
            'source' => 'merchant-api',
            'integration_id' => MerchantApiIntegration::query()->value('id'),
            'external_order_id' => $externalId,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

        $incoming = IncomingSheetOrder::query()->where('source_hash', $sourceHash)->firstOrFail();
        $incoming->forceFill(['status' => 'processed'])->save();
        SheetOrder::withoutEvents(fn () => SheetOrder::create([
            'order_no' => 'CSW-1001',
            'amount' => 500,
            'quantity' => 1,
            'client_name' => 'Jane',
            'merchant' => 'CODSwiftly',
            'country' => 'Uganda',
            'sheet_id' => 'merchant-api:'.MerchantApiIntegration::query()->value('id'),
            'sheet_name' => 'Merchant API',
            'status' => 'New Orders',
        ]));

        $this->withToken($token)->patchJson("/api/merchant/v1/orders/{$externalId}", [
            'phone' => '+256700000000',
        ])->assertOk()->assertJsonPath('order.phone', '+256700000000');

        $this->withToken($token)->patchJson("/api/merchant/v1/orders/{$externalId}", [
            'status' => 'Scheduled',
        ])->assertOk()->assertJsonPath('order.status', 'Scheduled');

        $this->withToken($token)->patchJson("/api/merchant/v1/orders/{$externalId}", [
            'status' => 'New Orders',
        ])->assertOk()->assertJsonPath('order.status', 'New Orders');

        $this->withToken($token)->patchJson("/api/merchant/v1/orders/{$externalId}", [
            'status' => 'Delivered',
        ])->assertUnprocessable();

        $this->withToken($token)->patchJson("/api/merchant/v1/orders/{$externalId}", [
            'status' => 'Cancelled',
        ])->assertOk()->assertJsonPath('order.status', 'Cancelled');

    }

    public function test_api_orders_leave_the_code_column_null(): void
    {
        Queue::fake();
        [, $token] = $this->merchantApi(['orders:write']);

        $this->withToken($token)->postJson('/api/merchant/v1/orders', [
            'external_order_id' => 'codswiftly-ug-code-null',
            'order_no' => 'CSW-CODE-NULL',
            'amount' => 250,
            'quantity' => 1,
            'code' => 'MERCHANT-SUPPLIED-CODE',
        ])->assertAccepted();

        $incoming = IncomingSheetOrder::query()->firstOrFail();
        $this->assertArrayHasKey('code', $incoming->payload);
        $this->assertNull($incoming->payload['code']);
    }
}
