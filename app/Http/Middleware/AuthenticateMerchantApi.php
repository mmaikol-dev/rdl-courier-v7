<?php

namespace App\Http\Middleware;

use App\Models\MerchantApiIntegration;
use App\Models\MerchantApiRequestLog;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateMerchantApi
{
    public function handle(Request $request, Closure $next): Response
    {
        $plainToken = $request->bearerToken();

        if (! $plainToken) {
            return response()->json(['message' => 'A bearer token is required.'], 401);
        }

        $integration = MerchantApiIntegration::query()
            ->with('merchantUser')
            ->where('token_hash', hash('sha256', $plainToken))
            ->where('is_active', true)
            ->first();

        if (! $integration || ! $integration->merchantUser || strtolower(trim((string) $integration->merchantUser->roles)) !== 'merchant' || ! $integration->merchantUser->merchant_api_enabled) {
            return response()->json(['message' => 'The API token is invalid or revoked.'], 401);
        }

        $allowedScopes = $integration->merchantUser->merchant_api_scopes;
        if (is_array($allowedScopes) && ! array_intersect($integration->scopes ?? [], $allowedScopes)) {
            return response()->json(['message' => 'API access for this merchant account has been restricted.'], 403);
        }

        $integration->forceFill(['last_used_at' => now()])->save();
        $request->attributes->set('merchant_api_integration', $integration);

        $startedAt = hrtime(true);
        $response = $next($request);

        try {
            MerchantApiRequestLog::create([
                'merchant_api_integration_id' => $integration->id,
                'method' => $request->method(),
                'path' => '/'.ltrim($request->path(), '/'),
                'status_code' => $response->getStatusCode(),
                'duration_ms' => (int) round((hrtime(true) - $startedAt) / 1_000_000),
                'requested_at' => now(),
            ]);
        } catch (\Throwable $exception) {
            // A monitoring write must not turn a successful merchant API call into a failure.
            Log::warning('Could not record merchant API request metrics.', [
                'integration_id' => $integration->id,
                'exception' => $exception->getMessage(),
            ]);
        }

        return $response;
    }
}
