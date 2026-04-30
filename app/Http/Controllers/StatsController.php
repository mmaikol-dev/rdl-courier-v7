<?php

namespace App\Http\Controllers;

use App\Services\StatsReportService;
use Illuminate\Http\Request;

class StatsController extends Controller
{
    public function index(Request $request, StatsReportService $reportService)
    {
        $user = $request->user()->loadMissing('country');
        return inertia('stats/index', $reportService->build($user, $request->only([
            'date_range',
            'date_field',
            'cc_email',
            'merchant',
            'status',
            'country',
        ])));
    }
}
