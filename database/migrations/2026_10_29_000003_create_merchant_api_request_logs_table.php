<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('merchant_api_request_logs')) {
            Schema::create('merchant_api_request_logs', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('merchant_api_integration_id')->nullable()->constrained('merchant_api_integrations')->nullOnDelete();
                $table->string('method', 10);
                $table->string('path', 500);
                $table->unsignedSmallInteger('status_code')->nullable();
                $table->unsignedInteger('duration_ms')->nullable();
                $table->timestamp('requested_at');
                $table->timestamps();
            });
        }

        // Give composite indexes short explicit names: Laravel's generated
        // name exceeds MySQL's 64-character identifier limit for this table.
        if (! Schema::hasIndex('merchant_api_request_logs', 'mapl_integration_requested_idx')) {
            Schema::table('merchant_api_request_logs', function (Blueprint $table): void {
                $table->index(['merchant_api_integration_id', 'requested_at'], 'mapl_integration_requested_idx');
            });
        }

        if (! Schema::hasIndex('merchant_api_request_logs', 'mapl_status_requested_idx')) {
            Schema::table('merchant_api_request_logs', function (Blueprint $table): void {
                $table->index(['status_code', 'requested_at'], 'mapl_status_requested_idx');
            });
        }

        if (! Schema::hasIndex('merchant_api_request_logs', 'mapl_requested_idx')) {
            Schema::table('merchant_api_request_logs', function (Blueprint $table): void {
                $table->index('requested_at', 'mapl_requested_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('merchant_api_request_logs');
    }
};
