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
            if (! Schema::hasColumn('sheet_orders', 'sheet_update_attempts')) {
                $table->unsignedInteger('sheet_update_attempts')->default(0)->after('edited_at');
            }

            if (! Schema::hasColumn('sheet_orders', 'sheet_update_last_error')) {
                $table->text('sheet_update_last_error')->nullable()->after('sheet_update_attempts');
            }

            if (! Schema::hasColumn('sheet_orders', 'sheet_update_last_attempted_at')) {
                $table->timestamp('sheet_update_last_attempted_at')->nullable()->after('sheet_update_last_error');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('sheet_orders')) {
            return;
        }

        Schema::table('sheet_orders', function (Blueprint $table): void {
            $columns = array_filter([
                Schema::hasColumn('sheet_orders', 'sheet_update_last_attempted_at') ? 'sheet_update_last_attempted_at' : null,
                Schema::hasColumn('sheet_orders', 'sheet_update_last_error') ? 'sheet_update_last_error' : null,
                Schema::hasColumn('sheet_orders', 'sheet_update_attempts') ? 'sheet_update_attempts' : null,
            ]);

            if ($columns !== []) {
                $table->dropColumn($columns);
            }
        });
    }
};
