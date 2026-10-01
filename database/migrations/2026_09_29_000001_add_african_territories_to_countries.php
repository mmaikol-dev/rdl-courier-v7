<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * The 54 UN-recognised African sovereign states are already seeded by
     * 2026_09_04_000001_seed_all_african_countries. This adds the African
     * territories/dependencies from the UN M49 Africa region so new markets can
     * be enabled without another data change.
     */
    private const COUNTRIES = [
        ['name' => 'British Indian Ocean Territory', 'code' => '246', 'currency' => 'USD'],
        ['name' => 'Mayotte',                       'code' => '262', 'currency' => 'EUR'],
        ['name' => 'Reunion',                       'code' => '262', 'currency' => 'EUR'],
        ['name' => 'Saint Helena',                  'code' => '290', 'currency' => 'SHP'],
        ['name' => 'Somaliland',                    'code' => '252', 'currency' => 'SOS'],
        ['name' => 'Western Sahara',                'code' => '732', 'currency' => 'MAD'],
    ];

    public function up(): void
    {
        foreach (self::COUNTRIES as $country) {
            DB::table('countries')->updateOrInsert(
                ['name' => $country['name']],
                [
                    'code' => $country['code'],
                    'currency' => $country['currency'],
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            );
        }
    }

    public function down(): void
    {
        DB::table('countries')
            ->whereIn('name', array_column(self::COUNTRIES, 'name'))
            ->delete();
    }
};
