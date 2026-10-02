<?php

namespace App\Services;

use App\Jobs\ProcessIncomingSheetOrder;
use App\Models\IncomingSheetOrder;
use App\Models\StoreepIntegration;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Bridges a normalised Storeep order into our existing sheet-order pipeline.
 *
 * Rather than writing to `sheet_orders` directly, orders are staged into
 * `incoming_sheet_orders` and handed to `ProcessIncomingSheetOrder`, which is
 * the same staging/retry/lock path the Google Apps Script feed uses. That gets
 * us deduplication, queue backoff and the operator-facing retry screen at
 * /incoming-sheet-orders for free.
 *
 * The staged payload is shaped for `SheetOrderImportService`, so the only
 * translation that happens here is the one Storeep forces on us:
 *
 * - `order_no` becomes `<prefix><number>` with no separator, e.g. TRI1. The
 *   prefix is allocated per integration and locked, so it cannot collide with
 *   another merchant's numbering.
 * - `merchant` comes from the integration's sheet, never from the payload.
 * - `country` is resolved from Storeep's ISO market code server-side, falling
 *   back to the integration's configured country.
 * - `status` is left blank. Storeep reports 'pending' until fulfilment, and
 *   writing that would make the order look already-handled on the board.
 */
class StoreepOrderImporter
{
    public function __construct(
        private readonly StoreepCountryResolver $countries,
    ) {
    }

    /**
     * Stage one normalised order and queue it for processing.
     *
     * @param  array<string, mixed>  $order  Output of StoreepApiService's normaliser.
     * @return IncomingSheetOrder
     */
    public function stage(StoreepIntegration $integration, array $order): IncomingSheetOrder
    {
        $storeepId = $order['storeep_id'] ?? null;

        if ($storeepId === null) {
            throw new \InvalidArgumentException('Storeep order is missing its id.');
        }

        $payload = $this->buildPayload($integration, $order);

        // Scoped to the integration as well as the Storeep id, so the same
        // numeric order number in two stores never collapses into one row.
        $sourceHash = hash('sha256', json_encode([
            'provider' => 'storeep',
            'integration' => $integration->id,
            'storeep_id' => (string) $storeepId,
        ]));

        $incoming = IncomingSheetOrder::firstOrCreate(
            ['source_hash' => $sourceHash],
            [
                'order_no' => $payload['order_no'] ?? null,
                'sheet_id' => $payload['sheet_id'] ?? null,
                'sheet_name' => $payload['sheet_name'] ?? null,
                'payload' => $payload,
                'status' => 'pending',
                'available_at' => now(),
            ]
        );

        $shouldDispatch = $incoming->wasRecentlyCreated;

        if (! $shouldDispatch) {
            // An update webhook or a re-run carries a changed payload. Re-queue so
            // the order reflects its latest state, matching the App Script feed.
            if (($incoming->payload ?? []) !== $payload) {
                $incoming->forceFill([
                    'order_no' => $payload['order_no'] ?? null,
                    'sheet_id' => $payload['sheet_id'] ?? null,
                    'sheet_name' => $payload['sheet_name'] ?? null,
                    'payload' => $payload,
                    'status' => 'pending',
                    'error_message' => null,
                    'available_at' => now(),
                ])->save();

                $shouldDispatch = true;
            } elseif ($incoming->status === 'failed') {
                $incoming->forceFill([
                    'status' => 'pending',
                    'error_message' => null,
                    'available_at' => now(),
                ])->save();

                $shouldDispatch = true;
            }
        }

        if ($shouldDispatch) {
            ProcessIncomingSheetOrder::dispatch($incoming->id);
        }

        Log::info('📩 Storeep order staged', [
            'store' => $integration->store_name,
            'order_no' => $payload['order_no'] ?? null,
            'incoming_id' => $incoming->id,
        ]);

        return $incoming;
    }

    /**
     * Translate a normalised Storeep order into our sheet-order payload shape.
     *
     * @param  array<string, mixed>  $order
     * @return array<string, mixed>
     */
    public function buildPayload(StoreepIntegration $integration, array $order): array
    {
        $sheet = $integration->sheet;

        $storeepNumber = $order['storeep_number'] ?? null;
        $prefix = (string) $integration->order_no_prefix;

        // Orders with no usable number are still importable; key them off the
        // Storeep id so the order number stays stable across re-runs.
        $orderNo = $storeepNumber !== null && $storeepNumber !== ''
            ? $prefix.$storeepNumber
            : $prefix.Str::upper(Str::substr((string) ($order['storeep_id'] ?? ''), -9));

        $country = $this->countries->resolve(
            $order['market'] ?? null,
            $integration->country
        );

        return [
            'order_no' => $orderNo,
            'client_name' => $order['client_name'] ?? null,
            'phone' => $order['phone'] ?? null,
            'address' => $order['address'] ?? null,
            'city' => $order['city'] ?? null,
            'product_name' => $order['product_name'] ?? null,
            'quantity' => max(1, (int) ($order['quantity'] ?? 0)),
            'amount' => (float) ($order['amount'] ?? 0),
            // Blank by design: see the class docblock.
            'status' => null,
            'country' => $country,
            'merchant' => $sheet?->sheet_name,
            'sheet_id' => $sheet?->sheet_id,
            'sheet_name' => $sheet?->sheet_name,
            'store_name' => $sheet?->store_name ?: 'RDL1',
        ];
    }
}
