<?php

namespace App\Http\Controllers;

use App\Models\OrderScan;
use App\Models\SheetOrder;
use App\Support\CountryAccess;
use Illuminate\Http\Request;
use Inertia\Inertia;

class OrderScanController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user()->loadMissing('country');

        $scans = OrderScan::query()
            ->select(['order_scans.id', 'order_scans.order_no', 'order_scans.product_name', 'order_scans.quantity', 'order_scans.scan_type', 'order_scans.scanned_by', 'order_scans.scanned_at', 'order_scans.created_at'])
            ->join('sheet_orders', 'sheet_orders.id', '=', 'order_scans.order_id')
            ->latest('order_scans.scanned_at');

        $scans = CountryAccess::scopeByCountryName($scans, $user, 'sheet_orders.country');

        $search = $request->input('search');
        $dateFrom = $request->input('date_from');
        $dateTo = $request->input('date_to');

        if ($search) {
            $scans->where(function ($q) use ($search) {
                $q->where('order_scans.order_no', 'like', "%{$search}%")
                  ->orWhere('order_scans.product_name', 'like', "%{$search}%")
                  ->orWhere('order_scans.scanned_by', 'like', "%{$search}%");
            });
        }

        if ($dateFrom) {
            $scans->whereDate('order_scans.scanned_at', '>=', $dateFrom);
        }

        if ($dateTo) {
            $scans->whereDate('order_scans.scanned_at', '<=', $dateTo);
        }

        return Inertia::render('order-scans/index', [
            'scans' => $scans->paginate(50)->withQueryString(),
            'filters' => [
                'search' => $search,
                'date_from' => $dateFrom,
                'date_to' => $dateTo,
            ],
        ]);
    }

    public function store(Request $request)
    {
        $user = $request->user()->loadMissing('country');

        $validated = $request->validate([
            'order_no' => 'required|string|max:255',
            'scan_type' => 'required|in:in,out',
            'product_name' => 'nullable|string|max:255',
            'quantity' => 'nullable|integer',
            'reason' => 'nullable|string|max:1000',
        ]);

        $order = CountryAccess::scopeByCountryName(
            SheetOrder::query(),
            $user
        )->where('order_no', $validated['order_no'])->first();

        if (! $order) {
            return back()->withErrors(['order_no' => "Order not found: {$validated['order_no']}"]);
        }

        $label = $validated['scan_type'] === 'out' ? 'OUT' : 'IN';

        $existingScan = OrderScan::where('order_id', $order->id)
            ->where('scan_type', $validated['scan_type'])
            ->exists();

        if ($existingScan && ! $request->filled('reason')) {
            return back()->withErrors([
                'order_no' => "Order {$order->order_no} already scanned as {$label}. Enter a reason to re-scan.",
                'needs_reason' => $validated['scan_type'],
            ]);
        }

        $productName = $validated['product_name'] ?? $order->product_name ?? $order->item;
        $quantity = $validated['quantity'] ?? $order->quantity;

        $scan = OrderScan::create([
            'order_id' => $order->id,
            'order_no' => $order->order_no,
            'product_name' => $productName,
            'quantity' => $quantity,
            'scan_type' => $validated['scan_type'],
            'reason' => $validated['reason'],
            'scanned_by' => $user->name,
            'user_id' => $user->id,
            'scanned_at' => now(),
        ]);

        return back()->with('success', "Order {$order->order_no} scanned as {$validated['scan_type']}");
    }
}
