<?php

namespace App\Http\Controllers;

use App\Jobs\RunArtisanCommandJob;
use App\Models\SheetOrder;
use App\Models\Update;
use App\Support\CountryAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;

class UpdateController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        $user = $request->user()?->loadMissing('country');

        $updatesQuery = CountryAccess::scopeByCountryName(
            SheetOrder::query(),
            $user
        )
            ->whereNotNull('updated_at')
            ->where('updated_at', '<=', now())
            ->whereNotNull('sheet_id')
            ->whereNotNull('sheet_name');

        if ($request->filled('country')) {
            $country = mb_strtolower(trim($request->string('country')->toString()));
            $updatesQuery->whereRaw('LOWER(country) = ?', [$country]);
        }

        return Inertia::render('updates/index', [
            'updates' => $updatesQuery
                ->select(['id', 'order_no', 'sheet_id', 'sheet_name', 'merchant', 'status', 'updated_at'])
                ->orderBy('updated_at')
                ->limit(500)
                ->get(),
            'filters' => $request->only(['search', 'country']),
        ]);
    }

    public function run(): JsonResponse
    {
        RunArtisanCommandJob::dispatch('orders:update-sheets', ['--limit' => 100]);

        return response()->json([
            'success' => true,
            'message' => 'Sheet update command queued',
        ]);
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create()
    {
        //
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        //
    }

    /**
     * Display the specified resource.
     */
    public function show(Update $update)
    {
        //
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(Update $update)
    {
        //
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Update $update)
    {
        //
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Update $update)
    {
        //
    }
}
