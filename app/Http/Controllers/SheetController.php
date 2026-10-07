<?php

namespace App\Http\Controllers;

use App\Exceptions\SheetImportException;
use App\Models\Sheet;
use App\Models\User;
use App\Services\GoogleSheetsReader;
use App\Services\SheetOrderPullImporter;
use App\Support\CountryAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;

class SheetController extends Controller
{
    public function __construct(
        private readonly GoogleSheetsReader $reader = new GoogleSheetsReader,
        private readonly SheetOrderPullImporter $importer = new SheetOrderPullImporter,
    ) {}

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        $user = $request->user()?->loadMissing('country');
        $query = CountryAccess::scopeByCountryName(Sheet::select(
            'id',
            'sheet_id',
            'sheet_name',
            'store_name',
            'shopify_name',
            'country',
            'cc_agents',
            'sku'
        ), $user);

        // If logged-in user is a merchant, filter sheets by matching user name with sheet_name
        if ($user?->roles === 'merchant') {
            $query->where('sheet_name', $user->name);
        }

        if ($request->filled('country')) {
            $country = mb_strtolower(trim($request->string('country')->toString()));
            $query->whereRaw('LOWER(country) = ?', [$country]);
        }

        $sheets = $query->orderBy('created_at', 'desc')->get();
        $ccUsers = CountryAccess::scopeUsers(
            User::query()->where('roles', 'callcenter1'),
            $user
        )->pluck('name');

