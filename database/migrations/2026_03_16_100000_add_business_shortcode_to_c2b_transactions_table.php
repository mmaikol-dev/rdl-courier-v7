<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('c2b_transactions', function (Blueprint $table): void {
            $table->string('business_shortcode')->nullable()->after('payer_phone');
        });
    }

    public function down(): void
    {
        Schema::table('c2b_transactions', function (Blueprint $table): void {
            $table->dropColumn('business_shortcode');
        });
    }
};
