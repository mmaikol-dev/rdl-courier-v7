<?php

namespace App\Http\Controllers;

use App\Models\SheetOrder;
use App\Models\User;
use App\Support\CountryAccess;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ClearanceController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user()?->loadMissing('country');

        $query = CountryAccess::scopeByCountryName(SheetOrder::query(), $user)
            ->whereNotNull('agent')
            ->where('agent', '!=', '')
            ->where('agent', '!=', 'Remitted');

        if ($request->filled('agent')) {
            $query->where('agent', $request->input('agent'));
        }

        if ($request->filled('from_date')) {
            $query->whereDate('delivery_date', '>=', $request->input('from_date'));
        }

        if ($request->filled('to_date')) {
            $query->whereDate('delivery_date', '<=', $request->input('to_date'));
        }

        $orders = $query->orderByDesc('delivery_date')
            ->paginate(100)
            ->withQueryString();

        $orders->through(function (SheetOrder $order) {
            $rawDeliveryDate = $order->getRawOriginal('delivery_date');

            return [
                'id' => $order->id,
                'order_no' => $order->order_no,
                'client_name' => $order->client_name,
                'product_name' => $order->product_name,
                'address' => $order->address,
                'phone' => $order->phone,
                'amount' => $order->amount,
                'quantity' => $order->quantity,
                'status' => $order->status,
                'delivery_date' => $rawDeliveryDate ? substr((string) $rawDeliveryDate, 0, 10) : '',
                'merchant' => $order->merchant,
                'code' => $order->code,
                'agent' => $order->agent,
                'updated_at' => $order->updated_at,
            ];
        });

        $agents = User::query()
            ->where('roles', 'agent')
            ->orderBy('name')
            ->select('id', 'name')
            ->get();

        return Inertia::render('clearance/index', [
            'orders' => $orders,
            'agents' => $agents,
            'filters' => $request->only([
                'agent',
                'from_date',
                'to_date',
            ]),
        ]);
    }
}
