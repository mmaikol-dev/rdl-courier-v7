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

        return Inertia::render('dashboard', $reportService->build($user));
    }
}
