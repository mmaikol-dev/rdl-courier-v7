<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('sheet_orders') && ! Schema::hasColumn('sheet_orders', 'inventory_deduction_actor')) {
            Schema::table('sheet_orders', function (Blueprint $table): void {
                $table->string('inventory_deduction_actor', 50)->nullable()->after('inventory_deducted_by');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('sheet_orders') && Schema::hasColumn('sheet_orders', 'inventory_deduction_actor')) {
            Schema::table('sheet_orders', function (Blueprint $table): void {
                $table->dropColumn('inventory_deduction_actor');
            });
        }
    }
};
