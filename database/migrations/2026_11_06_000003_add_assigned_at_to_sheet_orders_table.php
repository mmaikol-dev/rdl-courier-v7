<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('sheet_orders') || Schema::hasColumn('sheet_orders', 'assigned_at')) {
            return;
        }

        Schema::table('sheet_orders', function (Blueprint $table): void {
            $table->timestamp('assigned_at')->nullable()->after('agent_id');
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('sheet_orders') || ! Schema::hasColumn('sheet_orders', 'assigned_at')) {
            return;
        }

        Schema::table('sheet_orders', function (Blueprint $table): void {
            $table->dropColumn('assigned_at');
        });
    }
};
