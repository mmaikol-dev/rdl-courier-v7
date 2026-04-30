<?php

namespace App\Http\Controllers;

use App\Exports\OrdersExport;
use App\Models\SheetOrder;
use App\Support\CountryAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Maatwebsite\Excel\Facades\Excel;

class FinanceWorkflowController extends Controller
{
    private function activeWorkflowScope($query)
    {
        return $query->where(function ($query): void {
            $query->whereNull('agent')->orWhere('agent', '!=', 'Remitted');
        });
    }

    private function deliveredScope($query)
    {
        return $query->where(function ($query): void {
            $query->whereNotNull('delivered_at')
                ->orWhere('status', 'Delivered')
                ->orWhereRaw('LOWER(status) = ?', ['delivered']);
        });
    }

    private function merchantBaseQuery(?\App\Models\User $user)
    {
        return CountryAccess::scopeByCountryName(SheetOrder::query(), $user)
            ->whereNotNull('merchant')
            ->where('merchant', '!=', '');
    }

    private function stageQuery(string $stage, ?\App\Models\User $user)
    {
        $query = $this->merchantBaseQuery($user);

        return match ($stage) {
            'delivery' => $query
                ->whereIn('status', ['scheduled', 'dispatched'])
                ->whereNotNull('code')
                ->where('code', '!=', ''),
            'confirmation' => $this->activeWorkflowScope(
                $this->deliveredScope($query)
                    ->whereNull('merchant_confirmed_at')
            ),
            'remit' => $this->activeWorkflowScope(
                $query
                    ->whereNotNull('report_generated_at')
                    ->whereNotNull('merchant_confirmed_at')
            ),
            'history' => $query
                ->whereNotNull('report_generated_at')
                ->where('agent', 'Remitted'),
            default => abort(422, 'Invalid workflow stage'),
        };
    }

    public function index(Request $request): Response
    {
        $user = $request->user()?->loadMissing('country');
        $baseQuery = $this->merchantBaseQuery($user);

        $readyForDelivery = (clone $baseQuery)
            ->whereIn('status', ['scheduled', 'dispatched'])
            ->whereNotNull('code')
            ->where('code', '!=', '')
            ->selectRaw('merchant, COUNT(*) as orders_count, SUM(COALESCE(amount, 0)) as total_amount, MIN(delivery_date) as earliest_delivery, MAX(delivery_date) as latest_delivery')
            ->groupBy('merchant')
            ->orderBy('merchant')
            ->get()
            ->map(fn ($row) => [
                'merchant' => $row->merchant,
                'orders_count' => (int) $row->orders_count,
                'total_amount' => (float) $row->total_amount,
                'earliest_delivery' => $row->earliest_delivery,
                'latest_delivery' => $row->latest_delivery,
            ]);

        $awaitingConfirmation = $this->activeWorkflowScope(
            $this->deliveredScope(clone $baseQuery)
                ->whereNull('merchant_confirmed_at')
        )
            ->selectRaw('merchant, COUNT(*) as orders_count, SUM(COALESCE(amount, 0)) as total_amount, MAX(report_generated_at) as report_generated_at')
            ->groupBy('merchant')
            ->orderBy('merchant')
            ->get()
            ->map(fn ($row) => [
                'merchant' => $row->merchant,
                'orders_count' => (int) $row->orders_count,
                'total_amount' => (float) $row->total_amount,
                'report_generated_at' => $row->report_generated_at,
            ]);

        $readyToRemit = $this->activeWorkflowScope(clone $baseQuery)
            ->whereNotNull('report_generated_at')
            ->whereNotNull('merchant_confirmed_at')
            ->selectRaw('merchant, COUNT(*) as orders_count, SUM(COALESCE(amount, 0)) as total_amount, MAX(merchant_confirmed_at) as merchant_confirmed_at')
            ->groupBy('merchant')
            ->orderBy('merchant')
            ->get()
            ->map(fn ($row) => [
                'merchant' => $row->merchant,
                'orders_count' => (int) $row->orders_count,
                'total_amount' => (float) $row->total_amount,
                'merchant_confirmed_at' => $row->merchant_confirmed_at,
            ]);

        $remittedHistory = (clone $baseQuery)
            ->whereNotNull('report_generated_at')
            ->where('agent', 'Remitted')
            ->selectRaw('merchant, COUNT(*) as orders_count, SUM(COALESCE(amount, 0)) as total_amount, MAX(remitted_at) as remitted_at')
            ->groupBy('merchant')
            ->orderByDesc('remitted_at')
            ->limit(20)
            ->get()
            ->map(fn ($row) => [
                'merchant' => $row->merchant,
                'orders_count' => (int) $row->orders_count,
                'total_amount' => (float) $row->total_amount,
                'remitted_at' => $row->remitted_at,
            ]);

        return Inertia::render('finance-workflow/index', [
            'readyForDelivery' => $readyForDelivery,
            'awaitingConfirmation' => $awaitingConfirmation,
            'readyToRemit' => $readyToRemit,
            'remittedHistory' => $remittedHistory,
            'summary' => [
                'readyForDelivery' => $readyForDelivery->sum('orders_count'),
                'awaitingConfirmation' => $awaitingConfirmation->sum('orders_count'),
                'readyToRemit' => $readyToRemit->sum('orders_count'),
                'remitted' => $remittedHistory->sum('orders_count'),
            ],
            'statusOptions' => CountryAccess::scopeByCountryName(
                SheetOrder::query()
                    ->select('status')
                    ->distinct()
                    ->whereNotNull('status')
                    ->where('status', '!=', ''),
                $user
            )->orderBy('status')->pluck('status')->values(),
        ]);
    }

