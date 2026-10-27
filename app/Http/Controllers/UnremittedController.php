<?php

namespace App\Http\Controllers;

use App\Models\SheetOrder;
use App\Support\CountryAccess;
use Illuminate\Http\Request;
use Inertia\Inertia;

class UnremittedController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        $user = $request->user()?->loadMissing('country');

        $orders = Inertia::defer(function () use ($request, $user) {
            $query = CountryAccess::scopeByCountryName(SheetOrder::query(), $user)
                ->whereNotNull('code')
                ->whereRaw('LOWER(status) = "delivered"')
                ->where(function ($query) {
                    $query->whereNull('agent')
                        ->orWhere('agent', '!=', 'Remitted');
                });

            if ($request->filled('merchant')) {
                $query->where('merchant', $request->merchant);
            }

            if ($request->filled('from_date')) {
                $query->whereDate('delivery_date', '>=', $request->from_date);
            }

            if ($request->filled('to_date')) {
                $query->whereDate('delivery_date', '<=', $request->to_date);
            }

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
                    'agent' => $order->agent,
                    'updated_at' => $order->updated_at,
                ];
            });

            return $orders;
        });

        $merchantUsers = CountryAccess::scopeByCountryName(SheetOrder::query(), $user)
            ->whereNotNull('merchant')
            ->distinct()
            ->pluck('merchant');

        return Inertia::render('unremitted/index', [
            'orders' => $orders,
            'merchantUsers' => $merchantUsers,
            'filters' => $request->only(['merchant', 'from_date', 'to_date']),
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
    public function show(SheetOrder $unremitted)
    {
        //
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(SheetOrder $unremitted)
    {
        //
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, SheetOrder $unremitted)
    {
        //
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(SheetOrder $unremitted)
    {
        //
    }
}
