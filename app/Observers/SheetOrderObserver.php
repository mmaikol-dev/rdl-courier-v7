<?php

namespace App\Observers;

use App\Models\SheetOrder;
use App\Services\MerchantWebhookService;
use Illuminate\Contracts\Events\ShouldHandleEventsAfterCommit;

class SheetOrderObserver implements ShouldHandleEventsAfterCommit
{
    public function created(SheetOrder $order): void
    {
        $this->send($order, 'order.created');
    }

    public function updated(SheetOrder $order): void
    {
        $this->send($order, 'order.updated');
    }

    private function send(SheetOrder $order, string $event): void
    {
        if (! filled($order->merchant)) {
            return;
        }

        app(MerchantWebhookService::class)->send((string) $order->merchant, $event, [
            'id' => $order->id,
            'order_no' => $order->order_no,
            'status' => $order->status,
            'updated_at' => $order->updated_at?->toIso8601String(),
        ]);
    }
}
