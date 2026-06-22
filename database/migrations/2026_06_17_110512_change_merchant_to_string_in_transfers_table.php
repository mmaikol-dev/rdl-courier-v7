<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Step 1: Add a temporary string column
        Schema::table('transfers', function (Blueprint $table) {
            $table->string('merchant_new')->nullable()->after('merchant');
        });

        // Step 2: Copy existing values as strings (old integer IDs become string digits)
        // New inserts going forward will store the actual merchant name text
        DB::statement('UPDATE transfers SET merchant_new = CAST(merchant AS CHAR)');

        // Step 3: Drop the old integer column
        Schema::table('transfers', function (Blueprint $table) {
            $table->dropColumn('merchant');
        });

        // Step 4: Rename the new column to merchant
        Schema::table('transfers', function (Blueprint $table) {
            $table->renameColumn('merchant_new', 'merchant');
        });
    }

    public function down(): void
    {
        // Reverse: convert merchant back to an integer column (data loss on text values)
        Schema::table('transfers', function (Blueprint $table) {
            $table->integer('merchant_tmp')->nullable()->after('merchant');
        });

        DB::statement('UPDATE transfers SET merchant_tmp = CAST(merchant AS UNSIGNED) WHERE merchant REGEXP \'^[0-9]+$\'');

        Schema::table('transfers', function (Blueprint $table) {
            $table->dropColumn('merchant');
        });

        Schema::table('transfers', function (Blueprint $table) {
            $table->renameColumn('merchant_tmp', 'merchant');
        });
    }
};