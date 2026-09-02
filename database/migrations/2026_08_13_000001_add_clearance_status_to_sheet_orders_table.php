<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sheet_orders', function (Blueprint $table): void {
            $table->string('clearance_status', 20)->default('not_cleared')->after('remitted_by');
        });
    }

    public function down(): void
    {
        Schema::table('sheet_orders', function (Blueprint $table): void {
            $table->dropColumn('clearance_status');
        });
    }
};
