<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('c2b_transactions')) {
            Schema::table('c2b_transactions', function (Blueprint $table): void {
                if (! Schema::hasColumn('c2b_transactions', 'last_attempted_at')) {
                    $table->timestamp('last_attempted_at')->nullable()->after('processed');
                }
            });

            Schema::table('c2b_transactions', function (Blueprint $table): void {
                if (! Schema::hasIndex('c2b_transactions', 'c2b_transactions_processed_attempted_index')) {
                    $table->index(['processed', 'last_attempted_at'], 'c2b_transactions_processed_attempted_index');
                }

                if (! Schema::hasIndex('c2b_transactions', 'c2b_transactions_account_number_index')) {
                    $table->index('account_number', 'c2b_transactions_account_number_index');
                }
            });
        }

        if (Schema::hasTable('sheet_orders')) {
            Schema::table('sheet_orders', function (Blueprint $table): void {
                if (! Schema::hasIndex('sheet_orders', 'sheet_orders_processed_index')) {
                    $table->index('processed', 'sheet_orders_processed_index');
                }

                if (! Schema::hasIndex('sheet_orders', 'sheet_orders_sheet_lookup_index')) {
                    $table->index(['sheet_id', 'sheet_name'], 'sheet_orders_sheet_lookup_index');
                }
            });
        }

        if (Schema::hasTable('incoming_sheet_orders')) {
            Schema::table('incoming_sheet_orders', function (Blueprint $table): void {
                if (! Schema::hasIndex('incoming_sheet_orders', 'incoming_sheet_orders_status_available_index')) {
                    $table->index(['status', 'available_at'], 'incoming_sheet_orders_status_available_index');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('incoming_sheet_orders')) {
            Schema::table('incoming_sheet_orders', function (Blueprint $table): void {
                if (Schema::hasIndex('incoming_sheet_orders', 'incoming_sheet_orders_status_available_index')) {
                    $table->dropIndex('incoming_sheet_orders_status_available_index');
                }
            });
        }

        if (Schema::hasTable('sheet_orders')) {
            Schema::table('sheet_orders', function (Blueprint $table): void {
                if (Schema::hasIndex('sheet_orders', 'sheet_orders_sheet_lookup_index')) {
                    $table->dropIndex('sheet_orders_sheet_lookup_index');
                }

                if (Schema::hasIndex('sheet_orders', 'sheet_orders_processed_index')) {
                    $table->dropIndex('sheet_orders_processed_index');
                }
            });
        }

        if (Schema::hasTable('c2b_transactions')) {
            Schema::table('c2b_transactions', function (Blueprint $table): void {
                if (Schema::hasIndex('c2b_transactions', 'c2b_transactions_account_number_index')) {
                    $table->dropIndex('c2b_transactions_account_number_index');
                }

                if (Schema::hasIndex('c2b_transactions', 'c2b_transactions_processed_attempted_index')) {
                    $table->dropIndex('c2b_transactions_processed_attempted_index');
                }
            });

            Schema::table('c2b_transactions', function (Blueprint $table): void {
                if (Schema::hasColumn('c2b_transactions', 'last_attempted_at')) {
                    $table->dropColumn('last_attempted_at');
                }
            });
        }
    }
};
