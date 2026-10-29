<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('merchant_api_integrations') && ! Schema::hasColumn('merchant_api_integrations', 'transfer_fields')) {
            Schema::table('merchant_api_integrations', function (Blueprint $table): void {
                $table->json('transfer_fields')->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('merchant_api_integrations', 'transfer_fields')) {
            Schema::table('merchant_api_integrations', function (Blueprint $table): void {
                $table->dropColumn('transfer_fields');
            });
        }
    }
};
