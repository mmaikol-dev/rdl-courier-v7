<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('countries', function (Blueprint $table): void {
            $table->string('currency', 10)->nullable()->after('code');
        });

        DB::table('countries')->updateOrInsert(
            ['name' => 'Kenya'],
            ['currency' => 'KES', 'code' => '254', 'updated_at' => now()],
        );

        DB::table('countries')->updateOrInsert(
            ['name' => 'Tanzania'],
            ['currency' => 'TZS', 'code' => '255', 'updated_at' => now()],
        );

        DB::table('countries')->updateOrInsert(
            ['name' => 'Uganda'],
            ['currency' => 'UGX', 'code' => '256', 'updated_at' => now()],
        );

        DB::table('countries')->updateOrInsert(
            ['name' => 'Zambia'],
            ['currency' => 'ZMW', 'code' => '260', 'updated_at' => now()],
        );
    }

    public function down(): void
    {
        Schema::table('countries', function (Blueprint $table): void {
            $table->dropColumn('currency');
        });
    }
};
