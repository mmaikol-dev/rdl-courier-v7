<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('shipments')) {
            Schema::create('shipments', function (Blueprint $table): void {
                $table->id();
                $table->string('shipment_number')->nullable()->unique();
                $table->string('supplier');
                $table->string('supplier_reference')->nullable();
                $table->string('carrier')->nullable();
                $table->string('tracking_number')->nullable();
                $table->date('expected_on')->nullable();
                $table->unsignedInteger('cartons')->nullable();
                $table->string('warehouse_code', 16);
                $table->string('warehouse_name');
                $table->string('country')->index();
                $table->string('status')->default('EXPECTED')->index();
                $table->text('note')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('arrived_at')->nullable();
                $table->timestamp('received_at')->nullable();
                $table->timestamps();

                $table->index(['warehouse_code', 'status']);
                $table->index(['country', 'expected_on']);
            });
        } else {
            // Some installations already have a shipments table that is not
            // recorded in the migrations table. Add missing fields in place
            // so migrate can complete without deleting existing shipment data.
            $this->addMissingColumns('shipments', [
                'shipment_number' => fn (Blueprint $table) => $table->string('shipment_number')->nullable(),
                'supplier' => fn (Blueprint $table) => $table->string('supplier')->nullable(),
                'supplier_reference' => fn (Blueprint $table) => $table->string('supplier_reference')->nullable(),
                'carrier' => fn (Blueprint $table) => $table->string('carrier')->nullable(),
                'tracking_number' => fn (Blueprint $table) => $table->string('tracking_number')->nullable(),
                'expected_on' => fn (Blueprint $table) => $table->date('expected_on')->nullable(),
                'cartons' => fn (Blueprint $table) => $table->unsignedInteger('cartons')->nullable(),
                'warehouse_code' => fn (Blueprint $table) => $table->string('warehouse_code', 16)->nullable(),
                'warehouse_name' => fn (Blueprint $table) => $table->string('warehouse_name')->nullable(),
                'country' => fn (Blueprint $table) => $table->string('country')->nullable(),
                'status' => fn (Blueprint $table) => $table->string('status')->default('EXPECTED'),
                'note' => fn (Blueprint $table) => $table->text('note')->nullable(),
                'created_by' => fn (Blueprint $table) => $table->unsignedBigInteger('created_by')->nullable(),
                'received_by' => fn (Blueprint $table) => $table->unsignedBigInteger('received_by')->nullable(),
                'arrived_at' => fn (Blueprint $table) => $table->timestamp('arrived_at')->nullable(),
                'received_at' => fn (Blueprint $table) => $table->timestamp('received_at')->nullable(),
                'created_at' => fn (Blueprint $table) => $table->timestamp('created_at')->nullable(),
                'updated_at' => fn (Blueprint $table) => $table->timestamp('updated_at')->nullable(),
            ]);
        }

        if (! Schema::hasTable('shipment_items')) {
            Schema::create('shipment_items', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('shipment_id')->constrained('shipments')->cascadeOnDelete();
                $table->foreignId('product_id')->constrained('products')->restrictOnDelete();
                $table->string('product_name');
                $table->string('product_code')->nullable();
                $table->unsignedInteger('expected_quantity');
                $table->unsignedInteger('received_quantity')->default(0);
                $table->boolean('receipt_counted')->default(false);
                $table->timestamps();

                $table->unique(['shipment_id', 'product_id']);
                $table->index('product_id');
            });
        } else {
            $this->addMissingColumns('shipment_items', [
                'shipment_id' => fn (Blueprint $table) => $table->unsignedBigInteger('shipment_id')->nullable(),
                'product_id' => fn (Blueprint $table) => $table->unsignedBigInteger('product_id')->nullable(),
                'product_name' => fn (Blueprint $table) => $table->string('product_name')->nullable(),
                'product_code' => fn (Blueprint $table) => $table->string('product_code')->nullable(),
                'expected_quantity' => fn (Blueprint $table) => $table->unsignedInteger('expected_quantity')->default(0),
                'received_quantity' => fn (Blueprint $table) => $table->unsignedInteger('received_quantity')->default(0),
                'receipt_counted' => fn (Blueprint $table) => $table->boolean('receipt_counted')->default(false),
                'created_at' => fn (Blueprint $table) => $table->timestamp('created_at')->nullable(),
                'updated_at' => fn (Blueprint $table) => $table->timestamp('updated_at')->nullable(),
            ]);
        }
    }

    /** @param array<string, callable(Blueprint): void> $columns */
    private function addMissingColumns(string $tableName, array $columns): void
    {
        foreach ($columns as $columnName => $definition) {
            if (Schema::hasColumn($tableName, $columnName)) {
                continue;
            }

            Schema::table($tableName, $definition);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('shipment_items');
        Schema::dropIfExists('shipments');
    }
};
