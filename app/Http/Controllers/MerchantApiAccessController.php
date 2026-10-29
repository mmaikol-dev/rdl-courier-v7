<?php

namespace App\Http\Controllers;

use App\Models\MerchantApiIntegration;
use App\Models\User;
use App\Services\MerchantWebhookService;
use App\Support\SidebarRegistry;
use App\Support\MerchantApiFieldCatalog;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class MerchantApiAccessController extends Controller
{
    private const SCOPES = ['orders:read', 'products:read', 'transfers:read'];

    private const EVENTS = ['order.created', 'order.updated', 'product.created', 'product.updated', 'transfer.created', 'transfer.returned'];

    private function canManage(Request $request): bool
    {
        return SidebarRegistry::canManage($request->user()?->roles);
    }

    private function ensureAccess(Request $request, ?MerchantApiIntegration $integration = null): bool
    {
        $user = $request->user();
        $isManager = $this->canManage($request);
        $isMerchant = strtolower(trim((string) $user?->roles)) === 'merchant';

        abort_unless($isManager || ($isMerchant && (! $integration || (int) $integration->merchant_user_id === (int) $user->id)), 403);

        return $isManager;
    }

    public function index(Request $request)
    {
        $isManager = $this->ensureAccess($request);
        $user = $request->user();

        $integrationsQuery = MerchantApiIntegration::query()
            ->with('merchantUser:id,name,email,merchant_api_scopes')
            ->when(! $isManager, fn ($query) => $query->where('merchant_user_id', $user->id))
            ->latest('id');

        return Inertia::render('merchant-api-access/index', [
            'integrations' => Inertia::defer(fn () => $integrationsQuery->get()
            ->map(fn (MerchantApiIntegration $integration) => [
                'id' => $integration->id,
                'merchant_user_id' => $integration->merchant_user_id,
                'merchant' => $integration->merchantUser?->name,
                'email' => $integration->merchantUser?->email,
                'name' => $integration->name,
                'token_prefix' => $integration->token_prefix,
                'scopes' => $integration->scopes ?? [],
                'transfer_fields' => $integration->transfer_fields ?? MerchantApiFieldCatalog::TRANSFER_FIELDS,
                'merchant_allowed_scopes' => $integration->merchantUser?->merchant_api_scopes ?? self::SCOPES,
                'webhook_url' => $integration->webhook_url,
                'webhook_events' => $integration->webhook_events ?? [],
                'has_webhook_secret' => filled($integration->webhook_secret),
                'is_active' => $integration->is_active,
                'last_used_at' => $integration->last_used_at?->toDateTimeString(),
                'created_at' => $integration->created_at?->toDateTimeString(),
            ]), 'integrations'),
            'merchants' => $isManager
                ? Inertia::defer(fn () => User::query()->where('roles', 'merchant')->orderBy('name')->get(['id', 'name', 'email', 'merchant_api_enabled', 'merchant_api_scopes']))
                : [],
            'canManage' => $isManager,
            'currentMerchant' => $isManager ? null : [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'merchant_api_enabled' => (bool) $user->merchant_api_enabled,
                'merchant_api_scopes' => $user->merchant_api_scopes ?? self::SCOPES,
            ],
            'availableScopes' => self::SCOPES,
            'availableTransferFields' => MerchantApiFieldCatalog::TRANSFER_FIELDS,
            'availableEvents' => self::EVENTS,
            'newCredentials' => $request->session()->get('new_api_credentials'),
        ]);
    }

    public function store(Request $request)
    {
        $isManager = $this->ensureAccess($request);

        $targetMerchant = $isManager
            ? User::query()->find($request->input('merchant_user_id'))
            : $request->user();
        $allowedScopes = $targetMerchant?->merchant_api_scopes ?? self::SCOPES;
        $rules = [
            'name' => ['required', 'string', 'max:120'],
            'scopes' => ['required', 'array', 'min:1'],
            'scopes.*' => ['required', 'string', Rule::in($allowedScopes)],
            'transfer_fields' => ['sometimes', 'array', 'min:1'],
            'transfer_fields.*' => ['required', 'string', Rule::in(MerchantApiFieldCatalog::TRANSFER_FIELDS)],
            'webhook_url' => ['nullable', 'url:https', 'max:2000'],
            'webhook_events' => ['nullable', 'array'],
            'webhook_events.*' => ['required', 'string', Rule::in(self::EVENTS)],
        ];
        if ($isManager) {
            $rules['merchant_user_id'] = ['required', 'integer', Rule::exists('users', 'id')->where('roles', 'merchant')];
        } elseif (! $request->user()->merchant_api_enabled) {
            abort(403, 'API access for your merchant account is disabled. Contact an administrator to enable it.');
        }
        $validated = $request->validate($rules);

        $token = 'rdl_live_'.Str::random(48);
        $webhookSecret = filled($validated['webhook_url'] ?? null) ? 'whsec_'.Str::random(40) : null;
        $integration = MerchantApiIntegration::create([
            'merchant_user_id' => $isManager ? $validated['merchant_user_id'] : $request->user()->id,
            'name' => $validated['name'],
            'token_hash' => hash('sha256', $token),
            'token_prefix' => substr($token, 0, 16),
            'scopes' => array_values(array_unique($validated['scopes'])),
            'transfer_fields' => array_values(array_unique($validated['transfer_fields'] ?? MerchantApiFieldCatalog::TRANSFER_FIELDS)),
            'webhook_url' => $validated['webhook_url'] ?? null,
            'webhook_secret' => $webhookSecret,
            'webhook_events' => $validated['webhook_events'] ?? [],
            'is_active' => true,
        ]);

        return back()->with('new_api_credentials', [
            'integration_id' => $integration->id,
            'token' => $token,
            'webhook_secret' => $webhookSecret,
        ])->with('success', 'Merchant API access created. Copy the credentials now; the API token is only shown once.');
    }

    public function update(Request $request, MerchantApiIntegration $integration)
    {
        $isManager = $this->ensureAccess($request, $integration);

        $allowedScopes = $integration->merchantUser?->merchant_api_scopes ?? self::SCOPES;
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'scopes' => ['required', 'array', 'min:1'],
            'scopes.*' => ['required', 'string', Rule::in($allowedScopes)],
            'transfer_fields' => ['sometimes', 'array', 'min:1'],
            'transfer_fields.*' => ['required', 'string', Rule::in(MerchantApiFieldCatalog::TRANSFER_FIELDS)],
            'webhook_url' => ['nullable', 'url:https', 'max:2000'],
            'webhook_events' => ['nullable', 'array'],
            'webhook_events.*' => ['required', 'string', Rule::in(self::EVENTS)],
            'is_active' => ['required', 'boolean'],
        ]);

        $newWebhookSecret = null;
        if (filled($validated['webhook_url'] ?? null) && ! filled($integration->webhook_secret)) {
            $newWebhookSecret = 'whsec_'.Str::random(40);
        }

        $integration->update([
            'name' => $validated['name'],
            'scopes' => array_values(array_unique($validated['scopes'])),
            'transfer_fields' => array_values(array_unique($validated['transfer_fields'] ?? $integration->transfer_fields ?? MerchantApiFieldCatalog::TRANSFER_FIELDS)),
            'webhook_url' => $validated['webhook_url'] ?? null,
            'webhook_events' => $validated['webhook_events'] ?? [],
            'is_active' => $isManager ? $validated['is_active'] : ($integration->is_active && $validated['is_active']),
            ...($newWebhookSecret ? ['webhook_secret' => $newWebhookSecret] : []),
        ]);

        if ($request->expectsJson()) {
            return response()->json([
                'message' => $newWebhookSecret
                    ? 'Settings saved. Copy your new webhook signing secret.'
                    : 'Integration settings saved.',
                'webhook_secret' => $newWebhookSecret,
            ]);
        }

        if ($newWebhookSecret) {
            return back()->with('new_api_credentials', [
                'integration_id' => $integration->id,
                'token' => null,
                'webhook_secret' => $newWebhookSecret,
            ])->with('success', 'Access settings saved. Copy the new webhook signing secret now.');
        }

        return back()->with('success', 'Merchant API access updated.');
    }

    public function rotate(Request $request, MerchantApiIntegration $integration)
    {
        $this->ensureAccess($request, $integration);

        $validated = $request->validate([
            'credentials' => ['required', Rule::in(['token', 'webhook', 'both'])],
        ]);
        $choice = $validated['credentials'];
        $token = in_array($choice, ['token', 'both'], true) ? 'rdl_live_'.Str::random(48) : null;
        $webhookSecret = in_array($choice, ['webhook', 'both'], true) ? 'whsec_'.Str::random(40) : null;
        $updates = [];
        if ($token) {
            $updates['token_hash'] = hash('sha256', $token);
            $updates['token_prefix'] = substr($token, 0, 16);
        }
        if ($webhookSecret) {
            $updates['webhook_secret'] = $webhookSecret;
        }
        $integration->update($updates);

        if ($request->expectsJson()) {
            return response()->json([
                'message' => match ($choice) {
                    'token' => 'API token replaced. The previous token is no longer valid.',
                    'webhook' => 'Webhook signing secret replaced. Update your webhook receiver.',
                    default => 'API token and webhook signing secret replaced. Update both integrations.',
                },
                'credentials' => [
                    'integration_id' => $integration->id,
                    'token' => $token,
                    'webhook_secret' => $webhookSecret,
                ],
                'token_prefix' => $token ? $integration->token_prefix : null,
            ]);
        }

        return back()->with('new_api_credentials', [
            'integration_id' => $integration->id,
            'token' => $token,
            'webhook_secret' => $webhookSecret,
        ])->with('success', 'Selected credentials replaced. Copy the new credentials now.');
    }

    public function testWebhook(Request $request, MerchantApiIntegration $integration, MerchantWebhookService $webhooks)
    {
        $this->ensureAccess($request, $integration);

        try {
            $result = $webhooks->sendTest($integration);
        } catch (\Throwable $exception) {
            report($exception);

            if ($request->expectsJson()) {
                return response()->json(['message' => 'Webhook test failed: '.$exception->getMessage()], 422);
            }

            return back()->withErrors([
                'webhook_test' => 'Webhook test failed: '.$exception->getMessage(),
            ]);
        }

        if ($request->expectsJson()) {
            return response()->json([
                'message' => 'Webhook receiver accepted the test event.',
                ...$result,
            ]);
        }

        return back()->with('success', "Test webhook accepted with HTTP {$result['status']} in {$result['duration_ms']} ms.");
    }

    public function destroy(Request $request, MerchantApiIntegration $integration)
    {
        $this->ensureAccess($request, $integration);
        $integration->update(['is_active' => false]);

        return back()->with('success', 'Merchant API access revoked.');
    }

    public function updateMerchantAccess(Request $request, User $user)
    {
        abort_unless($this->canManage($request), 403);
        abort_unless(strtolower(trim((string) $user->roles)) === 'merchant', 404);

        $validated = $request->validate([
            'merchant_api_enabled' => ['required', 'boolean'],
            'merchant_api_scopes' => ['present', 'array'],
            'merchant_api_scopes.*' => ['required', 'string', Rule::in(self::SCOPES)],
        ]);

        $user->update([
            'merchant_api_enabled' => $validated['merchant_api_enabled'],
            'merchant_api_scopes' => array_values(array_unique($validated['merchant_api_scopes'])),
        ]);

        if (! $validated['merchant_api_enabled']) {
            MerchantApiIntegration::query()
                ->where('merchant_user_id', $user->id)
                ->update(['is_active' => false]);
        }

        return back()->with('success', $validated['merchant_api_enabled']
            ? "API self-service enabled for {$user->name}."
            : "API access disabled for {$user->name}; all their tokens have been revoked.");
    }
}
