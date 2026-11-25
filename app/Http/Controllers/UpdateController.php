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
            ->whereNotNull('edited_at')
            ->whereNotNull('sheet_id')
            ->whereNotNull('sheet_name');

        if ($request->filled('country')) {
            $country = mb_strtolower(trim($request->string('country')->toString()));
            $updatesQuery->whereRaw('LOWER(country) = ?', [$country]);
        }

        return Inertia::render('updates/index', [
            'updates' => Inertia::defer(fn () => $updatesQuery
                ->select([
                    'id',
                    'order_no',
                    'sheet_id',
                    'sheet_name',
                    'merchant',
                    'status',
                    'delivery_date',
                    'instructions',
                    'edited_at',
                    'sheet_update_attempts',
                    'sheet_update_last_error',
                    'sheet_update_last_attempted_at',
                ])
                ->orderBy('edited_at')
                ->limit(500)
                ->get()),
            'filters' => $request->only(['search', 'country']),
        ]);
    }

    public function run(): JsonResponse
    {
        RunArtisanCommandJob::dispatch('orders:update-sheets', ['--limit' => 100])
            ->onQueue('scheduled');

        return response()->json([
            'success' => true,
            'message' => 'Sheet update command queued on the scheduled worker',
        ]);
    }

    public function clearEditedAt(Request $request, SheetOrder $sheetorder): JsonResponse
    {
        $user = $request->user()?->loadMissing('country');
        abort_unless($sheetorder->sheet_id && $sheetorder->sheet_name, 404);

        if ($user?->roles === 'merchant') {
            abort_unless($sheetorder->merchant === $user->name, 404);
        }

        if (! CountryAccess::hasGlobalAccess($user)) {
            abort_unless(CountryAccess::matchesCountryName($sheetorder->country, $user), 403);
        }

        SheetOrder::withoutEditTracking(function () use ($sheetorder): void {
            $sheetorder->forceFill([
                'edited_at' => null,
                'sheet_update_attempts' => 0,
                'sheet_update_last_error' => null,
                'sheet_update_last_attempted_at' => null,
            ])->saveQuietly();
        });

        return response()->json(['success' => true]);
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
