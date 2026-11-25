<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

class WarehouseCatalog
{
    /** @return array<int, array{code: string, name: string, country: string}> */
    public static function all(): array
    {
        $warehouses = config('warehouses', []);
        $configuredCountries = collect($warehouses)
            ->map(fn (array $warehouse): string => mb_strtolower(trim($warehouse['country'])))
            ->all();

        $africanCountries = DB::table('countries')
            ->whereIn('iso_code', config('african_country_iso_codes', []))
            ->whereNotNull('name')
            ->orderBy('name')
            ->get(['name', 'iso_code']);

        foreach ($africanCountries as $country) {
            if (in_array(mb_strtolower(trim($country->name)), $configuredCountries, true)) {
                continue;
            }

            $warehouses[] = [
                'code' => strtoupper($country->iso_code).'-WH',
                'name' => 'Main warehouse',
                'country' => $country->name,
            ];
        }

        usort($warehouses, fn (array $a, array $b): int => strcasecmp($a['country'], $b['country']));

        return array_values($warehouses);
    }
}
