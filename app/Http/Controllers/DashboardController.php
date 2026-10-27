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

        $range = $request->query('range', $request->query('period', 'last30Days'));
        $allowed = ['today', 'last7Days', 'last30Days', 'thisMonth', 'allTime'];
        $range = in_array($range, $allowed, true) ? $range : 'last30Days';
        $period = $range === 'allTime' ? null : $range;

        $product = $request->query('product');
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
                fn () => $reportService->build($user, $period, $product, $country),
                'dashboardReport'
            ),
            'range' => $range,
            'country' => $country,
            'product' => $product,
            'countryLabel' => $countryLabel,
            'userName' => $user->name,
            'userRole' => $user->roles,
            'needsYou' => [
                'toConfirm' => 2,
                'outOfStock' => 1,
                'toPrepare' => 1,
                'readyForCourier' => 4,
                'expectedBack' => 2,
                'cashUpsToSettle' => 1,
            ],
            'needsYouSample' => true,
        ]);
    }
}
