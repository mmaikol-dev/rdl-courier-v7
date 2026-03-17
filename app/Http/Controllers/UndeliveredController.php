<?php

namespace App\Http\Controllers;

use App\Models\SheetOrder;
use App\Support\CountryAccess;
use Illuminate\Http\Request;
use Inertia\Inertia;


class UndeliveredController extends Controller
{
    /**
     * Display a listing of the resource.
     */
public function index(Request $request)
    {
        $user = $request->user()?->loadMissing('country');

        $query = CountryAccess::scopeByCountryName(SheetOrder::query(), $user)
            ->whereNotNull('code')
            ->where('code', '!=', '')
            ->where(function ($query): void {
                $query->whereNull('status')
                    ->orWhereRaw('LOWER(status) != "delivered"');
            });

        // -------------------------
        // ✅ Merchant Filter
        // -------------------------
        if ($request->filled('merchant')) {
            $query->where('merchant', $request->merchant);
        }

        // -------------------------
        // ✅ Multi-Status Filter
        // -------------------------
        if ($request->filled('status')) {
            $statuses = is_array($request->status)
                ? $request->status
                : explode(',', $request->status);

            $query->whereIn('status', $statuses);
        }

        // -------------------------
        // ✅ Delivery Date Range Filter
        // -------------------------
        if ($request->filled('from_date')) {
            $query->whereDate('delivery_date', '>=', $request->from_date);
        }

        if ($request->filled('to_date')) {
            $query->whereDate('delivery_date', '<=', $request->to_date);
        } 

        // -------------------------
        //  Pagination
        // -------------------------
        $orders = $query->orderByDesc('updated_at')
            ->paginate(100)
            ->withQueryString();

        $orders->through(function ($order) {
            $rawDeliveryDate = $order->getRawOriginal('delivery_date');

            return [
                'id' => $order->id,
                'order_no' => $order->order_no,
                'client_name' => $order->client_name,
                'product_name' => $order->product_name,
                'address' => $order->address,
                'phone' => $order->phone,
                'status' => $order->status,
                'delivery_date' => $rawDeliveryDate ? substr((string) $rawDeliveryDate, 0, 10) : '',
                'merchant' => $order->merchant,
                'code' => $order->code,
                'updated_at' => $order->updated_at,
            ];
        });

        // -------------------------
        //  Merchant List
        // -------------------------
        $merchantUsers = CountryAccess::scopeByCountryName(SheetOrder::query(), $user)
            ->whereNotNull('merchant')
            ->distinct()
            ->pluck('merchant');

        return Inertia::render('undelivered/index', [
            'orders' => $orders,
            'merchantUsers' => $merchantUsers,
            'filters' => $request->only([
                'merchant',
                'status',
                'from_date',
                'to_date',
            ]),
        ]);
    }
    


    /**
     * Show the form for creating a new resource.
     */
    public function create()
    {
        //
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        //
    }

    /**
     * Display the specified resource.
     */
    public function show($undelivered)
    {
        //
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit( $undelivered)
    {
        //
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request,$undelivered)
    {
        //
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy( $undelivered)
    {
        //
    }
}
