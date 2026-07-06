<?php

namespace App\Http\Middleware;

use App\Models\Country;
use App\Models\SheetOrder;
use App\Models\SidebarRolePermission;
use App\Support\CountryAccess;
use App\Support\SidebarRegistry;
use Illuminate\Foundation\Inspiring;
use Illuminate\Http\Request;
use Inertia\Middleware;
use Tighten\Ziggy\Ziggy;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        [$message, $author] = str(Inspiring::quotes()->random())->explode('-');
        $user = $request->user()?->loadMissing('country');
        $role = $user?->roles;
        $normalizedRole = SidebarRegistry::normalizeRole($role);
        $visibleItems = SidebarRolePermission::query()
            ->where('role', $role)
            ->value('visible_items');

        if (! is_array($visibleItems)) {
            $visibleItems = SidebarRegistry::defaultVisibleKeysForRole($normalizedRole);
        }

        $countries = Country::query()
            ->whereIn('name', ['Kenya', 'Tanzania', 'Uganda', 'Zambia'])
            ->orderBy('name')
            ->get(['id', 'name', 'code', 'currency']);

        $selectedCountry = $request->session()->get('selected_country');
        $canFilterCountry = $user && CountryAccess::hasGlobalAccess($user);

        $selectedCurrency = 'KES';
        if ($selectedCountry) {
            $country = $countries->firstWhere('name', $selectedCountry);
            $selectedCurrency = $country?->currency ?? 'KES';
        }

        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'quote' => ['message' => trim($message), 'author' => trim($author)],
            'auth' => [
                'user' => $user,
                'pendingLoginLocationCapture' => (bool) $request->session()->get('login_location_id'),
            ],
            'countries' => $countries,
            'selectedCountry' => $canFilterCountry ? $selectedCountry : null,
            'selectedCurrency' => $selectedCurrency,
            'productOptions' => SheetOrder::query()
                ->when($canFilterCountry && $selectedCountry, function ($q) use ($selectedCountry) {
                    $q->whereRaw('LOWER(TRIM(country)) = ?', [strtolower(trim($selectedCountry))]);
                })
                ->when($user && ! $canFilterCountry, function ($q) use ($user) {
                    $country = CountryAccess::userCountryName($user);
                    if ($country) {
                        $q->whereRaw('LOWER(TRIM(country)) = ?', [strtolower(trim($country))]);
                    }
                })
                ->when($user && strtolower(trim((string) $user->roles)) === 'merchant', function ($q) use ($user) {
                    $q->where('merchant', $user->name);
                })
                ->whereNotNull('product_name')
                ->where('product_name', '!=', '')
                ->select('product_name')
                ->distinct()
                ->orderBy('product_name')
                ->pluck('product_name'),
            'sidebar' => [
                'role' => $role,
                'visibleItems' => $visibleItems,
                'canManage' => SidebarRegistry::canManage($normalizedRole),
            ],
            'ziggy' => fn (): array => [
                ...(new Ziggy)->toArray(),
                'location' => $request->url(),
            ],
            'sidebarOpen' => ! $request->hasCookie('sidebar_state') || $request->cookie('sidebar_state') === 'true',
        ];
    }
}
