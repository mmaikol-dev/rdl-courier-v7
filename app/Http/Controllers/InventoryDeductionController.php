<?php

namespace App\Http\Controllers;

use App\Models\InventoryLog;
use App\Models\Product;
use App\Models\SheetOrder;
use App\Models\Whatsapp;
use App\Services\OpenwaService;
use App\Support\CountryAccess;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use Inertia\Response;

class InventoryDeductionController extends Controller
{
    public function __construct(
        private readonly OpenwaService $openwa,
    ) {}

    private function deliveredOrdersQuery(Request $request)
    {
        return CountryAccess::scopeByCountryName(
            SheetOrder::query(),
            $request->user()?->loadMissing('country')
        )
            ->whereNotNull('merchant')
            ->where('merchant', '!=', '')
            ->where(function ($query): void {
                $query->whereNotNull('delivered_at')
                    ->orWhere('status', 'Delivered')
                    ->orWhereRaw('LOWER(status) = ?', ['delivered']);
            })
            ->whereNull('inventory_deducted_at');
    }

    public function index(Request $request): Response
    {
        $user = $request->user()?->loadMissing('country');
        $selectedMerchant = trim((string) $request->string('merchant'));

        $merchantOptions = (clone $this->deliveredOrdersQuery($request))
            ->select('merchant')
            ->distinct()
            ->orderBy('merchant')
            ->pluck('merchant')
            ->values();

        $orders = collect();
        $products = collect();

        if ($selectedMerchant !== '') {
            $orders = (clone $this->deliveredOrdersQuery($request))
                ->where('merchant', $selectedMerchant)
                ->orderByDesc('delivery_date')
                ->limit(300)
                ->get([
                    'id',
                    'order_no',
                    'client_name',
                    'product_name',
                    'code',
                    'quantity',
                    'amount',
                    'status',
                    'merchant',
                    'delivery_date',
                    'inventory_product_id',
                ])
                ->map(function (SheetOrder $order) use ($selectedMerchant) {
                    return [
                        'id' => $order->id,
                        'order_no' => $order->order_no,
                        'client_name' => $order->client_name,
                        'product_name' => $order->product_name,
                        'code' => $order->code,
                        'quantity' => (int) $order->quantity,
                        'amount' => (float) ($order->amount ?? 0),
                        'status' => $order->status,
                        'merchant' => $selectedMerchant,
                        'delivery_date' => $order->delivery_date,
                        'inventory_product_id' => $order->inventory_product_id,
                    ];
                })
                ->values();

            $products = CountryAccess::scopeProducts(
                Product::query(),
                $user
            )
                ->where('merchant', $selectedMerchant)
                ->orderBy('name')
                ->get([
                    'id',
                    'name',
                    'code',
                    'quantity',
                    'merchant',
                    'country',
                ])
                ->map(fn (Product $product) => [
                    'id' => $product->id,
                    'name' => $product->name,
                    'code' => $product->code,
                    'quantity' => (int) $product->quantity,
                    'merchant' => $product->merchant,
                    'country' => $product->country,
                ])
                ->values();
        }

        return Inertia::render('inventory-deductions/index', [
            'merchantOptions' => $merchantOptions,
            'selectedMerchant' => $selectedMerchant !== '' ? $selectedMerchant : null,
            'orders' => $orders,
            'products' => $products,
        ]);
    }

