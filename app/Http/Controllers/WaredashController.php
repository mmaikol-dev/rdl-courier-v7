<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\Barcode;
use App\Models\SheetOrder;
use App\Models\Transfer;
use App\Support\CountryAccess;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class WaredashController extends Controller
{
    public function index()
    {
        $user = Auth::user();
        $isMerchant = strtolower(trim($user->roles ?? '')) === 'merchant';

        // Country-scoped product IDs (used to scope barcode & sheet-order queries)
        $scopedProductIds = CountryAccess::scopeProducts(Product::query(), $user)
            ->when($isMerchant, fn ($q) => $q->where('merchant', $user->name))
            ->pluck('id');

        // Basic dashboard counts
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

        // Barcode count
        $totalBarcodes = Barcode::whereIn('product_id', $scopedProductIds)->count();

        // Depleted products (0 stock)
        $depletedProducts = CountryAccess::scopeProducts(Product::where('quantity', '<=', 0), $user)
            ->when($isMerchant, fn ($q) => $q->where('merchant', $user->name))
            ->get();

        // Near depleted products (greater than 0 but at or below alert level)
        $nearDepletedProducts = CountryAccess::scopeProducts(
            Product::where('quantity', '>', 0)->whereColumn('quantity', '<=', 'quantity_alert'),
            $user
        )
            ->when($isMerchant, fn ($q) => $q->where('merchant', $user->name))
            ->get();

        // Transfers grouped by region
        $transfersByRegion = CountryAccess::scopeByCountryName(
            Transfer::select('region', DB::raw('SUM(quantity) as total'))->groupBy('region'),
            $user
        )
            ->when($isMerchant, fn ($q) => $q->where('merchant', $user->name))
            ->get();

        // Last 10 scans
        $recentScans = Barcode::whereIn('product_id', $scopedProductIds)
            ->latest()
            ->take(10)
            ->get();

        // Products for stock status table
        $products = CountryAccess::scopeProducts(Product::query(), $user)
            ->when($isMerchant, fn ($q) => $q->where('merchant', $user->name))
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

        $products = $products->map(fn ($p) => [
            'name'          => $p->name,
            'current'       => (int) $p->quantity,
            'inDelivery'    => (int) ($inDeliveryQty[$p->id] ?? 0),
            'available'     => (int) max($p->quantity - ($inDeliveryQty[$p->id] ?? 0), 0),
            'totalDelivered'=> (int) ($totalDeliveredQty[$p->id] ?? 0),
        ]);

        return Inertia::render('waredash/index', [
            'userName'   => $user->name ?? 'User',

            'summary' => [
                'totalProducts' => $totalProducts,
                'totalBarcodes' => $totalBarcodes,
                'totalTransfers' => $totalTransfers,
                'totalStock' => $totalStock,
            ],

            'depletedProducts'     => $depletedProducts,
            'nearDepletedProducts' => $nearDepletedProducts,

            'transfersByRegion' => $transfersByRegion,
            'recentScans'       => $recentScans,
            'products'          => $products,
        ]);
    }
}
