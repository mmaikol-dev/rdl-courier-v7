<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\SheetOrder;
use App\Models\User;
use App\Services\DeliveredOrderInventoryDeductionService;
use App\Support\CountryAccess;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class OrderProductMatchingController extends Controller
{
    private function ordersForUser(Request $request): Builder
    {
        $user = $request->user()?->loadMissing('country');

        return CountryAccess::scopeByCountryName(
            SheetOrder::query(),
            $user
        )->when(
            strtolower(trim((string) $user?->roles)) === 'merchant',
            fn (Builder $query) => $query->where('merchant', $user->name)
        );
    }

    private function productsForUser(Request $request): Builder
    {
        $user = $request->user()?->loadMissing('country');

        return CountryAccess::scopeProducts(
            Product::query(),
            $user
        )->when(
            strtolower(trim((string) $user?->roles)) === 'merchant',
            fn (Builder $query) => $query->where('merchant', $user->name)
        );
    }

    public function index(Request $request): Response
    {
        $productName = trim((string) $request->query('product_name', ''));
        $perPage = (int) $request->integer('per_page', 25);
        $perPage = in_array($perPage, [10, 25, 50, 100], true) ? $perPage : 25;
        $agentId = (int) $request->integer('agent_id');
        $agentId = $agentId > 0 ? $agentId : null;

        $products = $this->productsForUser($request)
            ->orderBy('name')
            ->get(['id', 'name', 'code', 'merchant', 'country']);

        $agents = CountryAccess::scopeUsers(
            User::query()
                ->whereRaw('LOWER(TRIM(roles)) = ?', ['agent'])
                ->select('id', 'name'),
            $request->user()?->loadMissing('country')
        )
            ->orderBy('name')
            ->get();

        return Inertia::render('orders/product-matching', [
            'orders' => Inertia::defer(fn () => $this->ordersForUser($request)
                ->with([
                    'linkedProduct:id,name,code',
                    'assignedAgent:id,name',
                ])
                ->when(
                    $productName !== '',
                    fn (Builder $query) => $query->where('product_name', 'like', '%'.$productName.'%')
                )
                ->when(
                    $agentId !== null,
                    fn (Builder $query) => $query->where('agent_id', $agentId)
                )
                ->orderByDesc('id')
                ->paginate($perPage, [
                    'id',
                    'order_no',
                    'order_date',
                    'client_name',
                    'phone',
                    'address',
                    'product_name',
                    'quantity',
                    'amount',
                    'status',
                    'inventory_product_id',
                    'inventory_deducted_at',
                    'agent_id',
                    'merchant',
                    'country',
                ])
                ->withQueryString()),
            'products' => $products,
            'agents' => $agents,
            'filters' => ['product_name' => $productName, 'agent_id' => $agentId, 'per_page' => $perPage],
        ]);
    }

    public function match(Request $request): RedirectResponse|JsonResponse
    {
        $validated = $request->validate([
            'order_id' => ['required', 'integer'],
            'inventory_product_id' => ['nullable', 'integer'],
        ]);

        $order = DB::transaction(function () use ($request, $validated): SheetOrder {
            $order = $this->ordersForUser($request)
                ->lockForUpdate()
                ->findOrFail($validated['order_id']);

            $this->ensureOrderCanBeMatched($order);
            $productId = $validated['inventory_product_id'];

            if ($productId !== null) {
                $product = $this->productsForUser($request)->find($productId);
                if (! $product) {
                    throw ValidationException::withMessages([
                        'inventory_product_id' => 'Choose an inventory product available to this order.',
                    ]);
                }
            }

            SheetOrder::withoutEditTracking(
                fn () => $order->forceFill(['inventory_product_id' => $productId])->save()
            );

            return $order;
        });

        $deduction = $this->deductDeliveredOrderIfReady($order);

        if ($request->expectsJson()) {
            return response()->json([
                'order' => $this->matchPayload($order),
                'deduction' => $deduction,
            ]);
        }

        return $deduction['status'] === 'failed'
            ? back()->with('warning', 'Product match saved, but inventory deduction failed: '.$deduction['message'])
            : back()->with('success', $deduction['status'] === 'deducted'
                ? 'Product matched; warehouse stock and agent transfer balance were deducted. A WhatsApp notification was attempted.'
                : 'Order product match saved.');
    }

    public function bulkMatch(Request $request): RedirectResponse|JsonResponse
    {
        $validated = $request->validate([
            'order_ids' => ['required', 'array', 'min:1'],
            'order_ids.*' => ['required', 'integer', 'distinct'],
            'inventory_product_id' => ['required', 'integer'],
        ]);

        $orders = DB::transaction(function () use ($request, $validated) {
            $orders = $this->ordersForUser($request)
                ->whereIn('id', $validated['order_ids'])
                ->lockForUpdate()
                ->get();

            if ($orders->count() !== count($validated['order_ids'])) {
                throw ValidationException::withMessages([
                    'order_ids' => 'One or more selected orders are unavailable.',
                ]);
            }

            $product = $this->productsForUser($request)->find($validated['inventory_product_id']);
            if (! $product) {
                throw ValidationException::withMessages([
                    'inventory_product_id' => 'Choose an inventory product available to your account.',
                ]);
            }

            foreach ($orders as $order) {
                $this->ensureOrderCanBeMatched($order);
            }

            SheetOrder::withoutEditTracking(function () use ($orders, $product): void {
                foreach ($orders as $order) {
                    $order->forceFill(['inventory_product_id' => $product->id])->save();
                }
            });

            return $orders;
        });

        $deductions = [];
        foreach ($orders as $order) {
            $deductions[] = [
                'order_id' => $order->id,
                'order_no' => $order->order_no,
                ...$this->deductDeliveredOrderIfReady($order),
            ];
        }

        if ($request->expectsJson()) {
            return response()->json([
                'orders' => $orders->map(fn (SheetOrder $order) => $this->matchPayload($order))->values(),
                'deductions' => $deductions,
            ]);
        }

        $failed = collect($deductions)->where('status', 'failed');
        if ($failed->isNotEmpty()) {
            return back()->with('warning', count($validated['order_ids']).' orders matched; inventory deduction failed for '.$failed->pluck('order_no')->filter()->implode(', ').'.');
        }

        $deductedCount = collect($deductions)->where('status', 'deducted')->count();
        $message = count($validated['order_ids']).' orders matched to the selected inventory product.';
        if ($deductedCount > 0) {
            $message .= " {$deductedCount} delivered order(s) were deducted from warehouse stock and their agent transfer balances; WhatsApp notifications were attempted.";
        }

        return back()->with('success', $message);
    }

    /**
     * @return array<string, mixed>
     */
    private function matchPayload(SheetOrder $order): array
    {
        $order->loadMissing(['linkedProduct:id,name,code', 'assignedAgent:id,name']);

        return [
            'id' => $order->id,
            'inventory_product_id' => $order->inventory_product_id,
            'status' => $order->status,
            'inventory_deducted_at' => $order->inventory_deducted_at?->toDateTimeString(),
            'linked_product' => $order->linkedProduct
                ? ['id' => $order->linkedProduct->id, 'name' => $order->linkedProduct->name, 'code' => $order->linkedProduct->code]
                : null,
            'assigned_agent' => $order->assignedAgent
                ? ['id' => $order->assignedAgent->id, 'name' => $order->assignedAgent->name]
                : null,
        ];
    }

    private function ensureOrderCanBeMatched(SheetOrder $order): void
    {
        if ($order->inventory_deducted_at) {
            throw ValidationException::withMessages([
                'order_ids' => "Order {$order->order_no} has already had inventory deducted and cannot be rematched.",
            ]);
        }
    }

    /** @return array{status: string, message: string|null, warehouse_deducted: bool, agent_transfer_deducted: bool, whatsapp_notification: string} */
    private function deductDeliveredOrderIfReady(SheetOrder $order): array
    {
        if (mb_strtolower(trim((string) $order->status)) !== 'delivered') {
            $order->refresh();

            return [
                'status' => 'not_delivered',
                'message' => null,
                'warehouse_deducted' => false,
                'agent_transfer_deducted' => false,
                'whatsapp_notification' => 'not_applicable',
            ];
        }

        if ($order->inventory_deducted_at) {
            $order->refresh();

            return [
                'status' => 'already_deducted',
                'message' => null,
                'warehouse_deducted' => false,
                'agent_transfer_deducted' => false,
                'whatsapp_notification' => 'already_processed',
            ];
        }

        if (! $order->inventory_product_id) {
            return [
                'status' => 'missing_product',
                'message' => 'Choose an inventory product before deducting stock.',
                'warehouse_deducted' => false,
                'agent_transfer_deducted' => false,
                'whatsapp_notification' => 'not_sent',
            ];
        }

        try {
            app(DeliveredOrderInventoryDeductionService::class)->deduct($order);
        } catch (\Throwable $exception) {
            $message = $exception instanceof ValidationException
                ? collect($exception->errors())->flatten()->first()
                : $exception->getMessage();
            Log::error('Matching a delivered order could not deduct inventory.', [
                'order_id' => $order->id,
                'order_no' => $order->order_no,
                'inventory_product_id' => $order->inventory_product_id,
                'agent_id' => $order->agent_id,
                'error' => $message,
            ]);

            $order->refresh();

            return [
                'status' => 'failed',
                'message' => $message ?: 'Inventory deduction did not complete.',
                'warehouse_deducted' => false,
                'agent_transfer_deducted' => false,
                'whatsapp_notification' => 'not_sent',
            ];
        }

        $order->refresh();

        if (! $order->inventory_deducted_at) {
            return [
                'status' => 'failed',
                'message' => 'Inventory deduction did not complete. Check the order and inventory logs, then retry the match.',
                'warehouse_deducted' => false,
                'agent_transfer_deducted' => false,
                'whatsapp_notification' => 'not_sent',
            ];
        }

        return [
            'status' => 'deducted',
            'message' => null,
            'warehouse_deducted' => true,
            'agent_transfer_deducted' => (bool) $order->agent_id,
            'whatsapp_notification' => 'attempted',
        ];
    }
}