    /**
     * Create the WhatsApp notification message for inventory deduction.
     */
    private function createDeductionMessage(array $deductionSummary, string $merchant, string $country): string
    {
        $message = "*INVENTORY DEDUCTION NOTIFICATION* 📦\n\n";
        $message .= "*Merchant:* {$merchant}\n";
        $message .= "*Country:* {$country}\n";
        $message .= "*Date:* " . now()->format('d M Y, H:i') . "\n";
        $message .= "*Deducted By:* {$deductionSummary['deducted_by']}\n\n";
        
        $message .= "*Deducted Products:*\n";
        foreach ($deductionSummary['products'] as $index => $product) {
            $num = $index + 1;
            $message .= "{$num}. *{$product['name']}*\n";
            $message .= "   📦 Code: {$product['code']}\n";
            $message .= "   📊 Previous Stock: {$product['previous_quantity']} units\n";
            $message .= "   📉 Deducted: {$product['deducted_quantity']} units\n";
            $message .= "   📊 Remaining: {$product['remaining_quantity']} units\n";
            $message .= "   📋 Orders Processed: {$product['orders_count']}\n\n";
        }
        
        $message .= "*Summary:*\n";
        $message .= "• Total Orders: {$deductionSummary['total_orders']}\n";
        $message .= "• Products Affected: {$deductionSummary['total_products']}\n";
        $message .= "• Total Quantity Deducted: {$deductionSummary['total_quantity']} units\n\n";
        $message .= "_Automated notification from Inventory System_";
        
        return $message;
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'merchant' => ['required', 'string', 'max:255'],
            'deductions' => ['required', 'array', 'min:1'],
            'deductions.*.order_id' => ['required', 'integer'],
            'deductions.*.product_id' => ['required', 'integer'],
        ]);

        $user = $request->user()?->loadMissing('country');
        $merchant = $validated['merchant'];
        $deductions = collect($validated['deductions'])
            ->unique('order_id')
            ->values();

        $deductionSummary = [
            'total_orders' => $deductions->count(),
            'total_products' => 0,
            'total_quantity' => 0,
            'products' => [],
            'deducted_by' => $user?->name ?? 'System',
        ];
        
        $countriesInvolved = [];

        try {
            DB::transaction(function () use ($deductions, $merchant, $user, &$deductionSummary, &$countriesInvolved): void {
                $productTotals = [];

                foreach ($deductions as $item) {
                    $order = CountryAccess::scopeByCountryName(SheetOrder::query()->lockForUpdate(), $user)
                        ->where('id', $item['order_id'])
                        ->where('merchant', $merchant)
                        ->whereNull('inventory_deducted_at')
                        ->where(function ($query): void {
                            $query->whereNotNull('delivered_at')
                                ->orWhere('status', 'Delivered')
                                ->orWhereRaw('LOWER(status) = ?', ['delivered']);
                        })
                        ->firstOrFail();

                    $quantityToDeduct = max(0, (int) $order->quantity);

                    if ($quantityToDeduct <= 0) {
                        throw new \RuntimeException("Order {$order->order_no} has no deductible quantity.");
                    }

                    $productId = (int) $item['product_id'];

                    if (! isset($productTotals[$productId])) {
                        $product = CountryAccess::scopeProducts(Product::query()->lockForUpdate(), $user)
                            ->where('id', $productId)
                            ->where('merchant', $merchant)
                            ->firstOrFail();
                        
                        // Get country from product or user
                        $productCountry = $product->country ?? $user->country->name ?? 'Kenya';
                        if (!in_array($productCountry, $countriesInvolved)) {
                            $countriesInvolved[] = $productCountry;
                        }

                        $productTotals[$productId] = [
                            'product' => $product,
                            'total_quantity' => 0,
                            'orders' => [],
                        ];
                    }

                    $productTotals[$productId]['total_quantity'] += $quantityToDeduct;
                    $productTotals[$productId]['orders'][] = $order;
                }

                $deductionSummary['total_products'] = count($productTotals);

                foreach ($productTotals as $entry) {
                    /** @var Product $product */
                    $product = $entry['product'];
                    $totalQuantityToDeduct = (int) $entry['total_quantity'];
                    
                    $deductionSummary['total_quantity'] += $totalQuantityToDeduct;

                    if ((int) $product->quantity < $totalQuantityToDeduct) {
                        throw new \RuntimeException("Insufficient stock for {$product->name}. Tried to deduct {$totalQuantityToDeduct}.");
                    }

                    $previousQuantity = (int) $product->quantity;
                    $newQuantity = $previousQuantity - $totalQuantityToDeduct;

                    $product->update([
                        'quantity' => $newQuantity,
                    ]);

                    $deductionSummary['products'][] = [
                        'name' => $product->name,
                        'code' => $product->code,
                        'previous_quantity' => $previousQuantity,
                        'deducted_quantity' => $totalQuantityToDeduct,
                        'remaining_quantity' => $newQuantity,
                        'orders_count' => count($entry['orders']),
                    ];

                    InventoryLog::create([
                        'product_name' => $product->name,
                        'product_code' => $product->code,
                        'quantity_added' => -1 * $totalQuantityToDeduct,
                        'remaining_qnty' => $newQuantity,
                        'added_by' => $user?->name ?? 'System',
                        'product_unit_id' => $product->unit_id,
                        'date_added' => now(),
                    ]);

                    foreach ($entry['orders'] as $order) {
                        $order->forceFill([
                            'inventory_deducted_at' => now(),
                            'inventory_deducted_by' => $user?->id,
                            'inventory_product_id' => $product->id,
                        ])->save();
                    }
                }
            });

            // Send WhatsApp notification to the country group
            Log::info('Starting deduction notifications for countries: ' . implode(', ', $countriesInvolved));

            foreach ($countriesInvolved as $country) {
                $deductionSummary['country'] = $country;

                try {
                    $message = $this->createDeductionMessage($deductionSummary, $merchant, $country);
                    $result = $this->openwa->sendToGroup($country, $message);

                    Whatsapp::create([
                        'to' => $result['to'],
                        'client_name' => 'Inventory Deduction',
                        'store_name' => $country,
                        'cc_agents' => null,
                        'message' => $message,
                        'status' => 'sent',
                        'sid' => $result['message_id'],
                    ]);

                    Log::info('Deduction notification sent to group.', [
                        'country' => $country,
                        'message_id' => $result['message_id'],
                    ]);
                } catch (\Throwable $e) {
                    Log::error('Failed to send deduction notification to group.', [
                        'country' => $country,
                        'error' => $e->getMessage(),
                    ]);
                }
            }

        } catch (\Throwable $exception) {
            Log::error('Inventory deduction failed', [
                'error' => $exception->getMessage(),
                'user_id' => $user?->id,
                'merchant' => $merchant
            ]);
            
            return back()->withErrors([
                'deductions' => $exception->getMessage(),
            ]);
        }

        return back()->with('success', $deductions->count() . ' order(s) deducted successfully.');
    }
}