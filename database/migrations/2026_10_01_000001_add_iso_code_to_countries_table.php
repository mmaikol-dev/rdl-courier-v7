<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Adds the ISO 3166-1 alpha-2 code to `countries`.
 *
 * `countries.code` already exists but holds the telephone dialling code
 * (Kenya = 254), so it cannot be compared against an external API that sends
 * ISO country codes (Storeep sends "KE"). Rather than hardcoding a country
 * list inside application code — which would need a code change and a deploy
 * every time a merchant opens a new market — the mapping lives in the database
 * and new markets are added by inserting a row.
 *
 * Resolving a market is therefore:
 *     country.iso_code = 'KE'  ->  country.name = 'Kenya', currency = 'KES'
 */
return new class extends Migration
{
    /**
     * ISO 3166-1 alpha-2 per `countries.name` as seeded by
     * 2026_09_04_000001_seed_all_african_countries and the territory follow-ups.
     *
     * Keyed by name so the migration is idempotent and tolerant of the casing
     * renames applied by 2026_09_29_000002. `null` means "no ISO code assigned";
     * territories legitimately share codes with their sovereign state
     * (Mayotte/Reunion both +262 and both "RE"/"YT" only one is ISO-official).
     */
    private const ISO_CODES = [
        'Algeria' => 'DZ',
        'Angola' => 'AO',
        'Benin' => 'BJ',
        'Botswana' => 'BW',
        'British Indian Ocean Territory' => 'IO',
        'Burkina Faso' => 'BF',
        'Burundi' => 'BI',
        'Cabo Verde' => 'CV',
        'Cameroon' => 'CM',
        'Central African Republic' => 'CF',
        'Chad' => 'TD',
        'Comoros' => 'KM',
        'Congo (DRC)' => 'CD',
        'Congo (Republic)' => 'CG',
        'Cote d\'Ivoire' => 'CI',
        'Djibouti' => 'DJ',
        'Egypt' => 'EG',
        'Equatorial Guinea' => 'GQ',
        'Eritrea' => 'ER',
        'Eswatini' => 'SZ',
        'Ethiopia' => 'ET',
        'Gabon' => 'GA',
        'Gambia' => 'GM',
        'Ghana' => 'GH',
        'Guinea' => 'GN',
        'Guinea-Bissau' => 'GW',
        'Kenya' => 'KE',
        'Lesotho' => 'LS',
        'Liberia' => 'LR',
        'Libya' => 'LY',
        'Madagascar' => 'MG',
        'Malawi' => 'MW',
        'Mali' => 'ML',
        'Mauritania' => 'MR',
        'Mauritius' => 'MU',
        'Mayotte' => 'YT',
        'Morocco' => 'MA',
        'Mozambique' => 'MZ',
        'Namibia' => 'NA',
        'Niger' => 'NE',
        'Nigeria' => 'NG',
        'Reunion' => 'RE',
        'Rwanda' => 'RW',
        'Saint Helena' => 'SH',
        'Sao Tome and Principe' => 'ST',
        'Senegal' => 'SN',
        'Seychelles' => 'SC',
        'Sierra Leone' => 'SL',
        'Somalia' => 'SO',
        'Somaliland' => null,
        'South Africa' => 'ZA',
        'South Sudan' => 'SS',
        'Sudan' => 'SD',
        'Tanzania' => 'TZ',
        'Togo' => 'TG',
        'Tunisia' => 'TN',
        'Uganda' => 'UG',
        'Western Sahara' => 'EH',
        'Zambia' => 'ZM',
        'Zimbabwe' => 'ZW',
    ];

    public function up(): void
    {
        Schema::table('countries', function (Blueprint $table): void {
            // Nullable so rows added later without an ISO code still insert, and
            // so the territories we deliberately leave null are representable.
            $table->char('iso_code', 2)->nullable()->after('code');
            $table->index('iso_code');
        });

        foreach (self::ISO_CODES as $name => $isoCode) {
            if ($isoCode === null) {
                continue;
            }

            DB::table('countries')->where('name', $name)->update(['iso_code' => $isoCode]);
        }
    }

    public function down(): void
    {
        Schema::table('countries', function (Blueprint $table): void {
            $table->dropIndex(['iso_code']);
            $table->dropColumn('iso_code');
        });
    }
};
