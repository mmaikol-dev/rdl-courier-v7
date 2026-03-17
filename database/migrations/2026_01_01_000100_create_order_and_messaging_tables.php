<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sheets', function (Blueprint $table): void {
            $table->id();
            $table->string('sheet_id')->nullable()->index();
            $table->string('sheet_name');
            $table->string('shopify_name')->nullable();
            $table->text('access_token')->nullable();
            $table->string('country')->nullable();
            $table->json('cc_agents')->nullable();
            $table->string('sku')->nullable();
            $table->timestamps();
        });

        Schema::create('sheet_orders', function (Blueprint $table): void {
            $table->id();
            $table->string('order_no')->unique();
            $table->dateTime('order_date')->nullable();
            $table->decimal('amount', 12, 2)->default(0);
            $table->integer('quantity')->default(1);
            $table->string('item')->nullable();
            $table->dateTime('delivery_date')->nullable();
            $table->string('client_name')->nullable();
            $table->string('client_city')->nullable();
            $table->string('date')->nullable();
            $table->string('address')->nullable();
            $table->string('product_name')->nullable();
            $table->string('city')->nullable();
            $table->string('country')->nullable()->index();
            $table->string('phone', 50)->nullable();
            $table->boolean('confirmed')->default(false);
            $table->text('comments')->nullable();
            $table->string('agent')->nullable();
            $table->string('store_name')->nullable();
            $table->string('status')->nullable()->index();
            $table->string('code')->nullable();
            $table->string('order_type')->nullable();
            $table->string('alt_no')->nullable();
            $table->string('merchant')->nullable()->index();
            $table->string('cc_email')->nullable()->index();
            $table->text('instructions')->nullable();
            $table->string('invoice_code')->nullable();
            $table->string('sheet_id')->nullable()->index();
            $table->string('sheet_name')->nullable()->index();
            $table->unsignedTinyInteger('processed')->default(0);
            $table->timestamps();
        });

        Schema::create('order_histories', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('order_id')->constrained('sheet_orders')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('attribute');
            $table->text('old_value')->nullable();
            $table->text('new_value')->nullable();
            $table->timestamps();
        });

        Schema::create('c2b_transactions', function (Blueprint $table): void {
            $table->id();
            $table->string('transaction_id')->unique();
            $table->string('account_number')->index();
            $table->decimal('amount', 12, 2)->default(0);
            $table->string('payer_phone')->nullable();
            $table->boolean('processed')->default(false);
            $table->timestamps();
        });

        Schema::create('mpesa_transactions', function (Blueprint $table): void {
            $table->id();
            $table->string('transaction_id')->unique();
            $table->decimal('amount', 12, 2)->default(0);
            $table->string('phone_number')->nullable();
            $table->string('status')->nullable();
            $table->string('mpesa_receipts')->nullable();
            $table->string('order_no')->nullable()->index();
            $table->string('checkoutRequestID')->nullable();
            $table->timestamps();
        });

        Schema::create('whatsapp', function (Blueprint $table): void {
            $table->id();
            $table->string('to')->index();
            $table->string('client_name')->nullable();
            $table->string('store_name')->nullable();
            $table->text('message')->nullable();
            $table->json('cc_agents')->nullable();
            $table->string('status')->nullable();
            $table->string('sid')->nullable()->index();
            $table->string('type')->nullable();
            $table->timestamps();
        });

        Schema::create('app_scripts', function (Blueprint $table): void {
            $table->id();
            $table->json('payload')->nullable();
            $table->timestamps();
        });

        Schema::create('reports', function (Blueprint $table): void {
            $table->id();
            $table->string('name')->nullable();
            $table->string('type')->nullable();
            $table->json('filters')->nullable();
            $table->string('file_path')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('stks', function (Blueprint $table): void {
            $table->id();
            $table->string('phone')->nullable();
            $table->decimal('amount', 12, 2)->nullable();
            $table->string('order_no')->nullable();
            $table->string('status')->nullable();
            $table->json('payload')->nullable();
            $table->timestamps();
        });

        Schema::create('dispatches', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('sheet_order_id')->nullable()->constrained('sheet_orders')->nullOnDelete();
            $table->string('agent')->nullable();
            $table->string('status')->nullable();
            $table->timestamp('dispatched_at')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dispatches');
        Schema::dropIfExists('stks');
        Schema::dropIfExists('reports');
        Schema::dropIfExists('app_scripts');
        Schema::dropIfExists('whatsapp');
        Schema::dropIfExists('mpesa_transactions');
        Schema::dropIfExists('c2b_transactions');
        Schema::dropIfExists('order_histories');
        Schema::dropIfExists('sheet_orders');
        Schema::dropIfExists('sheets');
    }
};
