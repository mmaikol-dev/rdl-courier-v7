<?php

namespace App\Http\Controllers;

use App\Models\Barcode;
use App\Models\Product;
use App\Models\SheetOrder;
use App\Models\Transfer;
use App\Support\CountryAccess;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class WaredashController extends Controller
{
    public function index()
    {
        $user = Auth::user();

        return Inertia::render('waredash/index', [
            'userName' => $user->name ?? 'User',
            'warehouseReport' => Inertia::defer(fn () => $this->buildWarehouseReport($user)),
        ]);
    }

    private function buildWarehouseReport($user): array
    {
        $isMerchant = strtolower(trim($user->roles ?? '')) === 'merchant';

        $scopedProductIds = CountryAccess::scopeProducts(Product::query(), $user)
            ->when($isMerchant, fn ($query) => $query->where('merchant', $user->name))
            ->pluck('id');

        $totalProductsQuery = CountryAccess::scopeProducts(Product::query(), $user);
        $totalTransfersQuery = CountryAccess::scopeByCountryName(Transfer::query(), $user);
        $totalStockQuery = CountryAccess::scopeProducts(Product::query(), $user);

        if ($isMerchant) {
            $totalProductsQuery->where('merchant', $user->name);
            $totalTransfersQuery->where('merchant', $user->name);
            $totalStockQuery->where('merchant', $user->name);
        }

        $totalProducts = $totalProductsQuery->count();
        $totalTransfers = $totalTransfersQuery->count();
        $totalStock = $totalStockQuery->sum('quantity');
        $totalBarcodes = Barcode::whereIn('product_id', $scopedProductIds)->count();

        $depletedProducts = CountryAccess::scopeProducts(Product::where('quantity', '<=', 0), $user)
            ->when($isMerchant, fn ($query) => $query->where('merchant', $user->name))
            ->get();

        $nearDepletedProducts = CountryAccess::scopeProducts(
            Product::where('quantity', '>', 0)->whereColumn('quantity', '<=', 'quantity_alert'),
            $user
        )
            ->when($isMerchant, fn ($query) => $query->where('merchant', $user->name))
            ->get();

        $transfersByRegion = CountryAccess::scopeByCountryName(
            Transfer::select('region', DB::raw('SUM(quantity) as total'))->groupBy('region'),
            $user
        )
            ->when($isMerchant, fn ($query) => $query->where('merchant', $user->name))
            ->get();

        $recentScans = Barcode::whereIn('product_id', $scopedProductIds)
            ->latest()
            ->take(10)
            ->get();

        $products = CountryAccess::scopeProducts(Product::query(), $user)
            ->when($isMerchant, fn ($query) => $query->where('merchant', $user->name))
            ->select('id', 'name', 'quantity')
            ->get();

        $productIds = $products->pluck('id');
        $inDeliveryQty = CountryAccess::scopeByCountryName(
            SheetOrder::whereIn('inventory_product_id', $productIds)
                ->whereIn('status', ['Scheduled', 'Dispatched'])
                ->groupBy('inventory_product_id')
                ->select('inventory_product_id', DB::raw('SUM(quantity) as total_qty')),
            $user
        )->pluck('total_qty', 'inventory_product_id');

        $totalDeliveredQty = CountryAccess::scopeByCountryName(
            SheetOrder::whereIn('inventory_product_id', $productIds)
                ->where('status', 'Delivered')
                ->groupBy('inventory_product_id')
                ->select('inventory_product_id', DB::raw('SUM(quantity) as total_qty')),
            $user
        )->pluck('total_qty', 'inventory_product_id');

        $products = $products->map(fn ($product) => [
            'name' => $product->name,
            'current' => (int) $product->quantity,
            'inDelivery' => (int) ($inDeliveryQty[$product->id] ?? 0),
            'available' => (int) max($product->quantity - ($inDeliveryQty[$product->id] ?? 0), 0),
            'totalDelivered' => (int) ($totalDeliveredQty[$product->id] ?? 0),
        ]);

        return [
            'summary' => [
                'totalProducts' => $totalProducts,
                'totalBarcodes' => $totalBarcodes,
                'totalTransfers' => $totalTransfers,
                'totalStock' => $totalStock,
            ],
            'depletedProducts' => $depletedProducts,
            'nearDepletedProducts' => $nearDepletedProducts,
            'transfersByRegion' => $transfersByRegion,
            'recentScans' => $recentScans,
            'products' => $products,
        ];
    }
}
