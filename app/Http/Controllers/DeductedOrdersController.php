<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\SheetOrder;
use App\Support\CountryAccess;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class DeductedOrdersController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user()?->loadMissing('country');
        $selectedMerchant = trim((string) $request->string('merchant'));
        $search = trim((string) $request->string('search'));

        $baseQuery = CountryAccess::scopeByCountryName(
            SheetOrder::query(),
            $user
        )->whereNotNull('inventory_deducted_at');

        if ($selectedMerchant !== '') {
            $baseQuery->where('merchant', $selectedMerchant);
        }

        if ($search !== '') {
            $like = "%{$search}%";
            $baseQuery->where(function ($q) use ($like) {
                $q->where('order_no', 'like', $like)
                    ->orWhere('client_name', 'like', $like)
                    ->orWhere('product_name', 'like', $like)
                    ->orWhere('code', 'like', $like);
            });
        }

        $merchantOptions = (clone $baseQuery)
            ->select('merchant')
            ->distinct()
            ->orderBy('merchant')
            ->pluck('merchant')
            ->values();

        $summaryQuery = clone $baseQuery;

        $totalOrders = (clone $summaryQuery)->count();
        $totalQuantity = (clone $summaryQuery)->sum('quantity');
        $productsAffected = (clone $summaryQuery)
            ->whereNotNull('inventory_product_id')
            ->distinct('inventory_product_id')
            ->count('inventory_product_id');
        $totalRevenue = (clone $summaryQuery)->sum('amount');

        $orders = (clone $baseQuery)
            ->orderByDesc('inventory_deducted_at')
            ->paginate(50)
            ->withQueryString()
            ->through(function (SheetOrder $order) {
                $product = $order->inventory_product_id
                    ? Product::with('category')->find($order->inventory_product_id)
                    : null;

                return [
                    'id' => $order->id,
                    'order_no' => $order->order_no,
                    'client_name' => $order->client_name,
                    'product_name' => $order->product_name,
                    'code' => $order->code,
                    'quantity' => (int) $order->quantity,
                    'amount' => (float) ($order->amount ?? 0),
                    'status' => $order->status,
                    'merchant' => $order->merchant,
                    'delivery_date' => $order->delivery_date?->format('Y-m-d'),
                    'inventory_deducted_at' => $order->inventory_deducted_at?->format('Y-m-d H:i'),
                    'inventory_deducted_by' => $order->inventory_deducted_by,
                    'inventory_product_id' => $order->inventory_product_id,
                    'linked_product' => $product ? [
                        'id' => $product->id,
                        'name' => $product->name,
                        'code' => $product->code,
                        'quantity' => (int) $product->quantity,
                        'merchant' => $product->merchant,
                        'category' => $product->category?->name,
                    ] : null,
                ];
            });

        return Inertia::render('deducted-orders/index', [
            'merchantOptions' => $merchantOptions,
            'selectedMerchant' => $selectedMerchant ?: null,
            'search' => $search ?: null,
            'summary' => [
                'totalOrders' => $totalOrders,
                'totalQuantity' => $totalQuantity,
                'productsAffected' => $productsAffected,
                'totalRevenue' => $totalRevenue,
            ],
            'orders' => $orders,
        ]);
    }
}
