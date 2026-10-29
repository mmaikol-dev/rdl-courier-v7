<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('users', 'merchant_api_enabled')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->boolean('merchant_api_enabled')->default(true);
            });
        }
        if (! Schema::hasColumn('users', 'merchant_api_scopes')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->json('merchant_api_scopes')->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('users', 'merchant_api_scopes')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->dropColumn('merchant_api_scopes');
            });
        }
        if (Schema::hasColumn('users', 'merchant_api_enabled')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->dropColumn('merchant_api_enabled');
            });
        }
    }
};
