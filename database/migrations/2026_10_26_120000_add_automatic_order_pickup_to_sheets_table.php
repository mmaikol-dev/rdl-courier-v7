<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('sheets')) {
            return;
        }

        Schema::table('sheets', function (Blueprint $table): void {
            if (! Schema::hasColumn('sheets', 'auto_pickup_enabled')) {
                $table->boolean('auto_pickup_enabled')->default(false);
            }

            if (! Schema::hasColumn('sheets', 'auto_pickup_tabs')) {
                $table->json('auto_pickup_tabs')->nullable();
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('sheets')) {
            return;
        }

        Schema::table('sheets', function (Blueprint $table): void {
            if (Schema::hasColumn('sheets', 'auto_pickup_tabs')) {
                $table->dropColumn('auto_pickup_tabs');
            }

            if (Schema::hasColumn('sheets', 'auto_pickup_enabled')) {
                $table->dropColumn('auto_pickup_enabled');
            }
        });
    }
};
