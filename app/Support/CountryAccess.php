<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

class CountryAccess
{
    public static function hasGlobalAccess(?User $user): bool
    {
        return strtolower(trim((string) ($user?->roles ?? ''))) === 'g.o.d';
    }

    public static function userCountryName(?User $user): ?string
    {
        return $user?->country?->name;
    }

    public static function scopeByCountryName(Builder $query, ?User $user, string $column = 'country'): Builder
    {
        if (self::hasGlobalAccess($user)) {
            return $query;
        }

        $countryName = self::userCountryName($user);

        if (! $countryName) {
            return $query->whereRaw('1 = 0');
        }

        return $query->where($column, $countryName);
    }

    public static function scopeUsers(Builder $query, ?User $user): Builder
    {
        if (self::hasGlobalAccess($user)) {
            return $query;
        }

        if (! $user?->country_id) {
            return $query->whereRaw('1 = 0');
        }

        return $query->where('country_id', $user->country_id);
    }

    public static function scopeProducts(Builder $query, ?User $user): Builder
    {
        if (self::hasGlobalAccess($user)) {
            return $query;
        }

        if (! $user?->country_id) {
            return $query->whereRaw('1 = 0');
        }

        return $query->whereHas('user', fn (Builder $userQuery) => $userQuery->where('country_id', $user->country_id));
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
        if (self::hasGlobalAccess($user)) {
            return $requestedCountry;
        }

        return self::userCountryName($user);
    }
}
