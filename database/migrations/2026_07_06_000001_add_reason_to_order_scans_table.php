<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('order_scans', function (Blueprint $table) {
            $table->text('reason')->nullable()->after('scan_type');
        });
    }

    public function down(): void
    {
        Schema::table('order_scans', function (Blueprint $table) {
            $table->dropColumn('reason');
        });
    }
};
