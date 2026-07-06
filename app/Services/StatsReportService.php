<?php

namespace App\Services;

use App\Models\SheetOrder;
use App\Models\User;
use App\Support\CountryAccess;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class StatsReportService
{
    public function build(User $user, array $filters): array
    {
        $user->loadMissing('country');

        $normalizedFilters = $this->normalizeFilters($filters);

        return Cache::remember(
            $this->cacheKey($user, $normalizedFilters),
            now()->addSeconds(60),
            fn (): array => $this->buildPayload($user, $normalizedFilters)
        );
    }

    private function buildPayload(User $user, array $filters): array
    {
        $query = $this->filteredBaseQuery($user, $filters);
        $dateRange = $filters['date_range'];
        $dateColumn = $filters['date_field'];
        $ccEmail = $filters['cc_email'];
        $merchant = $filters['merchant'];
        $status = $filters['status'];
        $country = $filters['country'];
        $product = $filters['product'];

        $totalOrders = (clone $query)->count();
        $totalRevenue = (clone $query)->sum('amount') ?? 0;
        $totalQuantity = (clone $query)->sum('quantity') ?? 0;

        $summary = [
            'totalOrders' => $totalOrders,
            'totalRevenue' => round($totalRevenue, 2),
            'averageOrderValue' => $totalOrders > 0 ? round($totalRevenue / $totalOrders, 2) : 0,
            'totalQuantity' => $totalQuantity,
        ];

        $ordersByStatus = (clone $query)
            ->select('status', DB::raw('count(*) as total'), DB::raw('sum(amount) as revenue'))
            ->groupBy('status')
            ->get()
            ->map(fn ($item) => [
                'status' => $item->status ?? 'Unknown',
                'total' => (int) $item->total,
                'revenue' => round($item->revenue ?? 0, 2),
                'percentage' => $totalOrders > 0 ? round(($item->total / $totalOrders) * 100, 1) : 0,
            ])
            ->sortByDesc('total')
            ->values();

        $agentPerformance = (clone $query)
            ->select(
                'cc_email',
                DB::raw('count(*) as total_orders'),
                DB::raw('sum(amount) as total_revenue'),
                DB::raw('sum(case when LOWER(status) IN ("delivered", "completed") then 1 else 0 end) as delivered_orders'),
                DB::raw('sum(case when LOWER(status) IN ("cancelled", "canceled") then 1 else 0 end) as cancelled_orders'),
                DB::raw('sum(case when LOWER(status) = "pending" then 1 else 0 end) as pending_orders'),
                DB::raw('sum(case when LOWER(status) = "scheduled" then 1 else 0 end) as scheduled_orders'),
                DB::raw('avg(amount) as avg_order_value')
            )
            ->whereNotNull('cc_email')
            ->where('cc_email', '!=', '')
            ->groupBy('cc_email')
            ->orderByDesc('total_orders')
            ->limit(12)
            ->get()
            ->map(function ($agent) {
                $deliveryRate = $agent->total_orders > 0
                    ? round(($agent->delivered_orders / $agent->total_orders) * 100, 1)
                    : 0;

                $scheduleRate = $agent->total_orders > 0
                    ? round(($agent->scheduled_orders / $agent->total_orders) * 100, 1)
                    : 0;

                return [
                    'cc_email' => $agent->cc_email,
                    'total_orders' => (int) $agent->total_orders,
                    'total_revenue' => round($agent->total_revenue ?? 0, 2),
                    'delivered_orders' => (int) $agent->delivered_orders,
                    'cancelled_orders' => (int) $agent->cancelled_orders,
                    'pending_orders' => (int) $agent->pending_orders,
                    'scheduled_orders' => (int) $agent->scheduled_orders,
                    'avg_order_value' => round($agent->avg_order_value ?? 0, 2),
                    'delivery_rate' => $deliveryRate,
                    'schedule_rate' => $scheduleRate,
                ];
            });

        $now = Carbon::now();

        $overdueScheduled = $this->scopeVisibleOrders($user)
            ->select(
                'cc_email',
                'merchant',
                'order_no',
                'client_name',
                'delivery_date',
                DB::raw('DATEDIFF(NOW(), delivery_date) as days_overdue')
            )
            ->whereNotNull('cc_email')
            ->where('cc_email', '!=', '')
            ->whereNotNull('delivery_date')
            ->where('delivery_date', '<', $now)
            ->whereNull('code')
            ->where(function ($query) {
                $query->where('status', 'scheduled')
                    ->orWhereRaw('LOWER(status) = "scheduled"');
            })
            ->orderBy('days_overdue', 'desc')
            ->limit(30)
            ->get()
            ->map(fn ($order) => [
                'cc_email' => $order->cc_email,
                'merchant' => $order->merchant,
                'order_no' => $order->order_no,
                'client_name' => $order->client_name,
                'delivery_date' => $order->delivery_date,
                'days_overdue' => (int) $order->days_overdue,
            ]);

        $overdueScheduledSummary = $this->scopeVisibleOrders($user)
            ->select(
                'cc_email',
                DB::raw('count(*) as overdue_count'),
                DB::raw('AVG(DATEDIFF(NOW(), delivery_date)) as avg_days_overdue')
            )
            ->whereNotNull('cc_email')
            ->where('cc_email', '!=', '')
            ->whereNotNull('delivery_date')
            ->where('delivery_date', '<', $now)
            ->whereNull('code')
            ->where(function ($query) {
                $query->where('status', 'scheduled')
                    ->orWhereRaw('LOWER(status) = "scheduled"');
            })
            ->groupBy('cc_email')
            ->orderByDesc('overdue_count')
            ->limit(10)
            ->get()
            ->map(fn ($item) => [
                'cc_email' => $item->cc_email,
                'overdue_count' => (int) $item->overdue_count,
                'avg_days_overdue' => round($item->avg_days_overdue ?? 0, 1),
            ]);

        $overduePending = $this->scopeVisibleOrders($user)
            ->select(
                'cc_email',
                'merchant',
                'order_no',
                'client_name',
                'order_date',
                DB::raw('DATEDIFF(NOW(), order_date) as days_pending')
            )
            ->whereNotNull('cc_email')
            ->where('cc_email', '!=', '')
            ->where(function ($query) {
                $query->where('status', 'pending')
                    ->orWhereRaw('LOWER(status) = "pending"');
            })
            ->whereRaw('DATEDIFF(NOW(), order_date) >= 2')
            ->orderBy('days_pending', 'desc')
            ->limit(30)
            ->get()
            ->map(fn ($order) => [
                'cc_email' => $order->cc_email,
                'merchant' => $order->merchant,
                'order_no' => $order->order_no,
                'client_name' => $order->client_name,
                'order_date' => $order->order_date,
                'days_pending' => (int) $order->days_pending,
            ]);

        $overduePendingSummary = $this->scopeVisibleOrders($user)
            ->select(
                'cc_email',
                DB::raw('count(*) as overdue_count'),
                DB::raw('AVG(DATEDIFF(NOW(), order_date)) as avg_days_pending')
            )
            ->whereNotNull('cc_email')
            ->where('cc_email', '!=', '')
            ->where(function ($query) {
                $query->where('status', 'pending')
                    ->orWhereRaw('LOWER(status) = "pending"');
            })
            ->whereRaw('DATEDIFF(NOW(), order_date) >= 2')
            ->groupBy('cc_email')
            ->orderByDesc('overdue_count')
            ->limit(10)
            ->get()
            ->map(fn ($item) => [
                'cc_email' => $item->cc_email,
                'overdue_count' => (int) $item->overdue_count,
                'avg_days_pending' => round($item->avg_days_pending ?? 0, 1),
            ]);

        $ordersByMerchant = (clone $query)
            ->select('merchant', DB::raw('count(*) as total'), DB::raw('sum(amount) as revenue'))
            ->whereNotNull('merchant')
            ->where('merchant', '!=', '')
            ->groupBy('merchant')
            ->orderByDesc('total')
            ->limit(8)
            ->get()
            ->map(fn ($item) => [
                'merchant' => $item->merchant,
                'total' => (int) $item->total,
                'revenue' => round($item->revenue ?? 0, 2),
            ]);

        $trendQuery = $this->scopeVisibleOrders($user);
        if ($dateRange !== 'all_time') {
            $dates = $this->getDateRange($dateRange);
            $trendQuery->whereBetween($dateColumn, [$dates['start'], $dates['end']]);
        } else {
            $trendQuery->where($dateColumn, '>=', Carbon::now()->subDays(30));
        }

        $dailyTrend = $trendQuery
            ->select(
                DB::raw("DATE({$dateColumn}) as date"),
                DB::raw('count(*) as orders'),
                DB::raw('sum(amount) as revenue'),
                DB::raw('sum(case when LOWER(status) IN ("delivered", "completed") then 1 else 0 end) as delivered')
            )
            ->groupBy('date')
            ->orderBy('date')
            ->get()
            ->map(fn ($item) => [
                'date' => $item->date,
                'orders' => (int) $item->orders,
                'revenue' => round($item->revenue ?? 0, 2),
                'delivered' => (int) $item->delivered,
            ]);

        $topProducts = (clone $query)
            ->select(
                'product_name',
                DB::raw('count(*) as total'),
                DB::raw('sum(quantity) as quantity'),
                DB::raw('sum(amount) as revenue')
            )
            ->whereNotNull('product_name')
            ->where('product_name', '!=', '')
            ->groupBy('product_name')
            ->orderByDesc('total')
            ->limit(8)
            ->get()
            ->map(fn ($item) => [
                'product_name' => $item->product_name,
                'total' => (int) $item->total,
                'quantity' => (int) $item->quantity,
                'revenue' => round($item->revenue ?? 0, 2),
            ]);

        $ordersByCountry = (clone $query)
            ->select('country', DB::raw('count(*) as total'), DB::raw('sum(amount) as revenue'))
            ->whereNotNull('country')
            ->where('country', '!=', '')
            ->groupBy('country')
            ->orderByDesc('total')
            ->limit(8)
            ->get()
            ->map(fn ($item) => [
                'country' => $item->country,
                'total' => (int) $item->total,
                'revenue' => round($item->revenue ?? 0, 2),
            ]);

        $recentOrders = (clone $query)
            ->orderBy('order_date', 'desc')
            ->limit(12)
            ->get()
            ->map(fn ($order) => [
                'id' => $order->id,
                'order_no' => $order->order_no,
                'order_date' => $order->order_date,
                'client_name' => $order->client_name,
                'amount' => round($order->amount ?? 0, 2),
                'quantity' => $order->quantity,
                'status' => $order->status,
                'cc_email' => $order->cc_email,
                'merchant' => $order->merchant,
                'product_name' => $order->product_name,
                'country' => $order->country,
                'city' => $order->city,
            ]);

        $statusRates = $this->computeStatusRates($ordersByStatus, $totalOrders);

        return [
            'summary' => $summary,
            'ordersByStatus' => $ordersByStatus,
            'rates' => $statusRates,
            'agentPerformance' => $agentPerformance,
            'overdueScheduled' => $overdueScheduled,
            'overdueScheduledSummary' => $overdueScheduledSummary,
            'overduePending' => $overduePending,
            'overduePendingSummary' => $overduePendingSummary,
            'ordersByMerchant' => $ordersByMerchant,
            'dailyTrend' => $dailyTrend,
            'topProducts' => $topProducts,
            'ordersByCountry' => $ordersByCountry,
            'recentOrders' => $recentOrders,
            'filterOptions' => $this->filterOptions($user),
            'filters' => [
                'date_range' => $dateRange,
                'date_field' => $dateColumn,
                'cc_email' => $ccEmail,
                'merchant' => $merchant,
                'status' => $status,
                'country' => $country,
                'product' => $product,
            ],
        ];
    }

    private function filteredBaseQuery(User $user, array $filters): Builder
    {
        $query = $this->scopeVisibleOrders($user);

        if ($filters['date_range'] !== 'all_time') {
            $dates = $this->getDateRange($filters['date_range']);
            $query->whereBetween($filters['date_field'], [$dates['start'], $dates['end']]);
        }

        if ($filters['cc_email']) {
            $query->where('cc_email', $filters['cc_email']);
        }

        if ($filters['merchant'] && ! $this->isMerchant($user)) {
            $query->where('merchant', $filters['merchant']);
        }

        if ($filters['status']) {
            $query->where('status', $filters['status']);
        }

        if ($filters['country']) {
            $query->where('country', $filters['country']);
        }

        if ($filters['product']) {
            $query->whereRaw('LOWER(TRIM(product_name)) = ?', [strtolower(trim($filters['product']))]);
        }

        return $query;
    }

    private function normalizeFilters(array $filters): array
    {
        $dateField = $filters['date_field'] ?? 'order_date';

        return [
            'date_range' => $filters['date_range'] ?? 'all_time',
            'date_field' => in_array($dateField, ['order_date', 'delivery_date'], true) ? $dateField : 'order_date',
            'cc_email' => $filters['cc_email'] ?? null,
            'merchant' => $filters['merchant'] ?? null,
            'status' => $filters['status'] ?? null,
            'country' => $filters['country'] ?? null,
            'product' => $filters['product'] ?? null,
        ];
    }

    private function filterOptions(User $user): array
    {
        return Cache::remember(
            sprintf(
                'stats-filter-options:v2:user:%s:role:%s:user-country:%s:session-country:%s:name:%s',
                $user->getKey(),
                strtolower(trim((string) $user->roles)),
                strtolower(trim((string) CountryAccess::userCountryName($user))),
                strtolower(trim((string) session('selected_country', ''))),
                strtolower(trim((string) $user->name))
            ),
            now()->addMinutes(5),
            function () use ($user): array {
                return [
                    'ccEmails' => User::where('roles', 'callcenter1')
                        ->when(! CountryAccess::hasGlobalAccess($user), fn ($query) => $query->where('country_id', $user->country_id))
                        ->whereNotNull('username')
                        ->orderBy('username')
                        ->pluck('username'),
                    'merchants' => $this->merchantOptions($user),
                    'statuses' => $this->scopeVisibleOrders($user)
                        ->select('status')
                        ->distinct()
                        ->whereNotNull('status')
                        ->where('status', '!=', '')
                        ->orderBy('status')
                        ->pluck('status'),
                    'countries' => collect(CountryAccess::allowedCountries(
                        $user,
                        $this->scopeVisibleOrders($user)
                            ->select('country')
                            ->distinct()
                            ->whereNotNull('country')
                            ->where('country', '!=', '')
                            ->orderBy('country')
                            ->pluck('country')
                    ))->values(),
                ];
            }
        );
    }

    private function cacheKey(User $user, array $filters): string
    {
        ksort($filters);

        return sprintf(
            'stats-report:v2:user:%s:role:%s:user-country:%s:session-country:%s:name:%s:%s',
            $user->getKey(),
            strtolower(trim((string) $user->roles)),
            strtolower(trim((string) CountryAccess::userCountryName($user))),
            strtolower(trim((string) session('selected_country', ''))),
            strtolower(trim((string) $user->name)),
            sha1(json_encode($filters))
        );
    }

    private function scopeVisibleOrders(User $user): Builder
    {
        $query = CountryAccess::scopeByCountryName(SheetOrder::query(), $user);

        if ($this->isMerchant($user)) {
            $query->where('merchant', $user->name);
        }

        return $query;
    }

    private function isMerchant(User $user): bool
    {
        return strtolower(trim((string) $user->roles)) === 'merchant';
    }

    private function merchantOptions(User $user)
    {
        if ($this->isMerchant($user)) {
            return collect([$user->name])->filter()->values();
        }

        return User::where('roles', 'merchant')
            ->when(! CountryAccess::hasGlobalAccess($user), fn ($query) => $query->where('country_id', $user->country_id))
            ->whereNotNull('username')
            ->orderBy('username')
            ->pluck('username');
    }

    private function computeStatusRates($ordersByStatus, int $totalOrders): array
    {
        $statusCounts = [];

        foreach ($ordersByStatus as $item) {
            $key = strtolower(trim((string) $item['status']));
            $statusCounts[$key] = $item['total'];
        }

        $groups = [
            'delivered' => ['delivered', 'completed'],
            'cancelled' => ['cancel', 'cancelled', 'cancelled.'],
            'scheduled' => ['schedule', 'scheduled'],
            'pending' => ['pending', 'new orders', 'pending, followup', 'follow up', 'followup'],
            'dispatched' => ['dispatc', 'dispatched'],
            'returned' => ['return', 'returned'],
            'expired' => ['expired', 'out of stock', 'outofstock'],
            'duplicate' => ['dublicate', 'duplicate'],
            'incomplete' => ['incomplete contact', 'incomplete number', 'wrong contact', 'wrong number', 'wrongcontact'],
            'foreign' => ['foreign contact'],
            'messages' => ['messages'],
            'rescheduled' => ['rescheduled'],
            'status' => ['status'],
        ];

        $groupedCounts = [];
        foreach ($groups as $groupKey => $keywords) {
            $groupedCounts[$groupKey] = 0;
            foreach ($keywords as $keyword) {
                if (isset($statusCounts[$keyword])) {
                    $groupedCounts[$groupKey] += $statusCounts[$keyword];
                }
            }
        }

        $others = $totalOrders;
        foreach ($groupedCounts as $count) {
            $others -= $count;
        }
        $groupedCounts['others'] = max(0, $others);

        $rates = ['totalOrders' => $totalOrders];
        foreach ($groupedCounts as $key => $count) {
            $rates["{$key}Count"] = $count;
            $rates["{$key}Rate"] = $totalOrders > 0
                ? round(($count / $totalOrders) * 100, 1)
                : 0;
        }

        return $rates;
    }

    private function getDateRange(string $range): array
    {
        $now = Carbon::now();

        return match ($range) {
            'today' => [
                'start' => $now->copy()->startOfDay(),
                'end' => $now->copy()->endOfDay(),
            ],
            'yesterday' => [
                'start' => $now->copy()->subDay()->startOfDay(),
                'end' => $now->copy()->subDay()->endOfDay(),
            ],
            'this_week' => [
                'start' => $now->copy()->startOfWeek(),
                'end' => $now->copy()->endOfWeek(),
            ],
            'last_week' => [
                'start' => $now->copy()->subWeek()->startOfWeek(),
                'end' => $now->copy()->subWeek()->endOfWeek(),
            ],
            'this_month' => [
                'start' => $now->copy()->startOfMonth(),
                'end' => $now->copy()->endOfMonth(),
            ],
            'last_month' => [
                'start' => $now->copy()->subMonth()->startOfMonth(),
                'end' => $now->copy()->subMonth()->endOfMonth(),
            ],
            'this_year' => [
                'start' => $now->copy()->startOfYear(),
                'end' => $now->copy()->endOfYear(),
            ],
            'last_30_days' => [
                'start' => $now->copy()->subDays(30)->startOfDay(),
                'end' => $now->copy()->endOfDay(),
            ],
            'last_90_days' => [
                'start' => $now->copy()->subDays(90)->startOfDay(),
                'end' => $now->copy()->endOfDay(),
            ],
            'all_time' => [
                'start' => Carbon::parse('2000-01-01'),
                'end' => $now->copy()->endOfDay(),
            ],
            default => [
                'start' => Carbon::parse('2000-01-01'),
                'end' => $now->copy()->endOfDay(),
            ],
        };
    }
}
