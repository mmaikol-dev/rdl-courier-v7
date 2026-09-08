<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $countries = [
            ['name' => 'Algeria',                  'code' => '213', 'currency' => 'DZD', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Angola',                   'code' => '244', 'currency' => 'AOA', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Benin',                    'code' => '229', 'currency' => 'XOF', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Botswana',                 'code' => '267', 'currency' => 'BWP', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Burkina Faso',             'code' => '226', 'currency' => 'XOF', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Burundi',                  'code' => '257', 'currency' => 'BIF', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Cabo Verde',               'code' => '238', 'currency' => 'CVE', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Cameroon',                 'code' => '237', 'currency' => 'XAF', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Central African Republic', 'code' => '236', 'currency' => 'XAF', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Chad',                     'code' => '235', 'currency' => 'XAF', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Comoros',                  'code' => '269', 'currency' => 'KMF', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Congo (DRC)',              'code' => '243', 'currency' => 'CDF', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Congo (Republic)',         'code' => '242', 'currency' => 'XAF', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Cote d\'Ivoire',           'code' => '225', 'currency' => 'XOF', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Djibouti',                 'code' => '253', 'currency' => 'DJF', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Egypt',                    'code' => '20',  'currency' => 'EGP', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Equatorial Guinea',        'code' => '240', 'currency' => 'XAF', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Eritrea',                  'code' => '291', 'currency' => 'ERN', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Eswatini',                 'code' => '268', 'currency' => 'SZL', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Ethiopia',                 'code' => '251', 'currency' => 'ETB', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Gabon',                    'code' => '241', 'currency' => 'XAF', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Gambia',                   'code' => '220', 'currency' => 'GMD', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Ghana',                    'code' => '233', 'currency' => 'GHS', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Guinea',                   'code' => '224', 'currency' => 'GNF', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Guinea-Bissau',            'code' => '245', 'currency' => 'XOF', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Kenya',                    'code' => '254', 'currency' => 'KES', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Lesotho',                  'code' => '266', 'currency' => 'LSL', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Liberia',                  'code' => '231', 'currency' => 'LRD', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Libya',                    'code' => '218', 'currency' => 'LYD', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Madagascar',               'code' => '261', 'currency' => 'MGA', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Malawi',                   'code' => '265', 'currency' => 'MWK', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Mali',                     'code' => '223', 'currency' => 'XOF', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Mauritania',               'code' => '222', 'currency' => 'MRU', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Mauritius',                'code' => '230', 'currency' => 'MUR', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Morocco',                  'code' => '212', 'currency' => 'MAD', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Mozambique',               'code' => '258', 'currency' => 'MZN', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Namibia',                  'code' => '264', 'currency' => 'NAD', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Niger',                    'code' => '227', 'currency' => 'XOF', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Nigeria',                  'code' => '234', 'currency' => 'NGN', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Rwanda',                   'code' => '250', 'currency' => 'RWF', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Sao Tome and Principe',    'code' => '239', 'currency' => 'STN', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Senegal',                  'code' => '221', 'currency' => 'XOF', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Seychelles',               'code' => '248', 'currency' => 'SCR', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Sierra Leone',             'code' => '232', 'currency' => 'SLL', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Somalia',                  'code' => '252', 'currency' => 'SOS', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'South Africa',             'code' => '27',  'currency' => 'ZAR', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'South Sudan',              'code' => '211', 'currency' => 'SSP', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Sudan',                    'code' => '249', 'currency' => 'SDG', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Tanzania',                 'code' => '255', 'currency' => 'TZS', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Togo',                     'code' => '228', 'currency' => 'XOF', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Tunisia',                  'code' => '216', 'currency' => 'TND', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Uganda',                   'code' => '256', 'currency' => 'UGX', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Zambia',                   'code' => '260', 'currency' => 'ZMW', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Zimbabwe',                 'code' => '263', 'currency' => 'ZWL', 'created_at' => now(), 'updated_at' => now()],
        ];

        foreach ($countries as $country) {
            DB::table('countries')->updateOrInsert(
                ['name' => $country['name']],
                ['code' => $country['code'], 'currency' => $country['currency'], 'created_at' => $country['created_at'], 'updated_at' => $country['updated_at']]
            );
        }
    }

    public function down(): void
    {
        DB::table('countries')->whereNotIn('name', ['Kenya', 'Tanzania', 'Uganda', 'Zambia'])->delete();
    }
};
