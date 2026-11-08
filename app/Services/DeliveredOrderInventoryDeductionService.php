<?php

namespace App\Services;

use App\Models\Deduction;
use App\Models\InventoryLog;
use App\Models\Product;
use App\Models\SheetOrder;
use App\Models\Whatsapp;
use App\Services\OpenwaService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

class DeliveredOrderInventoryDeductionService
{
    public function __construct(private readonly OpenwaService $openwa) {}

    /**
     * Deduct every delivered order from warehouse product stock and, when
     * assigned to an agent, also from that agent's transferred balance. The
     * order lock and marker make retries safe.
     */
    public function deduct(SheetOrder|int $order): bool
    {
        $orderId = $order instanceof SheetOrder ? (int) $order->getKey() : $order;

        $deduction = DB::transaction(function () use ($orderId): array|false {
            $order = SheetOrder::query()->lockForUpdate()->findOrFail($orderId);

            if (mb_strtolower(trim((string) $order->status)) !== 'delivered'
                || $order->inventory_deducted_at
                || ! $order->inventory_product_id) {
                return false;
            }

            $quantity = (int) $order->quantity;
            if ($quantity < 1) {
                throw ValidationException::withMessages([
                    'inventory' => "Delivered order {$order->order_no} has no valid quantity to deduct.",
                ]);
            }

            $product = Product::query()
                ->lockForUpdate()
                ->find($order->inventory_product_id);

            if (! $product) {
                throw ValidationException::withMessages([
                    'inventory' => "Delivered order {$order->order_no} is matched to a product that no longer exists.",
                ]);
            }

            if (filled($order->merchant) && filled($product->merchant)
                && mb_strtolower(trim((string) $order->merchant)) !== mb_strtolower(trim((string) $product->merchant))) {
                throw ValidationException::withMessages([
                    'inventory' => "The matched product for order {$order->order_no} belongs to a different merchant.",
                ]);
            }

            $country = trim((string) ($order->country ?: $product->country));
            if ($country === '') {
                $country = 'Kenya';
            }
            if (filled($order->country) && filled($product->country)
                && mb_strtolower(trim((string) $order->country)) !== mb_strtolower(trim((string) $product->country))) {
                throw ValidationException::withMessages([
                    'inventory' => "The matched product for order {$order->order_no} belongs to a different country.",
                ]);
            }

            $agentStock = null;
            if ($order->agent_id) {
                $transfers = DB::table('transfers')
                    ->where('product_id', $product->id)
                    ->where('agent_id', $order->agent_id)
                    ->when($country !== '', fn ($query) => $query->whereRaw('LOWER(TRIM(country)) = ?', [mb_strtolower($country)]))
                    ->sum('quantity');

                $deductionsQuery = Deduction::query()
                    ->where('product_id', $product->id)
                    ->where('agent_id', $order->agent_id);
                if ($country !== '') {
                    $deductionsQuery->whereRaw('LOWER(TRIM(country)) = ?', [mb_strtolower($country)]);
                }
                $deducted = $deductionsQuery->sum('quantity');
                $remaining = (int) $transfers - (int) $deducted;
                $agentStock = [
                    'name' => $order->agent ?: 'Agent #' . $order->agent_id,
                    'transferred' => (int) $transfers,
                    'deducted_before' => (int) $deducted,
                    'remaining_before' => $remaining,
                    'remaining_after' => $remaining - $quantity,
                ];

                Deduction::create([
                    'code' => 'AUTO-ORDER-' . $order->id,
                    'product_id' => $product->id,
                    'agent_id' => $order->agent_id,
                    'quantity' => $quantity,
                    'reason' => 'Delivered order ' . ($order->order_no ?: '#' . $order->id),
                    'deducted_by' => 'system',
                    'country' => $country !== '' ? $country : null,
                ]);
            }

            $available = (int) $product->quantity;
            $remaining = $available - $quantity;
            $product->update(['quantity' => $remaining]);

            InventoryLog::create([
                'product_name' => $product->name,
                'product_code' => $product->code,
                'quantity_added' => -$quantity,
                'remaining_qnty' => $remaining,
                'added_by' => 'system',
                'product_unit_id' => $product->unit_id,
                'date_added' => now(),
            ]);

            SheetOrder::withoutEditTracking(function () use ($order, $product): void {
                $deductionTracking = [
                    'inventory_product_id' => $product->id,
                    'inventory_deducted_at' => now(),
                    'inventory_deducted_by' => null,
                ];
                if (Schema::hasColumn('sheet_orders', 'inventory_deduction_actor')) {
                    $deductionTracking['inventory_deduction_actor'] = 'system';
                }

                $order->forceFill($deductionTracking)->save();
            });

            return [
                'order_no' => $order->order_no ?: (string) $order->id,
                'merchant' => $order->merchant ?: $product->merchant ?: 'N/A',
                'country' => $country,
                'product_name' => $product->name,
                'product_code' => $product->code,
                'quantity' => $quantity,
                'warehouse_before' => $available,
                'warehouse_after' => $remaining,
                'agent_stock' => $agentStock,
            ];
        });

        if ($deduction === false) {
            return false;
        }

        DB::afterCommit(fn () => $this->sendWhatsAppNotification($deduction));

        return true;
    }

