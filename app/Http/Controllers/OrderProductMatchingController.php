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
        $productNamesInput = $request->query('product_names', $request->query('product_name', []));
        if (is_string($productNamesInput)) {
            $productNamesInput = explode(',', $productNamesInput);
        }

        $productNames = collect(is_array($productNamesInput) ? $productNamesInput : [])
            ->map(fn ($value) => trim((string) $value))
            ->filter()
            ->unique()
            ->values()
            ->all();

        $merchant = trim((string) $request->query('merchant', ''));
        $status = trim((string) $request->query('status', ''));
        $perPage = (int) $request->integer('per_page', 500);
        $perPage = in_array($perPage, [10, 25, 50, 100, 500], true) ? $perPage : 500;
        $agentId = (int) $request->integer('agent_id');
        $agentId = $agentId > 0 ? $agentId : null;

        $baseOrders = $this->ordersForUser($request);
        $merchantOrders = clone $baseOrders;
        if ($merchant !== '') {
            $merchantOrders->where('merchant', $merchant);
        }

        $products = $this->productsForUser($request)
            ->when($merchant !== '', fn (Builder $query) => $query->where('merchant', $merchant))
            ->orderBy('name')
            ->get(['id', 'name', 'code', 'merchant', 'country']);

        $agentQuery = User::query()
            ->whereRaw('LOWER(TRIM(roles)) = ?', ['agent'])
            ->select('id', 'name');
        if ($merchant !== '') {
            $agentIds = (clone $merchantOrders)
                ->whereNotNull('agent_id')
                ->distinct()
                ->pluck('agent_id');
            $agentQuery->whereIn('id', $agentIds);
        }

        $agents = CountryAccess::scopeUsers($agentQuery, $request->user()?->loadMissing('country'))
            ->orderBy('name')
            ->get();

        $merchants = (clone $baseOrders)
            ->whereNotNull('merchant')
            ->where('merchant', '<>', '')
            ->distinct()
            ->orderBy('merchant')
            ->pluck('merchant')
            ->values();

        $orderProductNames = (clone $merchantOrders)
            ->whereNotNull('product_name')
            ->where('product_name', '<>', '')
            ->distinct()
            ->orderBy('product_name')
            ->pluck('product_name')
            ->values();

        $statuses = (clone $merchantOrders)
            ->whereNotNull('status')
            ->where('status', '<>', '')
            ->distinct()
            ->orderBy('status')
            ->pluck('status')
            ->map(fn ($value) => trim((string) $value))
            ->filter()
            ->unique()
            ->sort()
            ->values();

        $hasNewOrders = $merchant === '' || (clone $merchantOrders)
            ->where(function (Builder $query): void {
                $query->whereNull('status')->orWhereRaw("TRIM(status) = ''");
            })
            ->exists();
        $statuses = collect($hasNewOrders ? ['New Orders'] : [])->merge($statuses)->unique()->values();

        return Inertia::render('orders/product-matching', [
            'orders' => Inertia::defer(fn () => (clone $baseOrders)
                ->with([
                    'linkedProduct:id,name,code',
                    'assignedAgent:id,name',
                ])
                ->when(
                    $productNames !== [],
                    fn (Builder $query) => $query->whereIn('product_name', $productNames)
                )
                ->when(
                    $merchant !== '',
                    fn (Builder $query) => $query->where('merchant', $merchant)
                )
                ->when(
                    $agentId !== null,
                    fn (Builder $query) => $query->where('agent_id', $agentId)
                )
                ->when(
                    $status !== '',
                    function (Builder $query) use ($status) {
                        if ($status === 'New Orders') {
                            $query->where(function (Builder $query) {
                                $query->whereNull('status')->orWhereRaw("TRIM(status) = ''");
                            });
                        } else {
                            $query->whereRaw('TRIM(status) = ?', [$status]);
                        }
                    }
                )
                ->orderByDesc('id')
                ->paginate($perPage, [
                    'id',
                    'order_no',
                    'delivery_date',
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
            'merchants' => $merchants,
            'orderProductNames' => $orderProductNames,
            'statuses' => $statuses,
            'filters' => ['product_names' => $productNames, 'merchant' => $merchant, 'status' => $status, 'agent_id' => $agentId, 'per_page' => $perPage],
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

        [$orders, $skipped] = DB::transaction(function () use ($request, $validated): array {
            $selected = $this->ordersForUser($request)
                ->whereIn('id', $validated['order_ids'])
                ->lockForUpdate()
                ->get();

            if ($selected->count() !== count($validated['order_ids'])) {
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

            $shouldSkip = fn (SheetOrder $order): bool => $order->inventory_product_id !== null
                || $order->inventory_deducted_at !== null;

            $skipped = $selected->filter($shouldSkip)->values();
            $orders = $selected->reject($shouldSkip)->values();

            SheetOrder::withoutEditTracking(function () use ($orders, $product): void {
                foreach ($orders as $order) {
                    $order->forceFill(['inventory_product_id' => $product->id])->save();
                }
            });

            return [$orders, $skipped];
        });

        $deductions = [];
        foreach ($orders as $order) {
            $deductions[] = [
                'order_id' => $order->id,
                'order_no' => $order->order_no,
                ...$this->deductDeliveredOrderIfReady($order),
            ];
        }

        $skippedPayload = $skipped->map(fn (SheetOrder $order) => [
            'id' => $order->id,
            'order_no' => $order->order_no,
            'reason' => $order->inventory_deducted_at ? 'already_deducted' : 'already_matched',
        ])->values();

        if ($request->expectsJson()) {
            return response()->json([
                'orders' => $orders->map(fn (SheetOrder $order) => $this->matchPayload($order))->values(),
                'deductions' => $deductions,
                'skipped' => $skippedPayload,
            ]);
        }

        $matchedCount = $orders->count();
        $skippedCount = $skipped->count();
        $failed = collect($deductions)->where('status', 'failed');
        if ($failed->isNotEmpty()) {
            return back()->with('warning', "{$matchedCount} orders matched; inventory deduction failed for ".$failed->pluck('order_no')->filter()->implode(', ').'.');
        }

        $deductedCount = collect($deductions)->where('status', 'deducted')->count();
        $message = "{$matchedCount} orders matched to the selected inventory product.";
        if ($deductedCount > 0) {
            $message .= " {$deductedCount} delivered order(s) were deducted from warehouse stock and their agent transfer balances; WhatsApp notifications were attempted.";
        }
        if ($skippedCount > 0) {
            $message .= " {$skippedCount} already matched order(s) were skipped.";
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
