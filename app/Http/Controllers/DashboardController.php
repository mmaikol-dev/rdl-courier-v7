<?php

namespace App\Http\Controllers;

use App\Services\DashboardReportService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function index(Request $request, DashboardReportService $reportService): Response
    {
        $user = $request->user()->loadMissing('country');

        $period = $request->query('period');
        $allowed = ['today', 'last7Days', 'last30Days', 'thisMonth'];
        $period = in_array($period, $allowed, true) ? $period : null;

        $product = $request->query('product');

        return Inertia::render('dashboard', $reportService->build($user, $period, $product));
    }
}
