<?php

namespace App\Services;

use App\Models\PartnerOrderIntegration;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class HealthilyVitaeOrdersApi
{
    /** Yields the provider's paginated order rows. */
    public function orders(PartnerOrderIntegration $integration): \Generator
    {
        for ($page = 1; $page <= 1000; $page++) {
            $response = Http::withHeaders([
                'X-API-Key' => $integration->api_key,
                'Accept' => 'application/json',
            ])->timeout(30)->get(rtrim($integration->base_url, '/').'/orders', [
                'country' => strtoupper($integration->country_code),
                'since' => $integration->since_date->toDateString(),
                'limit' => 50,
                'page' => $page,
            ]);

            if ($response->failed()) {
                throw new RuntimeException('Partner orders API returned HTTP '.$response->status().'.');
            }

            $body = $response->json();
            if (! is_array($body) || ! is_array($body['orders'] ?? null)) {
                throw new RuntimeException('Partner orders API returned an unexpected response format.');
            }

            foreach ($body['orders'] as $order) {
                if (is_array($order)) {
                    yield $order;
                }
            }

            if (! ($body['has_more'] ?? false) || $body['orders'] === []) {
                return;
            }
        }

        throw new RuntimeException('Partner orders API exceeded the 1000-page safety limit.');
    }

    /** Validate connectivity without logging credentials or customer data. */
    public function test(PartnerOrderIntegration $integration): int
    {
        $response = Http::withHeaders([
            'X-API-Key' => $integration->api_key,
            'Accept' => 'application/json',
        ])->timeout(20)->get(rtrim($integration->base_url, '/').'/orders', [
            'country' => strtoupper($integration->country_code),
            'since' => $integration->since_date->toDateString(),
            'limit' => 1,
            'page' => 1,
        ]);

        if ($response->failed() || ! is_array($response->json('orders'))) {
            throw new RuntimeException('Connection failed (HTTP '.$response->status().') or response format was unexpected.');
        }

        return (int) ($response->json('total') ?? count($response->json('orders')));
    }

    /** Translate a provider order into our existing incoming-order payload. */
    public function normalize(array $order, PartnerOrderIntegration $integration): array
    {
        $sheetName = (string) ($integration->sheet?->sheet_name ?? '');
        $reference = trim((string) ($order['reference'] ?? ''));
        $externalId = $order['id'] ?? $reference;

        if ($reference === '' || $externalId === null || (string) $externalId === '') {
            throw new RuntimeException('Partner order is missing its reference or external ID.');
        }

        $country = app(StoreepCountryResolver::class)->resolve(
            (string) ($order['country_code'] ?? $integration->country_code),
            $integration->sheet?->country
        );

        return [
            'order_no' => $reference,
            'client_name' => $order['customer'] ?? null,
            'phone' => $order['phone'] ?? $order['whatsapp'] ?? null,
            'address' => $order['address'] ?? null,
            'city' => null,
            'product_name' => $order['package'] ?? null,
            'quantity' => isset($order['quantity']) && $order['quantity'] !== '' ? max(1, (int) $order['quantity']) : 1,
            'amount' => (float) ($order['amount'] ?? 0),
            // Provider status `sent` does not mean delivered in our workflow.
            'status' => null,
            'country' => $country,
            'order_date' => $order['created'] ?? null,
            'merchant' => $sheetName,
            'sheet_id' => 'merchant-api:'.$integration->id,
            'sheet_name' => $sheetName,
            'store_name' => $integration->sheet?->store_name ?: 'RDL1',
            '_partner_integration_id' => $integration->id,
            '_partner_provider' => $integration->provider,
            '_partner_external_id' => (string) $externalId,
            '_partner_currency' => $order['currency'] ?? null,
            '_partner_status' => $order['status'] ?? null,
            '_partner_reference' => $reference,
        ];
    }
}
