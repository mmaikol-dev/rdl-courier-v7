<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\Barcode;
use App\Models\Transfer;
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
        $merchantProductIds = $isMerchant ? Product::where('merchant', $user->name)->pluck('id') : collect();

        // Basic dashboard counts
        $totalProductsQuery = Product::query();
        $totalTransfersQuery = Transfer::query();
        $totalStockQuery = Product::query();

        if ($isMerchant) {
            $totalProductsQuery->where('merchant', $user->name);
            $totalTransfersQuery->where('merchant', $user->name);
            $totalStockQuery->where('merchant', $user->name);
        }

        $totalProducts = $totalProductsQuery->count();
        $totalTransfers = $totalTransfersQuery->count();
        $totalStock = $totalStockQuery->sum('quantity');

        // Barcode count — scope via product for merchants
        $totalBarcodesQuery = Barcode::query();
        if ($isMerchant) {
            $totalBarcodesQuery->whereIn('product_id', $merchantProductIds);
        }
        $totalBarcodes = $totalBarcodesQuery->count();

        // Depleted products (0 stock)
        $depletedProductsQuery = Product::where('quantity', '<=', 0);
        if ($isMerchant) {
            $depletedProductsQuery->where('merchant', $user->name);
        }
        $depletedProducts = $depletedProductsQuery->get();

        // Near depleted products (greater than 0 but at or below alert level)
        $nearDepletedProductsQuery = Product::where('quantity', '>', 0)
            ->whereColumn('quantity', '<=', 'quantity_alert');
        if ($isMerchant) {
            $nearDepletedProductsQuery->where('merchant', $user->name);
        }
        $nearDepletedProducts = $nearDepletedProductsQuery->get();

        // Transfers grouped by region
        $transfersByRegionQuery = Transfer::select('region', DB::raw('SUM(quantity) as total'))
            ->groupBy('region');
        if ($isMerchant) {
            $transfersByRegionQuery->where('merchant', $user->name);
        }
        $transfersByRegion = $transfersByRegionQuery->get();

        // Scans grouped by operation
        $scansByOperationQuery = Barcode::select('operation_type', DB::raw('COUNT(*) as total'))
            ->groupBy('operation_type');
        if ($isMerchant) {
            $scansByOperationQuery->whereIn('product_id', $merchantProductIds);
        }
        $scansByOperation = $scansByOperationQuery->get();

        // Last 10 scans
        $recentScansQuery = Barcode::latest();
        if ($isMerchant) {
            $recentScansQuery->whereIn('product_id', $merchantProductIds);
        }
        $recentScans = $recentScansQuery->take(10)->get();

        return Inertia::render('waredash/index', [
            'userName'   => $user->name ?? 'User',

            'summary' => [
                'totalProducts' => $totalProducts,
                'totalBarcodes' => $totalBarcodes,
                'totalTransfers' => $totalTransfers,
                'totalStock' => $totalStock,
            ],

            // NEW DATA
            'depletedProducts'     => $depletedProducts,
            'nearDepletedProducts' => $nearDepletedProducts,

            'transfersByRegion' => $transfersByRegion,
            'scansByOperation'  => $scansByOperation,
            'recentScans'       => $recentScans,
        ]);
    }
}
