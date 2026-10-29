<?php

namespace App\Observers;

use App\Models\Transfer;
use App\Services\MerchantWebhookService;
use Illuminate\Contracts\Events\ShouldHandleEventsAfterCommit;

class TransferObserver implements ShouldHandleEventsAfterCommit
{
    public function created(Transfer $transfer): void
    {
        $this->send($transfer);
    }

    private function send(Transfer $transfer): void
    {
        $transfer->loadMissing('product.user');
        $merchant = $transfer->product?->merchant ?: $transfer->product?->user?->name;
        if (! filled($merchant)) {
            return;
        }

        app(MerchantWebhookService::class)->send((string) $merchant, 'transfer.created', [
            'id' => $transfer->id,
            'product_id' => $transfer->product_id,
            'quantity' => $transfer->quantity,
            'agent_id' => $transfer->agent_id,
            'created_at' => $transfer->created_at?->toIso8601String(),
        ]);
    }
}
