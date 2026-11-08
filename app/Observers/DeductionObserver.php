<?php

namespace App\Observers;

use App\Models\Deduction;
use App\Services\MerchantWebhookService;
use Illuminate\Contracts\Events\ShouldHandleEventsAfterCommit;

class DeductionObserver implements ShouldHandleEventsAfterCommit
{
    public function created(Deduction $deduction): void
    {
        $isDeliveredOrder = str_starts_with(
            mb_strtolower(trim((string) $deduction->reason)),
            'delivered order '
        );
        $deduction->loadMissing('product.user');
        $merchant = $deduction->product?->merchant ?: $deduction->product?->user?->name;

        if (! filled($merchant)) {
            return;
        }

        app(MerchantWebhookService::class)->send((string) $merchant, $isDeliveredOrder ? 'order.inventory_deducted' : 'transfer.returned', [
            'id' => $deduction->id,
            'movement_type' => $isDeliveredOrder ? 'delivered' : 'returned',
            'code' => $deduction->code,
            'product_id' => $deduction->product_id,
            'quantity' => $deduction->quantity,
            'agent_id' => $deduction->agent_id,
            'reason' => $deduction->reason,
            'performed_by' => $deduction->deducted_by,
            'created_at' => $deduction->created_at?->toIso8601String(),
        ]);
    }
}
