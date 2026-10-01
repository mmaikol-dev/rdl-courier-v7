<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * "Mombasa SHIMANZI", "MSHOMORONI" and "paid" are not countries — they are
     * leftover rows (no dialling code, no currency) that show up in the shared
     * country dropdown. Drop them.
     *
     * users.country_id is a nullOnDelete foreign key, and all 12 users pointing at
     * "paid" have store_address set, so their effective country still resolves via
     * CountryAccess::userCountryName(). The column is nulled explicitly here so the
     * migration does not depend on the FK's delete rule.
     */
    private const JUNK = ['Mombasa SHIMANZI', 'MSHOMORONI', 'paid'];

    public function up(): void
    {
        $ids = DB::table('countries')->whereIn('name', self::JUNK)->pluck('id');

        DB::table('users')->whereIn('country_id', $ids)->update(['country_id' => null]);

        DB::table('countries')->whereIn('id', $ids)->delete();
    }

    public function down(): void
    {
        $now = now();

        foreach (self::JUNK as $name) {
            if (! DB::table('countries')->where('name', $name)->exists()) {
                DB::table('countries')->insert([
                    'name' => $name,
                    'code' => null,
                    'currency' => null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }
    }
};
