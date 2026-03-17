<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sheet_orders', function (Blueprint $table): void {
            $table->timestamp('delivered_at')->nullable()->after('updated_at');
            $table->unsignedBigInteger('delivered_by')->nullable()->after('delivered_at');
            $table->timestamp('report_generated_at')->nullable()->after('delivered_by');
            $table->unsignedBigInteger('report_generated_by')->nullable()->after('report_generated_at');
            $table->timestamp('merchant_confirmed_at')->nullable()->after('report_generated_by');
            $table->unsignedBigInteger('merchant_confirmed_by')->nullable()->after('merchant_confirmed_at');
            $table->timestamp('remitted_at')->nullable()->after('merchant_confirmed_by');
            $table->unsignedBigInteger('remitted_by')->nullable()->after('remitted_at');
        });
    }

    public function down(): void
    {
        Schema::table('sheet_orders', function (Blueprint $table): void {
            $table->dropColumn([
                'delivered_at',
                'delivered_by',
                'report_generated_at',
                'report_generated_by',
                'merchant_confirmed_at',
                'merchant_confirmed_by',
                'remitted_at',
                'remitted_by',
            ]);
        });
    }
};
