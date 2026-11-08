<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('sheet_orders')) {
            return;
        }

        if (! Schema::hasColumn('sheet_orders', 'edited_at')) {
            Schema::table('sheet_orders', function (Blueprint $table): void {
                $table->timestamp('edited_at')->nullable()->after('updated_at');
            });
        }

        DB::table('sheet_orders')
            ->whereNotNull('updated_at')
            ->whereNotNull('sheet_id')
            ->whereNotNull('sheet_name')
            ->update([
                'edited_at' => DB::raw('updated_at'),
                'updated_at' => null,
            ]);
    }

    public function down(): void
    {
        if (Schema::hasTable('sheet_orders') && Schema::hasColumn('sheet_orders', 'edited_at')) {
            DB::table('sheet_orders')
                ->whereNull('updated_at')
                ->whereNotNull('edited_at')
                ->update(['updated_at' => DB::raw('edited_at')]);

            Schema::table('sheet_orders', function (Blueprint $table): void {
                $table->dropColumn('edited_at');
            });
        }
    }
};
