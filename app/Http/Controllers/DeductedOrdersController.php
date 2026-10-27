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
        $role = strtolower(trim((string) ($user?->roles ?? '')));
        $isGod = $role === 'g.o.d';
        $isMerchant = $role === 'merchant';
        $selectedMerchant = $isMerchant ? trim((string) ($user?->name ?? '')) : trim((string) $request->string('merchant'));
        $search = trim((string) $request->string('search'));

        $baseQuery = SheetOrder::query()->whereNotNull('inventory_deducted_at');

        if (! $isGod) {
            $countryName = CountryAccess::normalizeCountryName(CountryAccess::userCountryName($user));
            if ($countryName === null) {
                $baseQuery->whereRaw('1 = 0');
            } else {
                $baseQuery->whereRaw('LOWER(TRIM(country)) = ?', [$countryName]);
            }
        }

        if ($isMerchant) {
            if ($selectedMerchant === '') {
                $baseQuery->whereRaw('1 = 0');
            } else {
                $baseQuery->whereRaw('LOWER(TRIM(merchant)) = ?', [mb_strtolower($selectedMerchant)]);
            }
        }

        if (! $isMerchant && $selectedMerchant !== '') {
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

        $merchantOptions = $isMerchant
            ? collect($selectedMerchant !== '' ? [$selectedMerchant] : [])
            : (clone $baseQuery)
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
            ->withQueryString();

        $productIds = $orders->getCollection()
            ->pluck('inventory_product_id')
            ->filter()
            ->unique()
            ->values();
        $productsQuery = Product::with('category')->whereIn('id', $productIds);
        if (! $isGod) {
            $countryName = CountryAccess::normalizeCountryName(CountryAccess::userCountryName($user));
            if ($countryName === null) {
                $productsQuery->whereRaw('1 = 0');
            } else {
                $productsQuery->whereRaw('LOWER(TRIM(products.country)) = ?', [$countryName]);
            }
        }
        if ($isMerchant && $selectedMerchant !== '') {
            $productsQuery->whereRaw('LOWER(TRIM(products.merchant)) = ?', [mb_strtolower($selectedMerchant)]);
        }
        $linkedProducts = $productsQuery->get()->keyBy('id');

        $orders->through(function (SheetOrder $order) use ($linkedProducts) {
            $product = $linkedProducts->get($order->inventory_product_id);

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
            'isMerchant' => $isMerchant,
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
