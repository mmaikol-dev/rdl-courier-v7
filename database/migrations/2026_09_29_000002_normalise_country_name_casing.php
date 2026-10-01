<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Country names were seeded with inconsistent casing ("Kenya" vs "TANZANIA").
     * The app matches case-insensitively, so this is cosmetic, but it keeps the
     * shared `countries` dropdown consistent.
     *
     * Only the `countries` table is touched. `sheets.country` and
     * `users.store_address` are left exactly as they are, because they are
     * compared case-insensitively and rewriting them is not required.
     */
    private const RENAMES = [
        'TANZANIA' => 'Tanzania',
        'UGANDA' => 'Uganda',
    ];

    public function up(): void
    {
        foreach (self::RENAMES as $from => $to) {
            DB::table('countries')->where('name', $from)->update(['name' => $to]);
        }
    }

    public function down(): void
    {
        foreach (self::RENAMES as $from => $to) {
            DB::table('countries')->where('name', $to)->update(['name' => $from]);
        }
    }
};
