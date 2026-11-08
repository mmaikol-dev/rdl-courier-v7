<?php

namespace App\Observers;

use App\Models\SheetOrder;
use App\Services\DeliveredOrderInventoryDeductionService;
use App\Services\MerchantWebhookService;
use Illuminate\Contracts\Events\ShouldHandleEventsAfterCommit;
use Illuminate\Support\Facades\Log;

class SheetOrderObserver implements ShouldHandleEventsAfterCommit
{
    public function created(SheetOrder $order): void
    {
        $this->deductDeliveredOrder($order);
        $this->send($order, 'order.created');
    }

    public function updated(SheetOrder $order): void
    {
        if (($order->wasChanged('status') || $order->wasChanged('inventory_product_id'))
            && mb_strtolower(trim((string) $order->status)) === 'delivered') {
            $this->deductDeliveredOrder($order);
        }

        $this->send($order, 'order.updated');
    }

    private function deductDeliveredOrder(SheetOrder $order): void
    {
        if (mb_strtolower(trim((string) $order->status)) !== 'delivered' || $order->inventory_deducted_at) {
            return;
        }

        if (! $order->inventory_product_id) {
            Log::warning('Delivered order has no linked inventory product; automatic deduction was skipped.', [
                'order_id' => $order->id,
                'order_no' => $order->order_no,
            ]);
            return;
        }

        try {
            app(DeliveredOrderInventoryDeductionService::class)->deduct($order);
        } catch (\Throwable $exception) {
            Log::error('Automatic inventory deduction failed for delivered order.', [
                'order_id' => $order->id,
                'order_no' => $order->order_no,
                'inventory_product_id' => $order->inventory_product_id,
                'agent_id' => $order->agent_id,
                'error' => $exception->getMessage(),
            ]);
        }
    }

    private function send(SheetOrder $order, string $event): void
    {
        if (! filled($order->merchant)) {
            return;
        }

        $data = $order->only([
            'id',
            'order_no',
            'order_date',
            'amount',
            'quantity',
            'product_name',
            'delivery_date',
            'client_name',
            'address',
            'city',
            'country',
            'phone',
            'alt_no',
            'status',
            'inventory_product_id',
            'inventory_deducted_at',
            'inventory_deduction_actor',
            'code',
            'confirmed',
            'created_at',
            'updated_at',
            'edited_at',
        ]);
        $data['call_count'] = $order->histories()->where('attribute', 'instructions')->count();
        $data['updated_at'] = ($order->edited_at ?? $order->updated_at ?? $order->created_at)?->toIso8601String();

        app(MerchantWebhookService::class)->send((string) $order->merchant, $event, $data);
    }
}
