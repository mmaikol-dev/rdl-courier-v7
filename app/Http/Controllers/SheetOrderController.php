<?php

namespace App\Http\Controllers;

use App\Models\OrderHistory;
use App\Models\Sheet;
use App\Models\SheetOrder;
use App\Models\User;
use App\Services\ProductAutoMatchService;
use App\Support\CountryAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;

class SheetOrderController extends Controller
{
    public function __construct(
        private readonly ProductAutoMatchService $autoMatch = new ProductAutoMatchService,
    ) {}

    private function ensureCountryAccess(Request $request, SheetOrder $order): void
    {
        $user = $request->user()->loadMissing('country');

        if (CountryAccess::hasGlobalAccess($user)) {
            return;
        }

        abort_unless(CountryAccess::matchesCountryName($order->country, $user), 403);
    }

    public function index(Request $request)
    {
        $user = $request->user()->loadMissing('country');
        $query = CountryAccess::scopeByCountryName(SheetOrder::query(), $user);

        if ($user->roles === 'merchant') {
            $query->where('merchant', $user->name);
        }

        if ($request->filled('country')) {
            $query->whereRaw('LOWER(country) = ?', [mb_strtolower(trim((string) $request->country))]);
        }

        // Fields handled separately — excluded from the generic foreach loop
        $excludedKeys = [
            'status', 'merchant', 'cc_email', 'country',
            'product_name', 'from_date', 'to_date',
            'page', '_token', '_method',
        ];

        foreach ($request->all() as $key => $value) {
            if (
                ! empty($value) &&
                ! in_array($key, $excludedKeys) &&
                \Schema::hasColumn('sheet_orders', $key)
            ) {
                $query->where($key, 'like', "%{$value}%");
            }
        }

        if ($request->filled('product_name')) {
            $query->where('product_name', 'like', "%{$request->product_name}%");
        }

        if ($request->filled('status')) {
            $statuses = is_array($request->status) ? $request->status : explode(',', $request->status);
            $query->where(function ($q) use ($statuses) {
                if (in_array('New Orders', $statuses)) {
                    $q->orWhereNull('status')->orWhere('status', '');
                }
                $otherStatuses = array_diff($statuses, ['New Orders']);
                if (! empty($otherStatuses)) {
                    $q->orWhereIn('status', $otherStatuses);
                }
            });
        }

        if ($request->filled('merchant') && $user->roles !== 'merchant') {
            $merchants = is_array($request->merchant) ? $request->merchant : explode(',', $request->merchant);
            $query->whereIn('merchant', $merchants);
        }

        if ($request->filled('cc_email')) {
            $ccs = is_array($request->cc_email) ? $request->cc_email : explode(',', $request->cc_email);
            $query->whereIn('cc_email', $ccs);
        }

        if ($request->filled('from_date') && $request->filled('to_date')) {
            $from = Carbon::parse($request->from_date, 'Africa/Nairobi')->startOfDay();
            $to = Carbon::parse($request->to_date, 'Africa/Nairobi')->endOfDay();
            $query->whereBetween('delivery_date', [$from, $to]);
        }

        $query->orderBy('created_at', 'desc');

        $totalOrders = (clone $query)->count();

        $orders = $query->paginate(50)->appends($request->all());

        $merchantData = CountryAccess::scopeByCountryName(
            SheetOrder::select('merchant', 'sheet_id', 'sheet_name'),
            $user
        )
            ->whereNotNull('merchant')
            ->groupBy('merchant', 'sheet_id', 'sheet_name')
            ->get()
            ->groupBy('merchant')
            ->map(function ($items, $merchant) {
                return [
                    'sheet_id' => $items->first()->sheet_id,
                    'sheet_names' => $items->pluck('sheet_name')->unique()->values(),
                ];
            });

        $merchantUsers = CountryAccess::scopeByCountryName(
            Sheet::query(),
            $user
        )->distinct()->pluck('sheet_name');

        $ccUsers = CountryAccess::scopeUsers(
            User::query()->where('roles', 'callcenter1'),
            $user
        )->pluck('name');

        return inertia('sheetorders/index', [
            'orders' => $orders,
            'filters' => $request->all(),
            'merchantUsers' => $merchantUsers,
            'merchantData' => $merchantData,
            'ccUsers' => $ccUsers,
            'totalOrders' => $totalOrders,
        ]);
    }

    public function histories(SheetOrder $order)
    {
        $this->ensureCountryAccess(request(), $order);
        $histories = $order->histories()->with('user')->latest()->get();

        return response()->json(['histories' => $histories]);
    }

    public function generateOrderNumber(Request $request)
    {
        $request->validate([
            'sheet_name' => 'required|string|max:255',
            'sheet_id' => 'nullable|string|max:255',
        ]);

        $orderNumber = $this->getNextOrderNumber(
            $request->sheet_name,
            $request->sheet_id
        );

        return response()->json([
            'order_number' => $orderNumber,
        ]);
    }

