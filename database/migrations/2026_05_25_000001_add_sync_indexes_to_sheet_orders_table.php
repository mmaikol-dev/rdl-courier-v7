<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('sheet_orders')) {
            return;
        }

        Schema::table('sheet_orders', function (Blueprint $table): void {
            if (! Schema::hasIndex('sheet_orders', 'sheet_orders_sync_due_index')) {
                $table->index(['updated_at', 'sheet_id', 'sheet_name'], 'sheet_orders_sync_due_index');
            }

            if (! Schema::hasIndex('sheet_orders', 'sheet_orders_order_no_index')) {
                $table->index(['order_no'], 'sheet_orders_order_no_index');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('sheet_orders')) {
            return;
        }

        Schema::table('sheet_orders', function (Blueprint $table): void {
            if (Schema::hasIndex('sheet_orders', 'sheet_orders_sync_due_index')) {
                $table->dropIndex('sheet_orders_sync_due_index');
            }

            if (Schema::hasIndex('sheet_orders', 'sheet_orders_order_no_index')) {
                $table->dropIndex('sheet_orders_order_no_index');
            }
        });
    }
};
