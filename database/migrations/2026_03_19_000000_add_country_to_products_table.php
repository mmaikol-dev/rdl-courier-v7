<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('products', 'country')) {
            Schema::table('products', function (Blueprint $table): void {
                $table->string('country')->nullable()->after('store_name')->index();
            });
        }

        DB::table('products')
            ->join('users', 'users.id', '=', 'products.user_id')
            ->whereNull('products.country')
            ->whereNotNull('users.store_address')
            ->where('users.store_address', '!=', '')
            ->update([
                'products.country' => DB::raw('users.store_address'),
            ]);
    }

    public function down(): void
    {
        if (Schema::hasColumn('products', 'country')) {
            Schema::table('products', function (Blueprint $table): void {
                $table->dropColumn('country');
            });
        }
    }
};
