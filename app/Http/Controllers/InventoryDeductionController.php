<?php

namespace App\Http\Controllers;

use App\Models\InventoryLog;
use App\Models\Product;
use App\Models\SheetOrder;
use App\Support\CountryAccess;
use App\Services\ProductStockAlertService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class InventoryDeductionController extends Controller
{
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

        try {
            DB::transaction(function () use ($deductions, $merchant, $user): void {
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

                        $productTotals[$productId] = [
                            'product' => $product,
                            'total_quantity' => 0,
                            'orders' => [],
                        ];
                    }

                    $productTotals[$productId]['total_quantity'] += $quantityToDeduct;
                    $productTotals[$productId]['orders'][] = $order;
                }

                foreach ($productTotals as $entry) {
                    /** @var Product $product */
                    $product = $entry['product'];
                    $totalQuantityToDeduct = (int) $entry['total_quantity'];

                    if ((int) $product->quantity < $totalQuantityToDeduct) {
                        throw new \RuntimeException("Insufficient stock for {$product->name}. Tried to deduct {$totalQuantityToDeduct}.");
                    }

                    $previousQuantity = (int) $product->quantity;
                    $newQuantity = $previousQuantity - $totalQuantityToDeduct;

                    $product->update([
                        'quantity' => $newQuantity,
                    ]);

                    app(ProductStockAlertService::class)->maybeSend(
                        $product,
                        $previousQuantity,
                        $newQuantity,
                        'Manual deduction queue'
                    );

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
        } catch (\Throwable $exception) {
            return back()->withErrors([
                'deductions' => $exception->getMessage(),
            ]);
        }

        return back()->with('success', $deductions->count() . ' order(s) deducted successfully.');
    }
}
