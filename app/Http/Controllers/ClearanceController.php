<?php

namespace App\Http\Controllers;

use App\Models\OrderHistory;
use App\Models\SheetOrder;
use App\Models\User;
use App\Support\CountryAccess;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
                'agent_id' => $order->agent_id,
                'clearance_status' => $order->clearance_status,
                'clearance_note' => $order->clearance_note,
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

    public function batch(Request $request): RedirectResponse
    {
        $user = $request->user()?->loadMissing('country');

        $validated = $request->validate([
            'orders' => ['required', 'array', 'min:1'],
            'orders.*.id' => ['required', 'integer'],
            'orders.*.code' => ['nullable', 'string', 'max:255'],
            'orders.*.clearance_note' => ['nullable', 'string', 'max:1000'],
            'orders.*.clearance_status' => ['required', 'string', 'in:cleared,not_cleared'],
        ]);

        $orders = CountryAccess::scopeByCountryName(SheetOrder::query(), $user)
            ->whereIn('id', collect($validated['orders'])->pluck('id'))
            ->get()
            ->keyBy('id');

        $updated = 0;
        $skipped = 0;

        DB::transaction(function () use ($validated, $orders, $user, &$updated, &$skipped): void {
            foreach ($validated['orders'] as $payload) {
                $order = $orders->get($payload['id']);

                if (! $order) {
                    $skipped++;

                    continue;
                }

                $values = [
                    'code' => filled($payload['code'] ?? null) ? trim((string) $payload['code']) : null,
                    'clearance_note' => filled($payload['clearance_note'] ?? null) ? trim((string) $payload['clearance_note']) : null,
                    'clearance_status' => $payload['clearance_status'],
                ];

                $changes = [];
                $oldValues = [];

                foreach ($values as $field => $newValue) {
                    $oldValue = $order->getRawOriginal($field);

                    if ((string) $oldValue !== (string) $newValue) {
                        $changes[$field] = $newValue;
                        $oldValues[$field] = $oldValue;
                    }
                }

                if ($changes === []) {
                    continue;
                }

                $order->update($changes);
                $updated++;

                foreach ($changes as $field => $newValue) {
                    OrderHistory::create([
                        'order_id' => $order->id,
                        'user_id' => $user?->id,
                        'attribute' => $field,
                        'old_value' => $oldValues[$field] ?? '',
                        'new_value' => $newValue ?? '',
                    ]);
                }
            }
        });

        $message = "{$updated} order".($updated === 1 ? '' : 's').' updated';

        if ($skipped > 0) {
            $message .= ", {$skipped} skipped";
        }

        return redirect()->back()->with('success', $message.'.');
    }

    public function markReturned(Request $request, int $order): RedirectResponse
    {
        $user = $request->user()?->loadMissing('country');

        $wasUpdated = DB::transaction(function () use ($order, $user): bool {
            $sheetOrder = CountryAccess::scopeByCountryName(SheetOrder::query(), $user)
                ->whereKey($order)
                ->lockForUpdate()
                ->firstOrFail();

            $changes = [];
            $oldValues = [];
            foreach ([
                'status' => 'Returned',
                'clearance_status' => 'not_cleared',
            ] as $field => $value) {
                $oldValue = $sheetOrder->getRawOriginal($field);
                if ((string) $oldValue !== $value) {
                    $changes[$field] = $value;
                    $oldValues[$field] = $oldValue;
                }
            }

            if ($changes === []) {
                return false;
            }

            $sheetOrder->update($changes);

            foreach ($changes as $field => $value) {
                OrderHistory::create([
                    'order_id' => $sheetOrder->id,
                    'user_id' => $user?->id,
                    'attribute' => $field,
                    'old_value' => $oldValues[$field] ?? '',
                    'new_value' => $value,
                ]);
            }

            return true;
        });

        return redirect()->back()->with(
            'success',
            $wasUpdated ? 'Order marked returned without a QR scan.' : 'Order is already marked returned.'
        );
    }
}
