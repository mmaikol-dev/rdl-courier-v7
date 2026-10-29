<?php

namespace App\Observers;

use App\Models\Product;
use App\Services\MerchantWebhookService;
use Illuminate\Contracts\Events\ShouldHandleEventsAfterCommit;

class ProductObserver implements ShouldHandleEventsAfterCommit
{
    public function created(Product $product): void
    {
        $this->send($product, 'product.created');
    }

    public function updated(Product $product): void
    {
        $this->send($product, 'product.updated');
    }

    private function send(Product $product, string $event): void
    {
        $merchant = $product->merchant ?: $product->user?->name;
        if (! filled($merchant)) {
            return;
        }

        app(MerchantWebhookService::class)->send((string) $merchant, $event, [
            'id' => $product->id,
            'sku' => $product->code,
            'name' => $product->name,
            'quantity' => $product->quantity,
            'updated_at' => $product->updated_at?->toIso8601String(),
        ]);
    }
}