    public function store(Request $request)
    {
        $user = $request->user()->loadMissing('country');
        $validated = $request->validate([
            'order_date' => 'required|date',
            'amount' => 'required|numeric',
            'quantity' => 'required|integer',
            'item' => 'nullable|string|max:255',
            'delivery_date' => 'nullable|date',
            'client_name' => 'required|string|max:255',
            'client_city' => 'nullable|string|max:255',
            'address' => 'nullable|string|max:255',
            'product_name' => 'nullable|string|max:255',
            'city' => 'nullable|string|max:255',
            'country' => 'nullable|string|max:255',
            'phone' => 'nullable|string|max:50',
            'agent' => 'nullable|string|max:255',
            'store_name' => 'nullable|string|max:255',
            'status' => 'required|string|max:50',
            'code' => 'nullable|string|max:255',
            'order_type' => 'nullable|string|max:255',
            'alt_no' => 'nullable|string|max:255',
            'merchant' => 'nullable|string|max:255',
            'cc_email' => 'nullable|string|max:255',
            'instructions' => 'nullable|string',
            'invoice_code' => 'nullable|string|max:255',
            'sheet_id' => 'nullable|string|max:255',
            'sheet_name' => 'nullable|string|max:255',
        ]);

        $validated['country'] = CountryAccess::resolveCountryNameForWrite($user, $validated['country'] ?? null);

        // Generate order number with both sheet_name and sheet_id
        $validated['order_no'] = $this->getNextOrderNumber(
            $request->sheet_name ?? 'DefaultSheet',
            $request->sheet_id
        );

        $validated['updated_at'] = now();

        $sheetOrder = SheetOrder::create($validated);

        $this->autoMatch->applyMatches($sheetOrder, $this->autoMatch->match($sheetOrder));

        return redirect()->route('sheetorders.index')->with('success', 'Order created successfully.');
    }

    public function show(SheetOrder $sheetOrder)
    {
        $this->ensureCountryAccess(request(), $sheetOrder);

        return Inertia::render('SheetOrders/Show', [
            'order' => $sheetOrder,
        ]);
    }

    public function edit(SheetOrder $sheetOrder)
    {
        $this->ensureCountryAccess(request(), $sheetOrder);

        return Inertia::render('SheetOrders/Edit', [
            'order' => $sheetOrder,
        ]);
    }

    public function update(Request $request, SheetOrder $sheetorder)
    {
        $this->ensureCountryAccess($request, $sheetorder);
        $field = collect($request->keys())
            ->reject(fn ($key) => in_array($key, ['_token', '_method'], true))
            ->first();
        $value = $request->input($field);

        if (! $field) {
            if ($request->expectsJson()) {
                return response()->json(['message' => 'No field provided.'], 422);
            }

            return redirect()->back()->with('error', 'No field provided.');
        }

        $rules = [
            'order_no' => 'string|max:255',
            'amount' => 'numeric',
            'quantity' => 'integer',
            'delivery_date' => 'date',
            'cc_email' => 'string|max:255',
            'status' => 'string|max:50',
            'instructions' => 'nullable|string',
            'clearance_status' => 'string|in:cleared,not_cleared',
        ];

        $validated = $request->validate([
            $field => $rules[$field] ?? 'nullable|string|max:255',
        ]);

        $oldValue = $sheetorder->$field;
        $sheetorder->update($validated);

        if ($oldValue != $value) {
            OrderHistory::create([
                'order_id' => $sheetorder->id,
                'user_id' => auth()->id(),
                'attribute' => $field,
                'old_value' => $oldValue,
                'new_value' => $value,
            ]);
        }

        if ($request->expectsJson()) {
            return response()->json([
                'message' => 'Order updated successfully.',
                'order' => $sheetorder->fresh(),
            ]);
        }

        return redirect()->back()->with('success', 'Order updated successfully.');
    }

    public function destroy($id)
    {
        // Check if the logged-in user has the 'g.o.d' role
        if (strtolower(trim((string) auth()->user()->roles)) !== 'g.o.d') {
            return redirect()->route('sheetorders.index')
                ->with('error', 'Access denied. Only G.O.D can delete orders.');
        }

        // Proceed to delete only if user is G.O.D
        $order = SheetOrder::findOrFail($id);
        $this->ensureCountryAccess(request(), $order);
        $order->delete();

        return redirect()->route('sheetorders.index')
            ->with('success', 'Order deleted successfully');
    }

    /**
     * ðŸ”‘ Private helper to get the next order number using sheet_name + sheet_id
     */
    private function getNextOrderNumber(string $sheetName, ?string $sheetId = null): string
    {
        $query = SheetOrder::where('sheet_name', $sheetName);

        if ($sheetId) {
            $query->where('sheet_id', $sheetId);
        }

        $lastNumber = $query
            ->whereRaw('order_no REGEXP "^[A-Z]+[0-9]+$"')
            ->selectRaw('MAX(CAST(SUBSTRING(order_no, LENGTH(REGEXP_SUBSTR(order_no, "^[A-Z]+")) + 1) AS UNSIGNED)) as max_number,
                         REGEXP_SUBSTR(order_no, "^[A-Z]+") as prefix')
            ->groupBy('prefix')
            ->orderByDesc('max_number')
            ->first();

        $nextNumber = 1;
        $prefix = 'ORD';

        if ($lastNumber) {
            $prefix = $lastNumber->prefix;
            $nextNumber = $lastNumber->max_number + 1;
        }

        return $prefix.$nextNumber;
    }
}
