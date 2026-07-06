<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

class CountryAccess
{
    public static function normalizeCountryName(?string $value): ?string
    {
        $normalized = strtolower(trim((string) $value));

        return $normalized !== '' ? $normalized : null;
    }

    public static function hasGlobalAccess(?User $user): bool
    {
        $role = strtolower(trim((string) ($user?->roles ?? '')));

        return $role === 'g.o.d' || $role === 'merchant';
    }

    public static function userCountryName(?User $user): ?string
    {
        $storeAddress = trim((string) ($user?->store_address ?? ''));

        if ($storeAddress !== '') {
            return $storeAddress;
        }

        return $user?->country?->name;
    }

    private static function resolvedCountryName(?User $user): ?string
    {
        $selected = session('selected_country');

        if (! $selected) {
            $selected = request()->session()->get('selected_country');
        }

        if ($selected && self::hasGlobalAccess($user)) {
            return self::normalizeCountryName($selected);
        }

        if (self::hasGlobalAccess($user)) {
            return null;
        }

        return self::normalizeCountryName(self::userCountryName($user));
    }

    public static function scopeByCountryName(Builder $query, ?User $user, string $column = 'country'): Builder
    {
        $countryName = self::resolvedCountryName($user);

        if ($countryName === null) {
            return $query;
        }

        if ($countryName === '') {
            return $query->whereRaw('1 = 0');
        }

        return $query->whereRaw("LOWER(TRIM({$column})) = ?", [$countryName]);
    }

    public static function scopeUsers(Builder $query, ?User $user): Builder
    {
        $countryName = self::resolvedCountryName($user);

        if ($countryName === null) {
            return $query;
        }

        if ($countryName === '') {
            return $query->whereRaw('1 = 0');
        }

        return $query->whereRaw('LOWER(TRIM(store_address)) = ?', [$countryName]);
    }

    public static function scopeProducts(Builder $query, ?User $user): Builder
    {
        return self::scopeByCountryName($query, $user, 'country');
    }

    public static function allowedCountries(?User $user, iterable $countries): array
    {
        if (self::hasGlobalAccess($user)) {
            return collect($countries)->values()->all();
        }

        $countryName = self::userCountryName($user);

        return $countryName ? [$countryName] : [];
    }

    public static function resolveCountryNameForWrite(?User $user, ?string $requestedCountry): ?string
    {
        $selected = session('selected_country');

        if ($selected && self::hasGlobalAccess($user)) {
            return $selected;
        }

        if (self::hasGlobalAccess($user)) {
            return $requestedCountry ?: self::userCountryName($user);
        }

        return self::userCountryName($user);
    }

    public static function matchesCountryName(?string $recordCountry, ?User $user): bool
    {
        $userCountry = self::resolvedCountryName($user) ?? self::userCountryName($user);

        return self::normalizeCountryName($recordCountry) !== null
            && self::normalizeCountryName($recordCountry) === self::normalizeCountryName($userCountry);
    }
}
