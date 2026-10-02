<?php

namespace App\Services;

use App\Models\StoreepIntegration;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Client for the Storeep REST API (https://docs.storeep.com).
 *
 * Mirrors MetaCloudApiService's conventions: the Http facade with a bearer
 * token, a private parseResponse() that logs and throws on failure, and emoji
 * -prefixed log lines. Credentials are per store and read from the
 * `storeep_integrations` row rather than config, because there will be one
 * store per merchant.
 *
 * Storeep rate limits are 60 requests/minute per token.
 */
class StoreepApiService
{
    public function __construct(
        private readonly int $timeout = 30,
        private readonly int $perPage = 50,
    ) {
    }

    /**
     * Walk orders newest-first, yielding one normalised order per call.
     *
     * Reconciliation walks `updated_at DESC` from the integration's cursor so a
     * run that dies mid-page resumes on the next one. `$seenIds` keeps the
     * generator idempotent across overlapping pages, because Storeep gives no
     * cursor token and ordering is only stable to the second.
     *
     * @param  \Generator<int, array<string, mixed>>  $orders
     * @param  array<int, int|string>  $seenIds
     */
    public function ordersSince(
        StoreepIntegration $integration,
        ?string $sinceUpdatedAt = null,
        array $seenIds = [],
        ?int $maxPages = null,
    ): \Generator {
        $maxPages ??= (int) config('services.storeep.max_pages_per_run', 20);
        $page = 1;

        while ($page <= $maxPages) {
            $query = [
                'limit' => $this->perPage,
                'page' => $page,
                'sort_field' => 'updated_at',
                'sort_order' => 'DESC',
            ];

            $response = $this->client($integration)->get($this->url('/orders'), $query);
            $payload = $this->parseResponse($response, $integration, "orders page {$page}");

            $rows = data_get($payload, 'data', []);
            $rows = is_array($rows) ? $rows : [];

            if ($rows === []) {
                return;
            }

            $pageNewest = null;

            foreach ($rows as $row) {
                $id = $row['id'] ?? null;

                if ($id !== null && in_array($id, $seenIds, true)) {
                    // Already handled on an earlier page of this same run.
                    continue;
                }

                if ($id !== null) {
                    $seenIds[] = $id;
                }

                $updatedAt = $row['updated_at'] ?? null;

                // Stop once we reach orders older than the cursor. The ordering is
                // descending, so everything after this point is already synced.
                if ($sinceUpdatedAt !== null
                    && is_string($updatedAt)
                    && $updatedAt <= $sinceUpdatedAt
                ) {
                    return;
                }

                if (is_string($updatedAt) && ($pageNewest === null || $updatedAt > $pageNewest)) {
                    $pageNewest = $updatedAt;
                }

                yield $this->normaliseOrder($row);
            }

            $currentPage = (int) data_get($payload, 'meta.pagination.current_page', $page);
            $totalPages = (int) data_get($payload, 'meta.pagination.total_pages', $page);

            if ($currentPage >= $totalPages || $totalPages === 0) {
                return;
            }

            $page++;
        }
    }

    /**
     * Cheap reachability + credential check used by the integrations page.
     *
     * @return array{ok: bool, status: int, message: string, total: int|null}
     */
    public function testConnection(StoreepIntegration $integration): array
    {
        try {
            $response = $this->client($integration)->get($this->url('/orders'), ['limit' => 1]);
        } catch (RuntimeException $exception) {
            return ['ok' => false, 'status' => 0, 'message' => $exception->getMessage(), 'total' => null];
        }

        $status = $response->status();
        $total = $response->json('meta.pagination.total');

        if ($response->failed()) {
            return [
                'ok' => false,
                'status' => $status,
                'message' => $this->errorMessage($response),
                'total' => null,
            ];
        }

        Log::info('✓ Storeep connection test succeeded', [
            'store' => $integration->store_name,
            'total' => $total,
        ]);

        return [
            'ok' => true,
            'status' => $status,
            'message' => 'Connected.',
            'total' => is_numeric($total) ? (int) $total : null,
        ];
    }

    /**
     * Flatten a Storeep order into our `sheet_orders` shape.
     *
     * Notes on the deliberate choices:
     *
     * - `status` is intentionally left null. Storeep reports 'pending' until an
     *   order is fulfilled, and writing that would surface the order in our
     *   board as already-handled. Leaving it blank means the order appears as
     *   new work and is picked up later when it is actually delivered.
     * - A multi-item order stays ONE order. `quantity` is the sum across line
     *   items, and `product_name` lists them, because the warehouse deducts
     *   against the order as a unit.
     * - `market` is the ISO alpha-2 code ("KE"); the caller resolves it to a
     *   country name via `countries.iso_code`.
     *
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private function normaliseOrder(array $row): array
    {
        $items = data_get($row, 'items', []);
        $items = is_array($items) ? array_values(array_filter($items, 'is_array')) : [];

        $quantity = 0;
        $names = [];

        foreach ($items as $item) {
            $quantity += max(0, (int) ($item['quantity'] ?? 0));

            $name = trim((string) ($item['name'] ?? ''));

            if ($name !== '') {
                $names[] = $name;
            }
        }

        $address = $this->shippingAddress($row);

        return [
            'storeep_id' => $row['id'] ?? null,
            'storeep_number' => isset($row['number']) ? (string) $row['number'] : null,
            'order_no' => isset($row['number']) ? (string) $row['number'] : null,

            'client_name' => $address['fullname'] ?? null,
            'phone' => $address['phone'] ?? null,
            'address' => $address['address1'] ?? null,
            'city' => $address['city'] ?? null,

            'product_name' => $this->joinProductNames($names),
            'code' => null,
            'quantity' => $quantity,
            'amount' => (float) ($row['total'] ?? 0),
            'currency' => $row['currency'] ?? null,

            // Left blank by design; see the docblock.
            'status' => null,

            'market' => $row['market'] ?? null,
            'is_fulfilled' => (bool) ($row['is_fulfilled'] ?? false),
            'is_paid' => (bool) ($row['is_paid'] ?? false),
            'is_abandoned' => (bool) ($row['is_abandoned'] ?? false),
            'is_duplicated' => (bool) ($row['is_duplicated'] ?? false),
            'is_test' => (bool) ($row['is_test'] ?? false),
            'payment_method' => $row['payment_method'] ?? null,
            'shipping_method' => $row['shipping_method'] ?? null,

            'created_at' => $row['created_at'] ?? null,
            'updated_at_remote' => $row['updated_at'] ?? null,
        ];
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private function shippingAddress(array $row): array
    {
        $addresses = data_get($row, 'addresses', []);
        $addresses = is_array($addresses) ? array_filter($addresses, 'is_array') : [];

        foreach ($addresses as $address) {
            if (($address['type'] ?? null) === 'shipping') {
                return $address;
            }
        }

        // Fall back to the first address so an order with only a billing entry
        // still records who it is for.
        return $addresses === [] ? [] : reset($addresses);
    }

    /**
     * @param  string[]  $names
     */
    private function joinProductNames(array $names): ?string
    {
        if ($names === []) {
            return null;
        }

        // Storeep caps `product_name` at 255 chars, so trim rather than fail.
        return Str::limit(implode(', ', $names), 255, '');
    }

    // -----------------------------------------------------------------
    //  Private helpers
    // -----------------------------------------------------------------

    private function client(StoreepIntegration $integration): PendingRequest
    {
        return Http::withToken($integration->access_token)
            ->acceptJson()
            ->timeout($this->timeout);
    }

    private function url(string $path): string
    {
        return rtrim((string) config('services.storeep.base_url', 'https://api.storeep.com/v1'), '/').$path;
    }

    /**
     * @return array<string, mixed>
     */
    private function parseResponse(
        Response $response,
        StoreepIntegration $integration,
        string $context,
    ): array {
        if ($response->failed()) {
            Log::error('❌ Storeep API request failed', [
                'store' => $integration->store_name,
                'context' => $context,
                'status' => $response->status(),
                'body' => $response->body(),
            ]);

            throw new RuntimeException(
                'Storeep API failed: HTTP '.$response->status().' '.$this->errorMessage($response)
            );
        }

        return (array) $response->json();
    }

    private function errorMessage(Response $response): string
    {
        $errors = $response->json('errors');

        if (is_array($errors) && $errors !== []) {
            return implode(' ', array_map('strval', $errors));
        }

        $body = trim($response->body());

        return $body === '' ? 'Unknown error.' : Str::limit($body, 300);
    }
}
