<?php

namespace App\Services;

use App\Jobs\ProcessIncomingSheetOrder;
use App\Models\IncomingSheetOrder;
use App\Models\PartnerOrderIntegration;

class PartnerOrderImporter
{
    public function stage(PartnerOrderIntegration $integration, array $order): IncomingSheetOrder
    {
        $payload = app(HealthilyVitaeOrdersApi::class)->normalize($order, $integration);
        $hash = hash('sha256', implode('|', [
            $integration->provider,
            $integration->id,
            $payload['_partner_external_id'],
        ]));

        $incoming = IncomingSheetOrder::firstOrCreate(
            ['source_hash' => $hash],
            [
                'order_no' => $payload['order_no'],
                'sheet_id' => $payload['sheet_id'],
                'sheet_name' => $payload['sheet_name'],
                'payload' => $payload,
                'status' => 'pending',
                'available_at' => now(),
            ]
        );

        $dispatch = $incoming->wasRecentlyCreated;
        if (! $dispatch && ($incoming->payload ?? []) !== $payload) {
            $incoming->forceFill([
                'order_no' => $payload['order_no'],
                'sheet_id' => $payload['sheet_id'],
                'sheet_name' => $payload['sheet_name'],
                'payload' => $payload,
                'status' => 'pending',
                'error_message' => null,
                'available_at' => now(),
            ])->save();
            $dispatch = true;
        } elseif (! $dispatch && in_array($incoming->status, ['failed', 'skipped'], true)) {
            $incoming->forceFill(['status' => 'pending', 'error_message' => null, 'available_at' => now()])->save();
            $dispatch = true;
        }

        if ($dispatch) {
            ProcessIncomingSheetOrder::dispatch($incoming->id);
        }

        return $incoming;
    }
}
