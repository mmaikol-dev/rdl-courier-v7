<?php

namespace App\Http\Controllers;

use App\Services\DashboardReportService;
use App\Support\CountryAccess;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function index(Request $request, DashboardReportService $reportService): Response
    {
        $user = $request->user()->loadMissing('country');

        $defaultRange = strtolower(trim((string) $user->roles)) === 'merchant' ? 'allTime' : 'last30Days';
        $range = $request->query('range', $request->query('period', $defaultRange));
        $allowed = ['today', 'last7Days', 'last30Days', 'thisMonth', 'allTime', 'custom'];
        $range = in_array($range, $allowed, true) ? $range : 'last30Days';
        $dateFrom = $request->query('date_from');
        $dateTo = $request->query('date_to');
        $dateFrom = is_string($dateFrom) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateFrom) ? $dateFrom : null;
        $dateTo = is_string($dateTo) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateTo) ? $dateTo : null;
        if ($range === 'custom' && (! $dateFrom || ! $dateTo)) {
            $range = $defaultRange;
            $dateFrom = null;
            $dateTo = null;
        }
        $period = $range === 'allTime' || $range === 'custom' ? null : $range;

        $isAgent = strtolower(trim((string) $user->roles)) === 'agent';
        $product = $isAgent ? null : $request->query('product');
        $product = is_string($product) && trim($product) !== '' ? $product : null;
        $country = $request->query('country');
        $country = is_string($country) && trim($country) !== '' ? $country : null;
        $countryLabel = $country
            ?? session('selected_country')
            ?? (CountryAccess::hasGlobalAccess($user)
                ? 'All countries'
                : CountryAccess::userCountryName($user) ?? 'Assigned country');
        return Inertia::render('dashboard', [
            'dashboardReport' => Inertia::defer(
                fn () => $reportService->build($user, $period, $product, $country, $range === 'custom' ? $dateFrom : null, $range === 'custom' ? $dateTo : null),
                'dashboardReport'
            ),
            'range' => $range,
            'dateFrom' => $range === 'custom' ? $dateFrom : null,
            'dateTo' => $range === 'custom' ? $dateTo : null,
            'country' => $country,
            'product' => $product,
            'countryLabel' => $countryLabel,
            'userName' => $user->name,
            'userRole' => $user->roles,
            'needsYou' => $isAgent ? [
                'toConfirm' => 0,
                'outOfStock' => 0,
                'toPrepare' => 0,
                'readyForCourier' => 0,
                'expectedBack' => 0,
                'cashUpsToSettle' => 0,
            ] : [
                'toConfirm' => 2,
                'outOfStock' => 1,
                'toPrepare' => 1,
                'readyForCourier' => 4,
                'expectedBack' => 2,
                'cashUpsToSettle' => 1,
            ],
            'needsYouSample' => ! $isAgent,
        ]);
    }
}
