<?php

namespace App\Http\Controllers;

use App\Models\OrderHistory;
use App\Models\SheetOrder;
use App\Support\CountryAccess;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class OrderExpireController extends Controller
{
    private function buildQuery(Request $request, array $filters)
    {
        $user = $request->user()?->loadMissing('country');

        $from = Carbon::parse($filters['from_date'], 'Africa/Nairobi')->startOfDay();
        $to = Carbon::parse($filters['to_date'], 'Africa/Nairobi')->endOfDay();

        $query = CountryAccess::scopeByCountryName(SheetOrder::query(), $user)
            ->whereBetween('delivery_date', [$from, $to]);

        if (! empty($filters['merchant'])) {
            $query->where('merchant', $filters['merchant']);
        }

        if (! empty($filters['statuses'])) {
            $query->whereIn('status', $filters['statuses']);
        }

        return $query;
    }

    public function index(Request $request): Response
    {
        $user = $request->user()?->loadMissing('country');

        $merchants = CountryAccess::scopeByCountryName(SheetOrder::query(), $user)
            ->whereNotNull('merchant')
            ->where('merchant', '!=', '')
            ->select('merchant')
            ->distinct()
            ->orderBy('merchant')
            ->pluck('merchant')
            ->values();

        $orders = null;
        $filters = [
            'from_date' => $request->input('from_date'),
            'to_date' => $request->input('to_date'),
            'merchant' => $request->input('merchant'),
            'statuses' => $request->input('statuses'),
        ];

        if ($request->hasAny(['from_date', 'to_date', 'merchant', 'statuses'])) {
            $request->validate([
                'from_date' => ['required', 'date'],
                'to_date' => ['required', 'date', 'after_or_equal:from_date'],
                'merchant' => ['nullable', 'string', 'max:255'],
                'statuses' => ['nullable', 'array'],
                'statuses.*' => ['string', 'max:255'],
            ]);

            $query = $this->buildQuery($request, $filters);

            $orders = $query->orderBy('delivery_date')
                ->select(['id', 'order_no', 'client_name', 'product_name', 'merchant', 'status', 'delivery_date', 'amount', 'quantity'])
                ->paginate(25)
                ->withQueryString();
        }

        return Inertia::render('orders/bulk-expire', [
            'merchants' => $merchants,
            'orders' => $orders,
            'filters' => $filters,
        ]);
    }

    public function bulkExpire(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'from_date' => ['required', 'date'],
            'to_date' => ['required', 'date', 'after_or_equal:from_date'],
            'merchant' => ['nullable', 'string', 'max:255'],
            'statuses' => ['nullable', 'array', 'min:1'],
            'statuses.*' => ['required', 'string', 'max:255'],
        ]);

        $user = $request->user()?->loadMissing('country');

        $query = $this->buildQuery($request, $validated);

        $orderIds = (clone $query)->pluck('id');
        $count = $orderIds->count();

        if ($count === 0) {
            return back()->withErrors(['no_results' => 'No orders match the given filters.']);
        }

        $query->update(['status' => 'Expired', 'updated_at' => now()]);

        $history = $orderIds->map(fn (int $id) => [
            'order_id' => $id,
            'user_id' => $user?->id,
            'attribute' => 'status',
            'old_value' => 'various',
            'new_value' => 'Expired',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        OrderHistory::insert($history->all());

        return back()->with('success', "{$count} order(s) marked as Expired.");
    }
}
