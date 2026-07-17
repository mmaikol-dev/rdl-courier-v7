<?php

namespace App\Services;

use App\Models\Product;
use App\Models\Whatsapp;
use Illuminate\Support\Facades\Log;

class ProductStockAlertService
{
    public function __construct(
        private readonly OpenwaService $openwa,
    ) {}

    public function maybeSend(Product $product, int $previousQuantity, int $newQuantity, ?string $context = null): void
    {
        $alertThreshold = (int) ($product->quantity_alert ?? 0);

        if ($alertThreshold <= 0) {
            return;
        }

        if (! ($newQuantity <= $alertThreshold && $newQuantity < $previousQuantity)) {
            return;
        }

        $message = $this->buildMessage($product, $newQuantity, $alertThreshold, $context);
        $country = $product->country ?? 'Kenya';

        try {
            $result = $this->openwa->sendToGroup($country, $message);

            Whatsapp::create([
                'to' => $result['to'],
                'client_name' => 'Stock Alert',
                'store_name' => $country,
                'cc_agents' => null,
                'message' => $message,
                'status' => 'sent',
                'sid' => $result['message_id'],
            ]);

            Log::info('Low stock alert sent to group.', [
                'product_id' => $product->id,
                'country' => $country,
                'message_id' => $result['message_id'],
            ]);
        } catch (\Throwable $e) {
            Log::error('Low stock alert failed.', [
                'product_id' => $product->id,
                'country' => $country,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function buildMessage(Product $product, int $newQuantity, int $alertThreshold, ?string $context): string
    {
        $merchant = $product->merchant ?: $product->store_name ?: 'Unknown';
        $contextLine = $context ? "Context: {$context}\n" : '';

        return <<<MESSAGE
⚠️ LOW STOCK ALERT ⚠️

📦 Product: {$product->name}
🏷️ Code: {$product->code}
🧾 Merchant: {$merchant}
📉 Stock: {$newQuantity}
🚨 Alert Level: {$alertThreshold}
{$contextLine}
Please restock as soon as possible.
MESSAGE;
    }
}