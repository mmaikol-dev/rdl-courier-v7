<?php

namespace App\Http\Controllers;

use App\Models\Sheet;
use App\Models\StoreepIntegration;
use App\Services\StoreepApiService;
use App\Services\StoreepCountryResolver;
use App\Services\StoreepOrderNumberPrefix;
use App\Support\CountryAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use Illuminate\Validation\Rule;

/**
 * Manage Storeep store connections.
 *
 * Credentials live in the database rather than `.env` because there is one
 * store per merchant, and a merchant trading in several countries has one row
 * per market. Tokens are encrypted at rest by the model cast and are never sent
 * to the browser.
 */
class StoreepIntegrationController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user()?->loadMissing('country');

        $query = StoreepIntegration::query()->with('sheet')->orderByDesc('id');

        if ($user?->roles === 'merchant') {
            // A merchant sees only their own store, matched exactly the same way
            // SheetOrderController:38 matches orders.
            $query->whereHas('sheet', fn ($sheet) => $sheet->where('sheet_name', $user->name));
        }

        $integrations = $query->get()->map(fn (StoreepIntegration $integration) => [
            'id' => $integration->id,
            'store_name' => $integration->store_name,
            'merchant' => $integration->merchantName(),
            'sheets_id' => $integration->sheets_id,
            'country' => $integration->country,
            'order_no_prefix' => $integration->order_no_prefix,
            'is_enabled' => $integration->is_enabled,
            'last_synced_at' => $integration->last_synced_at?->toDateTimeString(),
            'orders_synced' => $integration->orders_synced,
            'last_error' => $integration->last_error,
            'last_error_at' => $integration->last_error_at?->toDateTimeString(),
            // Never the token itself, only enough to identify which one is set.
            'token_hint' => $this->tokenHint($integration),
        ]);

        $sheetQuery = Sheet::query()->select('id', 'sheet_name', 'country')->orderBy('sheet_name');

        if ($user?->roles === 'merchant') {
            $sheetQuery->where('sheet_name', $user->name);
        } else {
            $sheetQuery = CountryAccess::scopeByCountryName($sheetQuery, $user, 'country');
        }

        $sheets = $sheetQuery->get();

        // The prefix is derived from the merchant's sheet name, not the Storeep
        // store name: the sheet name is our merchant identity, and one merchant
        // may run several stores. Candidates are sent per sheet so the form can
        // show the exact guesses the server would make.
        $prefix = app(StoreepOrderNumberPrefix::class);

        return Inertia::render('integrations/index', [
            'integrations' => $integrations,
            'sheets' => $sheets,
            // Named countryNames, not countries: Inertia shares a `countries`
            // array on every page for the sidebar country filter, and a page prop
            // of the same name would shadow it and break CountryFilter.
            'countryNames' => app(StoreepCountryResolver::class)->supportedMarkets(),
            'prefixSuggestions' => $sheets
                ->mapWithKeys(fn (Sheet $sheet) => [
                    $sheet->sheet_name => $prefix->candidates((string) $sheet->sheet_name),
                ])
                ->all(),
        ]);
    }

    public function store(Request $request)
    {
        $data = $this->validateIntegration($request);

        // Fail before writing if the merchant's sheet is missing: sheet_id and
        // sheet_name are NOT NULL with no default on sheet_orders, so an order
        // without them cannot be imported at all.
        $sheet = Sheet::find($data['sheets_id']);

        if (! $sheet || $sheet->sheet_name === null || $sheet->sheet_name === '') {
            return back()->with('error', 'Select a merchant sheet with a name.');
        }

        // Derive the prefix from the sheet name. sheet_orders.merchant is the
        // sheet name, and one merchant may run several stores, so the merchant
        // identity is the right thing to abbreviate.
        $prefix = $request->filled('order_no_prefix')
            ? strtoupper(trim($request->string('order_no_prefix')->toString()))
            : app(StoreepOrderNumberPrefix::class)->allocate($sheet->sheet_name);

        if ($prefix === null || $prefix === '') {
            return back()->with('error', 'Could not allocate an order number prefix for that merchant sheet.');
        }

        StoreepIntegration::create([
            'sheets_id' => $sheet->id,
            'store_name' => $data['store_name'],
            'access_token' => $data['access_token'],
            'country' => $data['country'],
            'order_no_prefix' => $prefix,
            'is_enabled' => true,
        ]);

        return redirect()
            ->route('integrations.index')
            ->with('success', "Storeep store connected as {$sheet->sheet_name}. Order numbers will start at {$prefix}1.");
    }

    public function update(Request $request, StoreepIntegration $integration)
    {
        $data = $this->validateIntegration($request, $integration);

        $updates = [
            'sheets_id' => $data['sheets_id'],
            'store_name' => $data['store_name'],
            'country' => $data['country'],
        ];

        // Only overwrite the token when a new one is supplied, so editing a
        // store does not require re-pasting the credential.
        if ($request->filled('access_token')) {
            $updates['access_token'] = $data['access_token'];
        }

        // The prefix is deliberately immutable. Order numbers are the prefix
        // and the platform number with no separator, so changing it after
        // orders exist would orphan them.
        $integration->update($updates);

        return back()->with('success', 'Storeep store updated.');
    }

    public function destroy(StoreepIntegration $integration)
    {
        $name = $integration->store_name;

        $integration->delete();

        return redirect()
            ->route('integrations.index')
            ->with('success', "Disconnected {$name}. Existing orders were left untouched.");
    }

    public function test(Request $request, StoreepIntegration $integration)
    {
        $result = app(StoreepApiService::class)->testConnection($integration);

        $integration->forceFill([
            'last_error' => $result['ok'] ? null : mb_substr($result['message'], 0, 1000),
            'last_error_at' => $result['ok'] ? null : now(),
        ])->save();

        return back()->with(
            $result['ok'] ? 'success' : 'error',
            $result['ok']
                ? "Connected to {$integration->store_name}. Store reports ".($result['total'] ?? 0).' order(s).'
                : $result['message']
        );
    }

    public function syncNow(StoreepIntegration $integration)
    {
        $exit = \Artisan::call('storeep:sync-orders', [
            '--integration' => $integration->id,
        ]);

        $output = trim(\Artisan::output());

        Log::info('Storeep manual sync triggered', [
            'store' => $integration->store_name,
            'exit' => $exit,
        ]);

        return back()->with($exit === 0 ? 'success' : 'error', $output ?: 'Sync finished.');
    }

    /**
     * @return array<string, mixed>
     */
    private function validateIntegration(Request $request, ?StoreepIntegration $integration = null): array
    {
        $uniqueStore = Rule::unique('storeep_integrations', 'store_name');

        if ($integration !== null) {
            $uniqueStore = $uniqueStore->ignore($integration->id);
        }

        return $request->validate([
            'store_name' => ['required', 'string', 'max:255', $uniqueStore],
            // Required on create; optional on update so a token is not retyped.
            'access_token' => $integration === null
                ? ['required', 'string', 'max:255']
                : ['nullable', 'string', 'max:255'],
            'sheets_id' => ['required', 'integer', 'exists:sheets,id'],
            'country' => ['required', 'string', 'max:255'],
            'order_no_prefix' => ['nullable', 'string', 'max:8'],
        ]);
    }

    /**
     * Last 4 characters only, so an operator can tell which token is stored
     * without the value ever reaching the browser.
     */
    private function tokenHint(StoreepIntegration $integration): string
    {
        $token = (string) $integration->access_token;

        return '••••'.substr($token, -4);
    }
}
