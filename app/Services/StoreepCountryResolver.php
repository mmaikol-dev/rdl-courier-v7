<?php

namespace App\Services;

use App\Models\StoreepIntegration;
use Illuminate\Support\Facades\DB;

/**
 * Resolves a Storeep market code to the country name our system stores.
 *
 * Storeep sends ISO 3166-1 alpha-2 ("KE"); `countries.code` holds the
 * telephone dialling code (254), so they cannot be compared directly. The
 * mapping lives in `countries.iso_code`, which means a merchant opening a new
 * market is a data change (a new integration row plus the country already
 * being seeded), never a code change and deploy.
 */
class StoreepCountryResolver
{
    /**
     * Country name for an ISO alpha-2 code, falling back to the integration's
     * configured country when the code is unknown or absent.
     */
    public function resolve(?string $isoCode, ?string $fallback = null): ?string
    {
        $isoCode = strtoupper(trim((string) $isoCode));

        if ($isoCode !== '') {
            $name = DB::table('countries')
                ->whereRaw('UPPER(iso_code) = ?', [$isoCode])
                ->value('name');

            if (is_string($name) && $name !== '') {
                return $name;
            }
        }

        return $fallback !== null && $fallback !== '' ? $fallback : null;
    }

    /**
     * The market codes we can currently resolve, for the integrations page so
     * an operator can see what a store is sending.
     *
     * @return array<string, string> iso code => country name
     */
    public function supportedMarkets(): array
    {
        $rows = DB::table('countries')
            ->whereNotNull('iso_code')
            ->orderBy('name')
            ->get(['name', 'iso_code']);

        $out = [];

        foreach ($rows as $row) {
            $out[(string) $row->iso_code] = (string) $row->name;
        }

        return $out;
    }

    public function currencyFor(?string $isoCode): ?string
    {
        $isoCode = strtoupper(trim((string) $isoCode));

        if ($isoCode === '') {
            return null;
        }

        $currency = DB::table('countries')
            ->whereRaw('UPPER(iso_code) = ?', [$isoCode])
            ->value('currency');

        return is_string($currency) && $currency !== '' ? $currency : null;
    }

    public function countryNameForIntegration(StoreepIntegration $integration): ?string
    {
        return $integration->country !== null && $integration->country !== ''
            ? $integration->country
            : null;
    }
}