    public function merchantOrders(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'merchant' => ['required', 'string', 'max:255'],
            'stage' => ['required', 'string', 'in:delivery,confirmation,remit,history'],
        ]);

        $user = $request->user()?->loadMissing('country');

        $orders = $this->stageQuery($validated['stage'], $user)
            ->where('merchant', $validated['merchant'])
            ->orderByDesc('delivery_date')
            ->limit(200)
            ->get([
                'id',
                'order_no',
                'client_name',
                'product_name',
                'amount',
                'quantity',
                'status',
                'agent',
                'code',
                'delivery_date',
                'phone',
                'address',
            ]);

        return response()->json([
            'orders' => $orders,
        ]);
    }

    public function markDelivered(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'merchant' => ['required', 'string', 'max:255'],
            'order_ids' => ['nullable', 'array', 'min:1'],
            'order_ids.*' => ['integer'],
        ]);

        $user = $request->user()?->loadMissing('country');

        $query = CountryAccess::scopeByCountryName(SheetOrder::query(), $user)
            ->where('merchant', $validated['merchant'])
            ->whereIn('status', ['scheduled', 'dispatched'])
            ->whereNotNull('code')
            ->where('code', '!=', '');

        if (! empty($validated['order_ids'])) {
            $query->whereIn('id', $validated['order_ids']);
        }

        $updated = $query->update([
                'status' => 'Delivered',
                'delivered_at' => now(),
                'delivered_by' => $user?->id,
            ]);

        if ($updated === 0) {
            return back()->withErrors([
                'merchant' => 'No eligible orders were selected for delivery confirmation.',
            ]);
        }

        return back()->with('success', $updated . ' order(s) marked as delivered.');
    }

    public function downloadMerchantReport(Request $request)
    {
        $validated = $request->validate([
            'merchant' => ['required', 'string', 'max:255'],
            'extra_statuses' => ['nullable', 'array'],
            'extra_statuses.*' => ['required', 'string', 'max:255'],
            'from' => ['nullable', 'date', 'required_with:to,extra_statuses'],
            'to' => ['nullable', 'date', 'required_with:from,extra_statuses', 'after_or_equal:from'],
        ]);

        $user = $request->user()?->loadMissing('country');
        $merchant = $validated['merchant'];
        $extraStatuses = collect($validated['extra_statuses'] ?? [])
            ->map(fn ($status): string => trim((string) $status))
            ->filter(fn (string $status): bool => $status !== '' && strtolower($status) !== 'delivered')
            ->unique()
            ->values()
            ->all();

        if ($extraStatuses !== [] && (empty($validated['from']) || empty($validated['to']))) {
            return back()->withErrors([
                'extra_statuses' => 'Select a date range for the additional statuses.',
            ]);
        }

        $workflowOrdersQuery = $this->stageQuery('confirmation', $user)
            ->where('merchant', $merchant);

        $workflowOrderIds = (clone $workflowOrdersQuery)
            ->pluck('id')
            ->all();

        if ($workflowOrderIds === []) {
            return back()->withErrors([
                'merchant' => 'No delivered workflow orders are available for this merchant right now.',
            ]);
        }

        $workflowOrdersQuery
            ->update([
                'report_generated_at' => now(),
                'report_generated_by' => $user?->id,
            ]);

        return Excel::download(new OrdersExport([
            'merchant' => $merchant,
            'country' => CountryAccess::userCountryName($user),
            'workflow_order_ids' => $workflowOrderIds,
            'extra_statuses' => $extraStatuses,
            'from' => $validated['from'] ?? null,
            'to' => $validated['to'] ?? null,
        ]), 'merchant_report_' . str()->slug($merchant) . '.xlsx');
    }

    public function markConfirmed(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'merchant' => ['required', 'string', 'max:255'],
        ]);

        $user = $request->user()?->loadMissing('country');

        CountryAccess::scopeByCountryName(SheetOrder::query(), $user)
            ->where('merchant', $validated['merchant'])
            ->whereNotNull('report_generated_at')
            ->whereNull('merchant_confirmed_at')
            ->where(function ($query): void {
                $query->whereNull('agent')->orWhere('agent', '!=', 'Remitted');
            })
            ->update([
                'merchant_confirmed_at' => now(),
                'merchant_confirmed_by' => $user?->id,
            ]);

        return back()->with('success', 'Merchant confirmation recorded.');
    }

    public function markRemitted(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'merchant' => ['required', 'string', 'max:255'],
        ]);

        $user = $request->user()?->loadMissing('country');

        CountryAccess::scopeByCountryName(SheetOrder::query(), $user)
            ->where('merchant', $validated['merchant'])
            ->whereNotNull('report_generated_at')
            ->whereNotNull('merchant_confirmed_at')
            ->where(function ($query): void {
                $query->whereNull('agent')->orWhere('agent', '!=', 'Remitted');
            })
            ->update([
                'agent' => 'Remitted',
                'remitted_at' => now(),
                'remitted_by' => $user?->id,
            ]);

        return back()->with('success', 'Orders marked as remitted.');
    }
}
