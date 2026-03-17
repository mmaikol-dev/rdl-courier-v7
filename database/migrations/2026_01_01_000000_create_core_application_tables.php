<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table): void {
            $table->id();
            $table->uuid('uuid')->nullable()->unique();
            $table->string('photo')->nullable();
            $table->string('name');
            $table->string('username')->nullable()->unique();
            $table->string('email')->unique();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password');
            $table->string('store_name')->nullable();
            $table->string('store_address')->nullable();
            $table->string('store_phone', 50)->nullable();
            $table->string('store_email')->nullable();
            $table->string('roles')->nullable()->default('user');
            $table->rememberToken();
            $table->timestamps();
        });

        Schema::create('units', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('short_code')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('categories', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('short_code')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('tax_types', function (Blueprint $table): void {
            $table->id();
            $table->string('name')->unique();
            $table->string('code')->nullable()->unique();
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('products', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('code')->unique();
            $table->integer('quantity')->default(0);
            $table->integer('quantity_alert')->nullable();
            $table->decimal('buying_price', 12, 2)->nullable();
            $table->decimal('selling_price', 12, 2)->nullable();
            $table->decimal('tax', 12, 2)->nullable();
            $table->string('tax_type')->nullable();
            $table->text('notes')->nullable();
            $table->string('product_image')->nullable();
            $table->foreignId('category_id')->nullable()->constrained()->nullOnDelete();
            $table->string('store_name')->nullable();
            $table->foreignId('unit_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedBigInteger('movement_score')->default(0);
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->uuid('uuid')->nullable()->index();
            $table->timestamps();
        });

        Schema::create('inventory_logs', function (Blueprint $table): void {
            $table->id();
            $table->string('product_name');
            $table->string('product_code')->index();
            $table->integer('quantity_added');
            $table->integer('remaining_qnty');
            $table->string('added_by')->nullable();
            $table->unsignedBigInteger('product_unit_id')->nullable();
            $table->dateTime('date_added')->nullable();
            $table->timestamps();
        });

        Schema::create('barcodes', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->string('product_code')->nullable()->index();
            $table->string('product_name')->nullable();
            $table->string('barcode')->index();
            $table->string('operation_type', 20);
            $table->string('scanned_by')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->dateTime('scanned_at')->nullable();
            $table->timestamps();
        });

        Schema::create('transfers', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('merchant')->nullable()->index();
            $table->integer('quantity');
            $table->foreignId('agent_id')->nullable()->constrained('users')->nullOnDelete();
            $table->date('date')->nullable();
            $table->string('region');
            $table->string('transfer_by')->nullable();
            $table->string('store_name')->nullable();
            $table->string('from')->nullable();
            $table->timestamps();
        });

        Schema::create('deductions', function (Blueprint $table): void {
            $table->id();
            $table->string('code')->unique();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('agent_id')->nullable()->constrained('users')->nullOnDelete();
            $table->integer('quantity');
            $table->string('reason', 500)->nullable();
            $table->string('deducted_by')->nullable();
            $table->timestamps();
        });

        Schema::create('requisition_categories', function (Blueprint $table): void {
            $table->id();
            $table->string('name')->unique();
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('daily_budgets', function (Blueprint $table): void {
            $table->id();
            $table->date('budget_date')->unique();
            $table->decimal('initial_amount', 12, 2)->default(0);
            $table->decimal('current_amount', 12, 2)->default(0);
            $table->decimal('spent_amount', 12, 2)->default(0);
            $table->timestamps();
        });

        Schema::create('budget_top_ups', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('daily_budget_id')->constrained()->cascadeOnDelete();
            $table->decimal('amount', 12, 2);
            $table->string('reason')->nullable();
            $table->foreignId('added_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('budget_transactions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('daily_budget_id')->constrained()->cascadeOnDelete();
            $table->string('type', 50);
            $table->decimal('amount', 12, 2);
            $table->decimal('balance_before', 12, 2)->default(0);
            $table->decimal('balance_after', 12, 2)->default(0);
            $table->string('reference_type')->nullable();
            $table->unsignedBigInteger('reference_id')->nullable();
            $table->text('description')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('requisitions', function (Blueprint $table): void {
            $table->id();
            $table->string('requisition_number')->unique();
            $table->foreignId('category_id')->constrained('requisition_categories')->restrictOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('title')->nullable();
            $table->text('description')->nullable();
            $table->decimal('total_amount', 12, 2)->default(0);
            $table->string('status', 30)->default('pending');
            $table->string('priority', 30)->nullable();
            $table->date('requisition_date');
            $table->foreignId('daily_budget_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('requisition_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('requisition_id')->constrained()->cascadeOnDelete();
            $table->string('item_name');
            $table->text('description')->nullable();
            $table->integer('quantity');
            $table->decimal('unit_price', 12, 2);
            $table->decimal('total_price', 12, 2);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('requisition_items');
        Schema::dropIfExists('requisitions');
        Schema::dropIfExists('budget_transactions');
        Schema::dropIfExists('budget_top_ups');
        Schema::dropIfExists('daily_budgets');
        Schema::dropIfExists('requisition_categories');
        Schema::dropIfExists('deductions');
        Schema::dropIfExists('transfers');
        Schema::dropIfExists('barcodes');
        Schema::dropIfExists('inventory_logs');
        Schema::dropIfExists('products');
        Schema::dropIfExists('tax_types');
        Schema::dropIfExists('categories');
        Schema::dropIfExists('units');
        Schema::dropIfExists('users');
    }
};
