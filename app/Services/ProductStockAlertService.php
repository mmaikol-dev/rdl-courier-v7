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

    public function notifyQuantityChange(
        Product $product,
        int $previousQuantity,
        int $quantityChange,
        int $newQuantity,
        ?string $updatedBy = null,
    ): void {
        $country = $product->country ?? 'Kenya';
        $direction = $quantityChange >= 0 ? 'ADDED' : 'SUBTRACTED';
        $quantity = abs($quantityChange);
        $merchant = $product->merchant ?: $product->store_name ?: 'Unknown';

        $message = "*INVENTORY STOCK UPDATE* 📦\n\n";
        $message .= "*Country:* {$country}\n";
        $message .= "*Merchant:* {$merchant}\n";
        $message .= "*Date:* " . now()->format('d M Y, H:i') . "\n";
        $message .= "*Updated By:* " . ($updatedBy ?: 'System') . "\n\n";
        $message .= "*Product:* {$product->name}\n";
        $message .= "*Code:* {$product->code}\n";
        $message .= "*Previous Stock:* {$previousQuantity} units\n";
        $message .= "*{$direction}:* {$quantity} units\n";
        $message .= "*Remaining Stock:* {$newQuantity} units\n";

        $alertThreshold = (int) ($product->quantity_alert ?? 0);
        if ($quantityChange < 0 && $alertThreshold > 0 && $newQuantity <= $alertThreshold) {
            $message .= "\n⚠️ *Low stock:* stock is at or below the alert level of {$alertThreshold} units.\n";
        }

        $message .= "\n_Automated notification from Inventory System_";

        try {
            $result = $this->openwa->sendToGroup($country, $message);

            Whatsapp::create([
                'to' => $result['to'],
                'client_name' => 'Stock Update',
                'store_name' => $country,
                'cc_agents' => null,
                'message' => $message,
                'status' => 'sent',
                'sid' => $result['message_id'],
            ]);

            Log::info('Stock update notification sent to group.', [
                'product_id' => $product->id,
                'country' => $country,
                'quantity_change' => $quantityChange,
                'message_id' => $result['message_id'],
            ]);
        } catch (\Throwable $e) {
            Log::error('Stock update notification failed.', [
                'product_id' => $product->id,
                'country' => $country,
                'quantity_change' => $quantityChange,
                'error' => $e->getMessage(),
            ]);
        }
    }

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