    /** Send and persist the same country-group WhatsApp notification as manual deductions. */
    private function sendWhatsAppNotification(array $deduction): void
    {
        $message = "*INVENTORY DEDUCTION NOTIFICATION* 📦\n\n";
        $message .= "*Merchant:* {$deduction['merchant']}\n";
        $message .= "*Country:* {$deduction['country']}\n";
        $message .= "*Date:* " . now()->format('d M Y, H:i') . "\n";
        $message .= "*Deducted By:* system\n\n";
        $message .= "*Order:* {$deduction['order_no']}\n\n";
        $message .= "*Deducted Products:*\n";
        $message .= "1. *{$deduction['product_name']}*\n";
        $message .= "   📦 Code: {$deduction['product_code']}\n";
        $message .= "   📊 Previous Warehouse Stock: {$deduction['warehouse_before']} units\n";
        $message .= "   📉 Deducted: {$deduction['quantity']} units\n";
        $message .= "   📊 Remaining Warehouse Stock: {$deduction['warehouse_after']} units\n";
        $message .= "   📋 Orders Processed: 1\n";

        if ($deduction['agent_stock']) {
            $agent = $deduction['agent_stock'];
            $message .= "\n*Agent Stock:*\n";
            $message .= "👤 Agent: {$agent['name']}\n";
            $message .= "📦 Total Transferred: {$agent['transferred']} units\n";
            $message .= "📉 Previously Deducted: {$agent['deducted_before']} units\n";
            $message .= "📊 Agent Balance Before: {$agent['remaining_before']} units\n";
            $message .= "📉 Deducted: {$deduction['quantity']} units\n";
            $message .= "📊 Agent Balance After: {$agent['remaining_after']} units\n";
        }

        $message .= "\n*Summary:*\n";
        $message .= "• Total Orders: 1\n";
        $message .= "• Products Affected: 1\n";
        $message .= "• Total Quantity Deducted: {$deduction['quantity']} units\n\n";
        $message .= "_Automated notification from Inventory System_";

        try {
            $result = $this->openwa->sendToGroup($deduction['country'], $message);

            Whatsapp::create([
                'to' => $result['to'],
                'client_name' => 'Inventory Deduction',
                'store_name' => $deduction['country'],
                'cc_agents' => null,
                'message' => $message,
                'status' => 'sent',
                'sid' => $result['message_id'],
            ]);

            Log::info('Automatic inventory deduction WhatsApp notification sent.', [
                'order_no' => $deduction['order_no'],
                'country' => $deduction['country'],
                'message_id' => $result['message_id'],
            ]);
        } catch (\Throwable $exception) {
            Log::error('Failed to send automatic inventory deduction WhatsApp notification.', [
                'order_no' => $deduction['order_no'],
                'country' => $deduction['country'],
                'error' => $exception->getMessage(),
            ]);
        }
    }
}
