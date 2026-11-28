<?php

namespace App\Http\Controllers;

use App\Models\Deduction;
use App\Models\InventoryLog;
use App\Models\Product;
use App\Models\SheetOrder;
use App\Models\Whatsapp;
use App\Services\OpenwaService;
use App\Support\CountryAccess;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Pagination\Paginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class InventoryDeductionController extends Controller
{
    public function __construct(
        private readonly OpenwaService $openwa,
    ) {}

    private function deliveredOrdersQuery(Request $request)
    {
        $user = $request->user()?->loadMissing('country');

        return CountryAccess::scopeByCountryName(
            SheetOrder::query(),
            $user
        )
            ->when(
                strtolower(trim((string) $user?->roles)) === 'merchant',
                fn ($query) => $query->where('merchant', $user->name)
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

    private function perPage(Request $request): int
    {
        $perPage = (int) $request->integer('per_page', 25);

        return in_array($perPage, [10, 25, 50, 100], true) ? $perPage : 25;
    }

    /**
     * An empty paginator matching the shape of the populated one, so the frontend
     * can always read `orders.data` regardless of whether a merchant is selected.
     */
    private function emptyOrdersPaginator(): LengthAwarePaginator
    {
        return (new LengthAwarePaginator([], 0, 25, 1, [
            'path' => Paginator::resolveCurrentPath(),
            'pageName' => 'page',
        ]))->withQueryString();
    }

    public function index(Request $request): Response
    {
        $user = $request->user()?->loadMissing('country');
        $selectedMerchant = trim((string) $request->string('merchant'));
        $search = trim((string) $request->string('search'));

        $merchantOptions = (clone $this->deliveredOrdersQuery($request))
            ->select('merchant')
            ->distinct()
            ->orderBy('merchant')
            ->pluck('merchant')
            ->values();

        // Always a paginator, even with no merchant selected, so the React prop shape
        // never changes between the empty and populated states.
        $orders = $this->emptyOrdersPaginator();
        $products = collect();

        if ($selectedMerchant !== '') {
            $orders = (clone $this->deliveredOrdersQuery($request))
                ->where('merchant', $selectedMerchant)
                ->when($search !== '', function ($query) use ($search): void {
                    $query->where(function ($matches) use ($search): void {
                        $matches->where('order_no', 'like', '%'.$search.'%')
                            ->orWhere('client_name', 'like', '%'.$search.'%')
                            ->orWhere('product_name', 'like', '%'.$search.'%')
                            ->orWhere('city', 'like', '%'.$search.'%')
                            ->orWhere('code', 'like', '%'.$search.'%')
                            ->orWhere('status', 'like', '%'.$search.'%');
                    });
                })
                ->orderByDesc('delivery_date')
                ->orderByDesc('id')
                ->paginate($this->perPage($request), ['id', 'order_no', 'client_name', 'product_name', 'code', 'city', 'quantity', 'amount', 'status', 'merchant', 'delivery_date', 'inventory_product_id'])
                ->withQueryString()
                ->through(function (SheetOrder $order) use ($selectedMerchant) {
                    return [
                        'id' => $order->id,
                        'order_no' => $order->order_no,
                        'client_name' => $order->client_name,
                        'product_name' => $order->product_name,
                        'code' => $order->code,
                        'city' => $order->city,
                        'quantity' => (int) $order->quantity,
                        'amount' => (float) ($order->amount ?? 0),
                        'status' => $order->status,
                        'merchant' => $selectedMerchant,
                        'delivery_date' => $order->delivery_date,
                        'inventory_product_id' => $order->inventory_product_id,
                    ];
                });

            $products = CountryAccess::scopeProducts(
                Product::query(),
                $user
            )
                ->where('merchant', $selectedMerchant)
                ->when(
                    strtolower(trim((string) $user?->roles)) === 'merchant',
                    fn ($query) => $query->where('merchant', $user->name)
                )
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
            'search' => $search,
            'orders' => $orders,
            'products' => $products,
        ]);
    }

    public function assignProduct(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'merchant' => ['required', 'string', 'max:255'],
            'order_ids' => ['required', 'array', 'min:1'],
            'order_ids.*' => ['required', 'integer', 'distinct'],
            'product_id' => ['required', 'integer'],
        ]);

        $user = $request->user()?->loadMissing('country');

        DB::transaction(function () use ($request, $validated, $user): void {
            $orders = $this->deliveredOrdersQuery($request)
                ->where('merchant', $validated['merchant'])
                ->whereIn('id', $validated['order_ids'])
                ->lockForUpdate()
                ->get();

            if ($orders->count() !== count($validated['order_ids'])) {
                throw ValidationException::withMessages([
                    'order_ids' => 'One or more selected orders are unavailable or already deducted.',
                ]);
            }

            $product = CountryAccess::scopeProducts(Product::query()->lockForUpdate(), $user)
                ->where('merchant', $validated['merchant'])
                ->when(
                    strtolower(trim((string) $user?->roles)) === 'merchant',
                    fn ($query) => $query->where('merchant', $user->name)
                )
                ->find($validated['product_id']);

            if (! $product) {
                throw ValidationException::withMessages([
                    'product_id' => 'Choose a product linked to this merchant and country.',
                ]);
            }

            SheetOrder::withoutEditTracking(function () use ($orders, $product): void {
                foreach ($orders as $order) {
                    $order->forceFill(['inventory_product_id' => $product->id])->saveQuietly();
                }
            });
        });

        return back()->with('success', count($validated['order_ids']).' order(s) assigned to the selected product. Stock has not been deducted; click Deduct Selected to deduct it.');
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

        $skipped = [];
        $processedCount = 0;

        try {
            DB::transaction(function () use ($deductions, $merchant, $user, &$deductionSummary, &$countriesInvolved, &$skipped, &$processedCount): void {
                $selectedOrders = CountryAccess::scopeByCountryName(SheetOrder::query()->lockForUpdate(), $user)
                    ->whereIn('id', $deductions->pluck('order_id')->all())
                    ->where('merchant', $merchant)
                    ->get()
                    ->keyBy('id');

                $orders = $selectedOrders->filter(function (SheetOrder $order): bool {
                    return $order->inventory_deducted_at === null
                        && ($order->delivered_at !== null || strcasecmp(trim((string) $order->status), 'delivered') === 0);
                });

                $productTotals = [];

                foreach ($deductions as $item) {
                    $selectedOrder = $selectedOrders->get($item['order_id']);

                    if (! $selectedOrder) {
                        $skipped[] = [
                            'reason' => 'unavailable',
                            'message' => "Order #{$item['order_id']} is no longer available for deduction.",
                        ];
                        continue;
                    }

                    if ($selectedOrder->inventory_deducted_at !== null) {
                        $skipped[] = [
                            'reason' => 'already_deducted',
                            'message' => "Order {$selectedOrder->order_no} already had stock deducted.",
                        ];
                        continue;
                    }

                    $order = $orders->get($item['order_id']);

                    if (! $order) {
                        $skipped[] = [
                            'reason' => 'not_delivered',
                            'message' => "Order {$selectedOrder->order_no} is not delivered.",
                        ];
                        continue;
                    }

                    $quantityToDeduct = max(0, (int) $order->quantity);

                    if ($quantityToDeduct <= 0) {
                        $skipped[] = [
                            'reason' => 'no_quantity',
                            'message' => "Order {$order->order_no} has no deductible quantity.",
                        ];
                        continue;
                    }

                    $productId = (int) $item['product_id'];

                    if (! isset($productTotals[$productId])) {
                        $product = CountryAccess::scopeProducts(Product::query()->lockForUpdate(), $user)
                            ->where('id', $productId)
                            ->where('merchant', $merchant)
                            ->first();

                        if (! $product) {
                            $skipped[] = [
                                'reason' => 'invalid_product',
                                'message' => "Product #{$productId} is not available for this merchant.",
                            ];
                            continue;
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

                foreach ($productTotals as $productId => $entry) {
                    /** @var Product $product */
                    $product = $entry['product'];
                    $totalQuantityToDeduct = (int) $entry['total_quantity'];

                    if ((int) $product->quantity < $totalQuantityToDeduct) {
                        $skipped[] = [
                            'reason' => 'insufficient_stock',
                            'message' => "Insufficient stock for {$product->name}. Tried to deduct {$totalQuantityToDeduct}.",
                        ];
                        unset($productTotals[$productId]);
                        continue;
                    }

                    $productCountry = $product->country ?? $user?->country?->name ?? 'Kenya';
                    if (! in_array($productCountry, $countriesInvolved, true)) {
                        $countriesInvolved[] = $productCountry;
                    }

                    $previousQuantity = (int) $product->quantity;
                    $newQuantity = $previousQuantity - $totalQuantityToDeduct;

                    $product->update([
                        'quantity' => $newQuantity,
                    ]);

                    $deductionSummary['total_quantity'] += $totalQuantityToDeduct;
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
                        if ($order->agent_id) {
                            Deduction::create([
                                'code' => 'AUTO-ORDER-' . $order->id,
                                'product_id' => $product->id,
                                'agent_id' => $order->agent_id,
                                'quantity' => (int) $order->quantity,
                                'reason' => 'Delivered order ' . ($order->order_no ?: '#' . $order->id),
                                'deducted_by' => $user?->name ?? 'system',
                                'country' => $order->country ?: $productCountry,
                            ]);
                        }

                        $order->forceFill([
                            'inventory_deducted_at' => now(),
                            'inventory_deducted_by' => $user?->id,
                            'inventory_deduction_actor' => $user?->name ?? 'system',
                            'inventory_product_id' => $product->id,
                        ])->save();
                        $processedCount++;
                    }
                }

                $deductionSummary['total_orders'] = $processedCount;
                $deductionSummary['total_products'] = count($productTotals);
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

        $deductedUnits = (int) $deductionSummary['total_quantity'];
        $message = "Stock has been deducted: {$deductedUnits} unit(s) across {$processedCount} order(s).";

        $skippedCollection = collect($skipped);
        $alreadyDeductedCount = $skippedCollection->where('reason', 'already_deducted')->count();
        $otherSkipped = $skippedCollection->where('reason', '!=', 'already_deducted');

        if ($alreadyDeductedCount > 0) {
            $message .= " {$alreadyDeductedCount} selected order(s) already had stock deducted and were skipped.";
        }

        if ($otherSkipped->isNotEmpty()) {
            $preview = $otherSkipped->pluck('message')->take(3)->implode('; ');
            $message .= ' '.$otherSkipped->count().' other selected item(s) were skipped: '.$preview.($otherSkipped->count() > 3 ? ' ...' : '');
        }

        return back()->with('success', $message);
    }
}
