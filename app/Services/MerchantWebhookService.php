<?php

namespace App\Services;

use App\Jobs\SendMerchantWebhook;
use App\Models\MerchantApiIntegration;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

class MerchantWebhookService
{
    /** @return array{status: int, duration_ms: int} */
    public function sendTest(MerchantApiIntegration $integration): array
    {
        if (! filled($integration->webhook_url) || ! filled($integration->webhook_secret)) {
            throw new \RuntimeException('Save a webhook URL first so a signing secret can be configured.');
        }

        if (! $this->targetsPublicHttpsHost($integration->webhook_url)) {
            throw new \RuntimeException('The webhook URL must resolve to a public HTTPS host.');
        }

        $payload = [
            'id' => (string) Str::uuid(),
            'type' => 'integration.test',
            'created_at' => now()->toIso8601String(),
            'data' => [
                'integration_id' => $integration->id,
                'integration_name' => $integration->name,
                'message' => 'Webhook test event',
            ],
        ];
        $body = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $signature = hash_hmac('sha256', $body, $integration->webhook_secret);
        $startedAt = hrtime(true);

        $response = Http::timeout(5)
            ->withoutRedirecting()
            ->withHeaders([
                'X-RDL-Event' => 'integration.test',
                'X-RDL-Signature' => 'sha256='.$signature,
            ])
            ->withBody($body, 'application/json')
            ->post($integration->webhook_url);

        if (! $response->successful()) {
            throw new \RuntimeException('The receiving server returned HTTP '.$response->status().'.');
        }

        return [
            'status' => $response->status(),
            'duration_ms' => (int) round((hrtime(true) - $startedAt) / 1_000_000),
        ];
    }

    public function send(string $merchant, string $event, array $data): void
    {
        $scope = $this->requiredScope($event);
        if (! $scope) {
            return;
        }

        MerchantApiIntegration::query()
            ->where('is_active', true)
            ->whereNotNull('webhook_url')
            ->whereNotNull('webhook_secret')
            ->whereJsonContains('scopes', $scope)
            ->whereJsonContains('webhook_events', $event)
            ->whereHas('merchantUser', fn ($query) => $query->where('name', $merchant)->where('merchant_api_enabled', true))
            ->pluck('id')
            ->each(function (int $integrationId) use ($event, $data): void {
                SendMerchantWebhook::dispatch($integrationId, $event, $data)->afterCommit();
            });
    }

    public function deliver(int $integrationId, string $event, array $data): void
    {
        $scope = $this->requiredScope($event);
        if (! $scope) {
            return;
        }

        $integration = MerchantApiIntegration::query()
            ->with('merchantUser')
            ->whereKey($integrationId)
            ->where('is_active', true)
            ->whereNotNull('webhook_url')
            ->whereNotNull('webhook_secret')
            ->whereJsonContains('scopes', $scope)
            ->whereJsonContains('webhook_events', $event)
            ->first();

        if (! $integration) {
            return;
        }

        $allowedScopes = $integration->merchantUser?->merchant_api_scopes;
        if (! $integration->merchantUser?->merchant_api_enabled || (is_array($allowedScopes) && ! in_array($scope, $allowedScopes, true))) {
            return;
        }

        if (str_starts_with($event, 'transfer.')) {
            $permittedFields = $integration->transfer_fields ?? \App\Support\MerchantApiFieldCatalog::TRANSFER_FIELDS;
            $data = array_intersect_key($data, array_flip($permittedFields));
            $data['movement_type'] = $event === 'transfer.returned' ? 'returned' : 'sent';
        }

        if (! $this->targetsPublicHttpsHost($integration->webhook_url)) {
            Log::warning('Merchant webhook URL was rejected because it is not a public HTTPS host.', [
                'integration_id' => $integration->id,
                'event' => $event,
            ]);

            return;
        }

        $payload = [
            'id' => (string) Str::uuid(),
            'type' => $event,
            'created_at' => now()->toIso8601String(),
            'data' => $data,
        ];
        $body = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $signature = hash_hmac('sha256', $body, $integration->webhook_secret);

        $response = Http::timeout(5)
            ->withoutRedirecting()
            ->withHeaders([
                'X-RDL-Event' => $event,
                'X-RDL-Signature' => 'sha256='.$signature,
            ])
            ->withBody($body, 'application/json')
            ->post($integration->webhook_url);

        if (! $response->successful()) {
            throw new \RuntimeException('Merchant webhook returned HTTP '.$response->status());
        }
    }

    private function requiredScope(string $event): ?string
    {
        return match (true) {
            str_starts_with($event, 'order.') => 'orders:read',
            str_starts_with($event, 'product.') => 'products:read',
            str_starts_with($event, 'transfer.') => 'transfers:read',
            default => null,
        };
    }

    private function targetsPublicHttpsHost(?string $url): bool
    {
        $parts = parse_url((string) $url);
        if (($parts['scheme'] ?? null) !== 'https' || empty($parts['host'])) {
            return false;
        }

        $host = trim($parts['host'], '[]');
        $flags = FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE;
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            return filter_var($host, FILTER_VALIDATE_IP, $flags) !== false;
        }

        $records = dns_get_record($host, DNS_A | DNS_AAAA);
        if (! $records) {
            return false;
        }

        foreach ($records as $record) {
            $ip = $record['ip'] ?? $record['ipv6'] ?? null;
            if (! $ip || filter_var($ip, FILTER_VALIDATE_IP, $flags) === false) {
                return false;
            }
        }

        return true;
    }
}