        return Inertia::render('sheets/index', [
            'sheets' => $sheets,
            'ccUsers' => $ccUsers,
            'filters' => $request->only(['country']),
        ]);
    }

    /**
     * List the tabs inside a sheet's spreadsheet, so the import dialog can offer
     * a tab picker.
     */
    public function tabs(Request $request, Sheet $sheet)
    {
        $this->authorizeSheetAccess($request, $sheet);

        try {
            return response()->json([
                'success' => true,
                'tabs' => $this->reader->tabNames((string) $sheet->sheet_id),
            ]);
        } catch (\Throwable $e) {
            Log::warning('Failed to list spreadsheet tabs', [
                'sheet_id' => $sheet->sheet_id,
                'message' => $e->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 502);
        }
    }

    /**
     * Pull new orders out of the sheet's Google Sheet.
     *
     * Only rows with a blank status are taken, and only order numbers that do not
     * already exist are accepted. Everything rejected is counted and reported
     * rather than silently dropped.
     */
    public function importOrders(Request $request, Sheet $sheet)
    {
        $this->authorizeSheetAccess($request, $sheet);

        $validated = $request->validate([
            'tab' => ['nullable', 'string', 'max:255'],
        ]);

        try {
            $summary = $this->importer->import($sheet, $validated['tab'] ?? null);
        } catch (SheetImportException $e) {
            Log::warning('Sheet pull import aborted', [
                'sheet_id' => $sheet->sheet_id,
                'message' => $e->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 422);
        } catch (\Throwable $e) {
            Log::error('Sheet pull import failed', [
                'sheet_id' => $sheet->sheet_id,
                'message' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Could not read the spreadsheet. Check that it exists and that the '
                    .'service account still has access. ('.$e->getMessage().')',
            ], 502);
        }

        return response()->json([
            'success' => true,
            'summary' => $summary,
            'message' => $this->summarise($summary),
        ]);
    }

    /**
     * Turn the summary counts into one sentence an operator can act on.
     *
     * @param  array<string, mixed>  $summary
     */
    private function summarise(array $summary): string
    {
        $queued = (int) $summary['queued'];
        $requeued = (int) $summary['requeued'];
        $scanned = (int) $summary['scanned'];

        if ($scanned === 0) {
            return "Nothing to import — the tab [{$summary['tab']}] is empty.";
        }

        if ($queued === 0 && $requeued === 0 && $summary['already_staged'] === 0) {
            $parts = [];

            if ($summary['skipped']['has_status'] > 0) {
                $parts[] = $summary['skipped']['has_status'].' already have a status';
            }

            if ($summary['skipped']['existing_order'] > 0) {
                $parts[] = $summary['skipped']['existing_order'].' already exist in the system';
            }

            if ($summary['errors_total'] > 0) {
                $parts[] = $summary['errors_total'].' had missing or invalid values';
            }

            $detail = $parts === [] ? '' : ' ('.implode(', ', $parts).')';

            return 'No new orders found in this tab'.$detail.'.';
        }

        if ($queued === 0 && $requeued === 0) {
            $message = 'Every matching order in this tab was already imported.';
        } elseif ($queued === 0) {
            $message = "Re-queued {$requeued} order".($requeued === 1 ? '' : 's').' that were waiting to be processed.';
        } else {
            $message = "Queued {$queued} new order".($queued === 1 ? '' : 's').' for import.';

            if ($requeued > 0) {
                $message .= " Re-queued {$requeued} that were still waiting.";
            }
        }

        if ($summary['skipped']['has_status'] > 0) {
            $message .= " Skipped {$summary['skipped']['has_status']} already-processed row"
                .($summary['skipped']['has_status'] === 1 ? '' : 's').'.';
        }

        if ($summary['skipped']['existing_order'] > 0) {
            $message .= " Skipped {$summary['skipped']['existing_order']} duplicate order number"
                .($summary['skipped']['existing_order'] === 1 ? '' : 's').'.';
        }

        if ($summary['remaining'] > 0) {
            $message .= " {$summary['remaining']} more row"
                .($summary['remaining'] === 1 ? '' : 's').' were left out to keep this run'
                .' manageable — run it again to continue.';
        }

        if ($summary['truncated']) {
            $message .= ' Only the first rows of this tab were read — import again to check for more.';
        }

        return $message;
    }

    public function viewSheetData($sheetId, Request $request)
    {
        $sheetRecord = CountryAccess::scopeByCountryName(
            Sheet::query()->where('sheet_id', $sheetId),
            $request->user()?->loadMissing('country')
        )->firstOrFail();

        try {
            $availableSheets = $this->reader->tabNames($sheetRecord->sheet_id);

            if ($availableSheets === []) {
                return response()->json([
                    'error' => 'Empty spreadsheet',
                    'message' => 'This spreadsheet contains no tabs.',
                ], 422);
            }

            // Use requested sheet name or default to first
            $sheetName = $request->get('sheetName', $availableSheets[0]);

            return response()->json([
                'availableSheets' => $availableSheets,
                'sheetData' => $this->reader->rows($sheetRecord->sheet_id, $sheetName, 'A1:R1000'),
                'activeSheet' => $sheetName,
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'error' => 'Failed to fetch sheet data',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * A sheet is editable and importable only by users who can see its country,
     * and merchants only for their own sheet.
     *
     * @throws HttpException
     */
    private function authorizeSheetAccess(Request $request, Sheet $sheet): void
    {
        $user = $request->user()?->loadMissing('country');

        abort_unless(
            CountryAccess::hasGlobalAccess($user) ||
            CountryAccess::matchesCountryName($sheet->country, $user),
            403,
            'You do not have access to this sheet.'
        );

        if (strtolower(trim((string) ($user?->roles ?? ''))) !== 'merchant') {
            return;
        }

        $names = array_values(array_unique(array_filter([
            mb_strtolower(trim((string) $user->name)),
            mb_strtolower(trim((string) $user->username)),
        ])));

        abort_unless(
            in_array(mb_strtolower(trim((string) $sheet->sheet_name)), $names, true),
            403,
            'Merchants may only import orders for their own sheet.'
        );
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
        $request->validate([
            'sheet_id'      => 'required|string|unique:sheets,sheet_id',
            'sheet_name'    => 'required|string',
            'store_name'    => 'nullable|string',
            'shopify_name'  => 'nullable|string',
            'access_token'  => 'nullable|string',
            'country'       => 'nullable|string',
            'cc_agents'     => 'nullable|string',
            'sku'           => 'nullable|string',
        ]);

        $validated = $request->all();
        $validated['cc_agents'] = $this->normalizeCcAgents($validated['cc_agents'] ?? null);
        $validated['country'] = CountryAccess::resolveCountryNameForWrite(
            $request->user()?->loadMissing('country'),
            $request->country
        );

        Sheet::create($validated);

        return redirect()->back()->with('success', 'Sheet created successfully.');
    }

    /**
     * Display the specified resource.
     */
    public function show(Sheet $sheet)
    {
        //
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(Sheet $sheet)
    {
        //
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Sheet $sheet)
    {
        abort_unless(
            CountryAccess::hasGlobalAccess($request->user()?->loadMissing('country')) ||
            CountryAccess::matchesCountryName($sheet->country, $request->user()?->loadMissing('country')),
            403
        );

        $validated = $request->validate([
            'sheet_name' => 'required|string|max:255',
            'sheet_id' => 'required|string|max:255',
            'store_name' => 'nullable|string|max:255',
            'shopify_name' => 'nullable|string|max:255',
            'access_token' => 'nullable|string|max:255',
            'country' => 'nullable|string|max:100',
            'cc_agents' => 'nullable|string',
            'sku' => 'nullable|string|max:255',
        ]);

        $validated['cc_agents'] = $this->normalizeCcAgents($validated['cc_agents'] ?? null);
        $validated['country'] = CountryAccess::resolveCountryNameForWrite(
            $request->user()?->loadMissing('country'),
            $validated['country'] ?? null
        );

        $sheet->update($validated);

        return redirect()->back()->with('success', 'Sheet updated successfully.');
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Sheet $sheet)
    {
        abort_unless(
            CountryAccess::hasGlobalAccess(request()->user()?->loadMissing('country')) ||
            CountryAccess::matchesCountryName($sheet->country, request()->user()?->loadMissing('country')),
            403
        );

        $sheet->delete();

        return redirect()->back()->with('success', 'Sheet deleted successfully.');
    }

    private function normalizeCcAgents(?string $raw): ?string
    {
        $raw = trim((string) $raw);

        if ($raw === '') {
            return null;
        }

        if (str_starts_with($raw, '{')) {
            $decoded = json_decode($raw, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                return json_encode($decoded, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
            }
        }

        $lines = preg_split('/\r?\n/', $raw);
        $map = [];

        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }

            if (strpos($line, ':') === false) {
                continue;
            }

            [$sheetName, $agentsRaw] = array_map('trim', explode(':', $line, 2));

            if ($sheetName === '' || $agentsRaw === '') {
                continue;
            }

            $agents = array_filter(array_map('trim', explode(',', $agentsRaw)));

            if ($agents === []) {
                continue;
            }

            $map[$sheetName] = array_values($agents);
        }

        if ($map === []) {
            return $raw;
        }

        return json_encode($map, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    }
}
