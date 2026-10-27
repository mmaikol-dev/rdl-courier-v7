<?php

namespace App\Http\Controllers;

use App\Services\StatsReportService;
use Illuminate\Http\Request;
use Inertia\Inertia;

class StatsController extends Controller
{
    public function index(Request $request, StatsReportService $reportService)
    {
        $user = $request->user()->loadMissing('country');

        $filters = $request->only([
            'date_range',
            'date_field',
            'cc_email',
            'merchant',
            'status',
            'country',
            'product',
        ]);

        return Inertia::render('stats/index', [
            'statsReport' => Inertia::defer(fn () => $reportService->build($user, $filters)),
        ]);
    }
}
