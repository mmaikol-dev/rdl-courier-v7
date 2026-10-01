<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * `countries.code` holds the telephone dialling code. Those are not unique
     * across territories — Reunion and Mayotte share +262 — so the unique index
     * prevents legitimately listing them. Keep the column indexed, just not unique.
     */
    public function up(): void
    {
        Schema::table('countries', function (Blueprint $table): void {
            $table->dropUnique(['code']);
            $table->index('code');
        });
    }

    public function down(): void
    {
        Schema::table('countries', function (Blueprint $table): void {
            $table->dropIndex(['code']);
            $table->unique('code');
        });
    }
};
