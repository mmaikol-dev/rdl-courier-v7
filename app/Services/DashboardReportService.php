<?php

namespace App\Services;

use App\Models\SheetOrder;
use App\Models\User;
use App\Support\CountryAccess;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class DashboardReportService
{
    public function build(User $user, ?string $period = null, ?string $product = null): array
    {
        $user->loadMissing('country');

        return Cache::remember(
            $this->cacheKey($user, $period, $product),
            now()->addSeconds(60),
            fn (): array => $this->buildPayload($user, $period, $product)
        );
    }

    private function buildPayload(User $user, ?string $period = null, ?string $product = null): array
    {
        $baseQuery = $this->applyProductFilter(
            $this->applyPeriodFilter($this->baseQuery($user), $period),
            $product
        );
        $userName = $user->name;
        $userRole = $user->roles;

        $monthlyData = (clone $baseQuery)
            ->selectRaw("
                DATE_FORMAT(order_date, '%Y-%m') as month,
                COUNT(*) as total,
                SUM(COALESCE(amount, 0)) as revenue
            ")
            ->whereNotNull('order_date')
            ->groupBy('month')
            ->orderBy('month', 'DESC')
            ->limit(12)
            ->get()
            ->reverse()
            ->values();

        $chartData = $monthlyData->map(function ($item) {
            $dateObj = Carbon::parse($item->month.'-01');

            return [
                'month' => $dateObj->format('F Y'),
                'total' => (int) $item->total,
                'revenue' => (float) $item->revenue,
            ];
        });

        $statusSummary = (clone $baseQuery)
            ->select(
                'status',
                DB::raw('COUNT(*) as totalOrders'),
                DB::raw('SUM(COALESCE(amount, 0)) as totalAmount')
            )
            ->whereNotNull('status')
            ->groupBy('status')
            ->orderByDesc('totalOrders')
            ->get()
            ->map(fn ($item) => [
                'status' => $item->status ?: 'Unknown',
                'totalOrders' => (int) $item->totalOrders,
                'totalAmount' => (float) $item->totalAmount,
            ]);

        $overallMetrics = (clone $baseQuery)
            ->selectRaw('
                COUNT(*) as total_orders,
                SUM(COALESCE(amount, 0)) as total_revenue,
                AVG(COALESCE(amount, 0)) as avg_order_value,
                COUNT(DISTINCT client_name) as total_customers
            ')
            ->first();

        $currentMonthStart = Carbon::now()->startOfMonth();
        $lastMonthStart = Carbon::now()->subMonth()->startOfMonth();
        $lastMonthEnd = Carbon::now()->subMonth()->endOfMonth();

        $currentMonth = (clone $baseQuery)
            ->where('order_date', '>=', $currentMonthStart)
            ->selectRaw('COUNT(*) as orders, SUM(COALESCE(amount, 0)) as revenue')
            ->first();

        $previousMonth = (clone $baseQuery)
            ->whereBetween('order_date', [$lastMonthStart, $lastMonthEnd])
            ->selectRaw('COUNT(*) as orders, SUM(COALESCE(amount, 0)) as revenue')
            ->first();

        $orderGrowth = $previousMonth->orders > 0
            ? (($currentMonth->orders - $previousMonth->orders) / $previousMonth->orders) * 100
            : 0;

        $revenueGrowth = $previousMonth->revenue > 0
            ? (($currentMonth->revenue - $previousMonth->revenue) / $previousMonth->revenue) * 100
            : 0;

        $pendingOrders = (clone $baseQuery)->where('status', 'Pending')->count();
        $completedOrders = (clone $baseQuery)->where('status', 'Delivered')->count();
        $scheduledOrders = (clone $baseQuery)->where('status', 'Scheduled')->count();
        $cancelledOrders = (clone $baseQuery)->where('status', 'Cancelled')->count();

        $completedOrScheduled = $completedOrders + $scheduledOrders;

        $confirmationRate = $overallMetrics->total_orders > 0
            ? ($completedOrScheduled / $overallMetrics->total_orders) * 100
            : 0;

        $cancellationRate = $overallMetrics->total_orders > 0
            ? ($cancelledOrders / $overallMetrics->total_orders) * 100
            : 0;

        $topProducts = (clone $baseQuery)
            ->select(
                'product_name',
                DB::raw('COUNT(*) as order_count'),
                DB::raw('SUM(COALESCE(quantity, 0)) as total_quantity'),
                DB::raw('SUM(COALESCE(amount, 0)) as total_revenue')
            )
            ->whereNotNull('product_name')
            ->where('product_name', '!=', '')
            ->groupBy('product_name')
            ->orderByDesc('total_quantity')
            ->limit(5)
            ->get()
            ->map(fn ($item) => [
                'product_name' => $item->product_name,
                'order_count' => (int) $item->order_count,
                'total_quantity' => (int) $item->total_quantity,
                'total_revenue' => (float) $item->total_revenue,
            ]);

        $topAgents = (clone $baseQuery)
            ->select(
                'agent',
                DB::raw('COUNT(*) as order_count'),
                DB::raw('SUM(COALESCE(amount, 0)) as total_revenue')
            )
            ->whereNotNull('agent')
            ->where('agent', '!=', '')
            ->groupBy('agent')
            ->orderByDesc('total_revenue')
            ->limit(5)
            ->get()
            ->map(fn ($item) => [
                'agent' => $item->agent,
                'order_count' => (int) $item->order_count,
                'total_revenue' => (float) $item->total_revenue,
            ]);

        $recentOrders = (clone $baseQuery)
            ->select(
                'id',
                'order_date',
                'order_no',
                'client_name',
                'product_name',
                'quantity',
                'status',
                'amount',
                'agent'
            )
            ->orderBy('order_date', 'DESC')
            ->limit(10)
            ->get()
            ->map(fn ($item) => [
                'id' => $item->id,
                'order_date' => $item->order_date,
                'order_no' => $item->order_no,
                'client_name' => $item->client_name,
                'product_name' => $item->product_name,
                'quantity' => (int) $item->quantity,
                'status' => $item->status,
                'amount' => (float) $item->amount,
                'agent' => $item->agent,
            ]);

        $countryDistribution = (clone $baseQuery)
            ->select(
                'country',
                DB::raw('COUNT(*) as order_count'),
                DB::raw('SUM(COALESCE(amount, 0)) as total_revenue')
            )
            ->whereNotNull('country')
            ->where('country', '!=', '')
            ->groupBy('country')
            ->orderByDesc('order_count')
            ->limit(10)
            ->get()
            ->map(fn ($item) => [
                'country' => $item->country,
                'order_count' => (int) $item->order_count,
                'total_revenue' => (float) $item->total_revenue,
            ]);

        $cityDistribution = (clone $baseQuery)
            ->select(
                'city',
                DB::raw('COUNT(*) as order_count'),
                DB::raw('SUM(COALESCE(amount, 0)) as total_revenue')
            )
            ->whereNotNull('city')
            ->where('city', '!=', '')
            ->groupBy('city')
            ->orderByDesc('order_count')
            ->limit(10)
            ->get()
            ->map(fn ($item) => [
                'city' => $item->city,
                'order_count' => (int) $item->order_count,
                'total_revenue' => (float) $item->total_revenue,
            ]);

        $productPerformance = (clone $baseQuery)
            ->select(
                'product_name',
                DB::raw('COUNT(*) as total_leads'),
                DB::raw("SUM(CASE WHEN status = 'Delivered' THEN 1 ELSE 0 END) as delivered_count"),
                DB::raw("SUM(CASE WHEN status = 'Scheduled' THEN 1 ELSE 0 END) as scheduled_count"),
                DB::raw("SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) as cancelled_count"),
                DB::raw("SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending_count"),
                DB::raw("SUM(CASE WHEN status = 'Returned' THEN 1 ELSE 0 END) as returned_count"),
                DB::raw("SUM(CASE WHEN status = 'Delivered' THEN COALESCE(amount, 0) ELSE 0 END) as delivered_revenue")
            )
            ->whereNotNull('product_name')
            ->where('product_name', '!=', '')
            ->groupBy('product_name')
            ->orderByDesc('delivered_revenue')
            ->get()
            ->map(function ($item) {
                $totalLeads = (int) $item->total_leads;
                $delivered = (int) $item->delivered_count;
                $scheduled = (int) $item->scheduled_count;
                $pending = (int) $item->pending_count;
                $cancelled = (int) $item->cancelled_count;
                $returned = (int) $item->returned_count;
                $confirmed = $delivered + $scheduled;
                $deliveredRevenue = (float) $item->delivered_revenue;
                $aov = $delivered > 0 ? round($deliveredRevenue / $delivered, 2) : 0;
                $totalRevenue = $delivered * $aov;

                return [
                    'product_name' => $item->product_name,
                    'total_leads' => $totalLeads,
                    'delivered_count' => $delivered,
                    'scheduled_count' => $scheduled,
                    'pending_count' => $pending,
                    'cancelled_count' => $cancelled,
                    'returned_count' => $returned,
                    'total_revenue' => $totalRevenue,
                    'pending_rate' => $totalLeads > 0
                        ? round(($pending / $totalLeads) * 100, 1)
                        : 0,
                    'delivered_rate' => $confirmed > 0
                        ? round(($delivered / $confirmed) * 100, 1)
                        : 0,
                    'in_delivery_rate' => $confirmed > 0
                        ? round(($scheduled / $confirmed) * 100, 1)
                        : 0,
                    'confirmed_rate' => $totalLeads > 0
                        ? round(($confirmed / $totalLeads) * 100, 1)
                        : 0,
                    'cancelled_rate' => $totalLeads > 0
                        ? round(($cancelled / $totalLeads) * 100, 1)
                        : 0,
                    'returned_rate' => $confirmed > 0
                        ? round(($returned / $confirmed) * 100, 1)
                        : 0,
                    'global_rate' => $totalLeads > 0
                        ? round(($delivered / $totalLeads) * 100, 1)
                        : 0,
                    'aov' => $aov,
                ];
            });

        $orderTypeDistribution = (clone $baseQuery)
            ->select(
                'order_type',
                DB::raw('COUNT(*) as order_count'),
                DB::raw('SUM(COALESCE(amount, 0)) as total_revenue')
            )
            ->whereNotNull('order_type')
            ->where('order_type', '!=', '')
            ->groupBy('order_type')
            ->orderByDesc('order_count')
            ->get()
            ->map(fn ($item) => [
                'order_type' => $item->order_type,
                'order_count' => (int) $item->order_count,
                'total_revenue' => (float) $item->total_revenue,
            ]);

        $totalOrders = $overallMetrics->total_orders;

        $deliveredOrScheduledCount = (clone $baseQuery)
            ->where(function ($q) {
                $q->where('status', 'Delivered')
                  ->orWhere(function ($q) {
                      $q->where('status', 'Scheduled')
                        ->whereNotNull('code')
                        ->where('code', '!=', '');
                  });
            })
            ->count();

        $deliveryRate = $completedOrScheduled > 0
            ? ($completedOrders / $completedOrScheduled) * 100
            : 0;

        $rateFromLead = $totalOrders > 0
            ? ($completedOrders / $totalOrders) * 100
            : 0;

        return [
            'period' => $period,
            'product' => $product,
            'userName' => $userName,
            'userRole' => $userRole,
            'chartData' => $chartData,
            'statusSummary' => $statusSummary,
            'metrics' => [
                'totalOrders' => (int) $overallMetrics->total_orders,
                'totalRevenue' => (float) $overallMetrics->total_revenue,
                'avgOrderValue' => (float) $overallMetrics->avg_order_value,
                'totalCustomers' => (int) $overallMetrics->total_customers,
                'pendingOrders' => $pendingOrders,
                'completedOrders' => $completedOrders,
                'cancelledOrders' => $cancelledOrders,
                'deliveredOrScheduledCount' => $deliveredOrScheduledCount,
                'rateFromLead' => round($rateFromLead, 1),
                'completionRate' => round($confirmationRate, 1),
                'completedOrders' => $completedOrders,
                'scheduledOrders' => $scheduledOrders,
                'cancellationRate' => round($cancellationRate, 1),
                'deliveryRate' => round($deliveryRate, 1),
            ],
            'growth' => [
                'orders' => round($orderGrowth, 1),
                'revenue' => round($revenueGrowth, 1),
                'currentMonth' => [
                    'orders' => (int) $currentMonth->orders,
                    'revenue' => (float) $currentMonth->revenue,
                ],
                'previousMonth' => [
                    'orders' => (int) $previousMonth->orders,
                    'revenue' => (float) $previousMonth->revenue,
                ],
            ],
            'productPerformance' => $productPerformance,
            'topProducts' => $topProducts,
            'topAgents' => $topAgents,
            'recentOrders' => $recentOrders,
            'countryDistribution' => $countryDistribution,
            'cityDistribution' => $cityDistribution,
            'orderTypeDistribution' => $orderTypeDistribution,
            'deliveryStats' => [
                'totalWithDelivery' => (int) $totalOrders,
                'delivered' => (int) $deliveredOrScheduledCount,
                'pendingDelivery' => (int) ($totalOrders - $deliveredOrScheduledCount),
                'deliveryRate' => round($deliveryRate, 1),
            ],
        ];
    }

    private function baseQuery(User $user): Builder
    {
        $query = CountryAccess::scopeByCountryName(SheetOrder::query(), $user);

        if ($user->roles === 'merchant') {
            $query->where('merchant', $user->name);
        }

        return $query;
    }

    private function applyPeriodFilter(Builder $query, ?string $period): Builder
    {
        return match ($period) {
            'today' => $query->whereDate('order_date', Carbon::today()),
            'last7Days' => $query->where('order_date', '>=', Carbon::today()->subDays(7)),
            'last30Days' => $query->where('order_date', '>=', Carbon::today()->subDays(30)),
            'thisMonth' => $query->where('order_date', '>=', Carbon::now()->startOfMonth()),
            default => $query,
        };
    }

    private function applyProductFilter(Builder $query, ?string $product): Builder
    {
        if (! $product) {
            return $query;
        }

        return $query->whereRaw('LOWER(TRIM(product_name)) = ?', [strtolower(trim($product))]);
    }

    private function cacheKey(User $user, ?string $period = null, ?string $product = null): string
    {
        $role = strtolower(trim((string) $user->roles));
        $selectedCountry = strtolower(trim((string) session('selected_country', '')));
        $fallback = strtolower(trim((string) CountryAccess::userCountryName($user)));

        return sprintf(
            'dashboard-report:v4:user:%s:role:%s:country:%s:period:%s:product:%s',
            $user->getKey(),
            $role,
            $selectedCountry ?: $fallback,
            $period ?? 'allTime',
            strtolower(trim((string) $product)) ?: 'all'
        );
    }
}
