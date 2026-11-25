<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('merchant_api_integrations') && ! Schema::hasColumn('merchant_api_integrations', 'cc_country_assignments')) {
            Schema::table('merchant_api_integrations', function (Blueprint $table): void {
                $table->json('cc_country_assignments')->nullable()->after('cc_emails');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('merchant_api_integrations', 'cc_country_assignments')) {
            Schema::table('merchant_api_integrations', function (Blueprint $table): void {
                $table->dropColumn('cc_country_assignments');
            });
        }
    }
};
