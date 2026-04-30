<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sheet_orders', function (Blueprint $table): void {
            $table->timestamp('inventory_deducted_at')->nullable()->after('remitted_by');
            $table->unsignedBigInteger('inventory_deducted_by')->nullable()->after('inventory_deducted_at');
            $table->unsignedBigInteger('inventory_product_id')->nullable()->after('inventory_deducted_by');
        });
    }

    public function down(): void
    {
        Schema::table('sheet_orders', function (Blueprint $table): void {
            $table->dropColumn([
                'inventory_deducted_at',
                'inventory_deducted_by',
                'inventory_product_id',
            ]);
        });
    }
};
