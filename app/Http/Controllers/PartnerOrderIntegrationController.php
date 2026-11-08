<?php

namespace App\Http\Controllers;

use App\Models\PartnerOrderIntegration;
use App\Models\Sheet;
use App\Services\HealthilyVitaeOrdersApi;
use App\Support\CountryAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Inertia\Inertia;

class PartnerOrderIntegrationController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();

        try {
            $storageReady = Schema::hasTable('partner_order_integrations');
            $storageError = $storageReady ? null : 'Partner order storage has not been installed. Run php artisan migrate to create its database table.';
        } catch (\Throwable $exception) {
            $storageReady = false;
            $storageError = 'Partner order storage is unavailable. Check the database connection, then run php artisan migrate.';
            Log::error('Partner order integration storage check failed', ['error' => $exception->getMessage()]);
        }

        if (! $storageReady) {
            return Inertia::render('integrations/partner-orders', [
                'integrations' => [],
                'sheets' => [],
                'canManage' => $user?->roles !== 'merchant',
                'today' => now()->toDateString(),
                'storageError' => $storageError,
            ]);
        }

        $query = PartnerOrderIntegration::with('sheet')->latest('id');
        if ($user?->roles === 'merchant') {
            $query->whereHas('sheet', fn ($q) => $q->where('sheet_name', $user->name));
        }

        $sheets = Sheet::query()->select('id', 'sheet_name', 'country')->orderBy('sheet_name');
        $sheets = $user?->roles === 'merchant'
            ? $sheets->where('sheet_name', $user->name)
            : CountryAccess::scopeByCountryName($sheets, $user, 'country');

        return Inertia::render('integrations/partner-orders', [
            'integrations' => Inertia::defer(fn () => $query->get()->map(fn ($integration) => [
                'id' => $integration->id,
                'name' => $integration->integration_name,
                'provider' => $integration->provider,
                'merchant' => $integration->sheet?->sheet_name,
                'sheets_id' => $integration->sheets_id,
                'base_url' => $integration->base_url,
                'country_code' => $integration->country_code,
                'since_date' => $integration->since_date->toDateString(),
                'enabled' => $integration->is_enabled,
                'last_synced_at' => $integration->last_synced_at?->toDateTimeString(),
                'orders_synced' => $integration->orders_synced,
                'last_error' => $integration->last_error,
                'has_key' => filled($integration->api_key),
            ])),
            'sheets' => Inertia::defer(fn () => $sheets->get()),
            'canManage' => $user?->roles !== 'merchant',
            'today' => now()->toDateString(),
            'storageError' => null,
        ]);
    }

    public function store(Request $request)
    {
        $data = $this->validatedData($request);

        $sheet = Sheet::findOrFail($data['sheets_id']);
        abort_unless($request->user()?->roles !== 'merchant' || $sheet->sheet_name === $request->user()->name, 403);

        PartnerOrderIntegration::create([
            ...$data,
            'provider' => 'healthilyvitae',
            'country_code' => strtoupper($data['country_code']),
            'is_enabled' => true,
        ]);

        return back()->with('success', 'Partner API connection saved. Orders will sync every five minutes.');
    }

    public function update(Request $request, PartnerOrderIntegration $integration)
    {
        $this->authorizeIntegration($request, $integration);
        abort_if($request->user()?->roles === 'merchant', 403);
        $data = $this->validatedData($request, true);
        $sheet = Sheet::findOrFail($data['sheets_id']);

        $integration->fill([
            'integration_name' => $data['integration_name'],
            'sheets_id' => $sheet->id,
            'base_url' => rtrim($data['base_url'], '/'),
            'country_code' => strtoupper($data['country_code']),
            'since_date' => $data['since_date'],
        ]);
        if (filled($data['api_key'] ?? null)) {
            $integration->api_key = $data['api_key'];
        }
        $integration->save();

        return back()->with('success', 'Partner API connection updated.');
    }

    public function test(Request $request, PartnerOrderIntegration $integration, HealthilyVitaeOrdersApi $api)
    {
        $this->authorizeIntegration($request, $integration);
        try {
            $total = $api->test($integration);
            $integration->forceFill(['last_error' => null, 'last_error_at' => null])->save();
            return back()->with('success', "Connection successful. Partner reports {$total} order(s) for this filter.");
        } catch (\Throwable $e) {
            $integration->forceFill(['last_error' => mb_substr($e->getMessage(), 0, 1000), 'last_error_at' => now()])->save();
            return back()->with('error', 'Connection failed: '.$e->getMessage());
        }
    }

    public function sync(Request $request, PartnerOrderIntegration $integration)
    {
        $this->authorizeIntegration($request, $integration);
        Artisan::call('partner-orders:sync', ['--integration' => $integration->id]);
        $output = trim(Artisan::output());
        Log::info('Partner API order sync manually requested', ['integration_id' => $integration->id]);
        return back()->with($integration->fresh()->last_error ? 'error' : 'success', $output ?: 'Partner order sync finished.');
    }

    public function setEnabled(Request $request, PartnerOrderIntegration $integration)
    {
        $this->authorizeIntegration($request, $integration);
        $data = $request->validate(['enabled' => 'required|boolean']);
        $integration->update(['is_enabled' => $data['enabled']]);

        return back()->with('success', $data['enabled']
            ? 'Partner order sync enabled.'
            : 'Partner order sync paused.');
    }

    public function destroy(Request $request, PartnerOrderIntegration $integration)
    {
        $this->authorizeIntegration($request, $integration);
        $name = $integration->integration_name;
        $integration->delete();
        return back()->with('success', "Disconnected {$name}; imported orders were kept.");
    }

    private function authorizeIntegration(Request $request, PartnerOrderIntegration $integration): void
    {
        if ($request->user()?->roles === 'merchant' && $integration->sheet?->sheet_name !== $request->user()->name) {
            abort(403);
        }
    }

    private function validatedData(Request $request, bool $editing = false): array
    {
        return $request->validate([
            'integration_name' => 'required|string|max:255',
            'sheets_id' => 'required|exists:sheets,id',
            'base_url' => ['required', 'url', 'max:500', function ($attribute, $value, $fail) {
                $host = strtolower((string) parse_url($value, PHP_URL_HOST));
                $ip = filter_var($host, FILTER_VALIDATE_IP);
                $privateIp = $ip !== false && filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false;
                if (parse_url($value, PHP_URL_SCHEME) !== 'https' || $host === '' || in_array($host, ['localhost', '127.0.0.1', '::1'], true) || $privateIp) {
                    $fail('Use a public HTTPS API base URL.');
                }
            }],
            'api_key' => $editing ? 'nullable|string|max:500' : 'required|string|max:500',
            'country_code' => 'required|string|size:2',
            'since_date' => 'required|date_format:Y-m-d',
        ]);
    }
}
