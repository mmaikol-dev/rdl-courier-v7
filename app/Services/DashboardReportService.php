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
    public function build(User $user): array
    {
        $user->loadMissing('country');

        return Cache::remember(
            $this->cacheKey($user),
            now()->addSeconds(60),
            fn (): array => $this->buildPayload($user)
        );
    }

    private function buildPayload(User $user): array
    {
        $baseQuery = $this->baseQuery($user);
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
            $dateObj = Carbon::parse($item->month . '-01');

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
            ->selectRaw("
                COUNT(*) as total_orders,
                SUM(COALESCE(amount, 0)) as total_revenue,
                AVG(COALESCE(amount, 0)) as avg_order_value,
                COUNT(DISTINCT client_name) as total_customers
            ")
            ->first();

        $currentMonthStart = Carbon::now()->startOfMonth();
        $lastMonthStart = Carbon::now()->subMonth()->startOfMonth();
        $lastMonthEnd = Carbon::now()->subMonth()->endOfMonth();

        $currentMonth = (clone $baseQuery)
            ->where('order_date', '>=', $currentMonthStart)
            ->selectRaw("
                COUNT(*) as orders,
                SUM(COALESCE(amount, 0)) as revenue
            ")
            ->first();

        $previousMonth = (clone $baseQuery)
            ->whereBetween('order_date', [$lastMonthStart, $lastMonthEnd])
            ->selectRaw("
                COUNT(*) as orders,
                SUM(COALESCE(amount, 0)) as revenue
            ")
            ->first();

        $orderGrowth = $previousMonth->orders > 0
            ? (($currentMonth->orders - $previousMonth->orders) / $previousMonth->orders) * 100
            : 0;

        $revenueGrowth = $previousMonth->revenue > 0
            ? (($currentMonth->revenue - $previousMonth->revenue) / $previousMonth->revenue) * 100
            : 0;

        $pendingOrders = (clone $baseQuery)->where('status', 'Pending')->count();
        $completedOrders = (clone $baseQuery)->where('status', 'Completed')->count();
        $cancelledOrders = (clone $baseQuery)->where('status', 'Cancelled')->count();

        $completionRate = $overallMetrics->total_orders > 0
            ? ($completedOrders / $overallMetrics->total_orders) * 100
            : 0;

        $cancellationRate = $overallMetrics->total_orders > 0
            ? ($cancelledOrders / $overallMetrics->total_orders) * 100
            : 0;

        $today = Carbon::today();
        $last7Days = Carbon::now()->subDays(7);
        $last30Days = Carbon::now()->subDays(30);

        $todayStats = (clone $baseQuery)
            ->whereDate('order_date', $today)
            ->selectRaw('COUNT(*) as orders, SUM(COALESCE(amount, 0)) as revenue')
            ->first();

        $last7DaysStats = (clone $baseQuery)
            ->where('order_date', '>=', $last7Days)
            ->selectRaw('COUNT(*) as orders, SUM(COALESCE(amount, 0)) as revenue')
            ->first();

        $last30DaysStats = (clone $baseQuery)
            ->where('order_date', '>=', $last30Days)
            ->selectRaw('COUNT(*) as orders, SUM(COALESCE(amount, 0)) as revenue')
            ->first();

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

        $deliveryStats = (clone $baseQuery)
            ->selectRaw("
                COUNT(*) as total_orders_with_delivery,
                COUNT(CASE WHEN delivery_date IS NOT NULL AND delivery_date <= NOW() THEN 1 END) as delivered_orders,
                COUNT(CASE WHEN delivery_date IS NOT NULL AND delivery_date > NOW() THEN 1 END) as pending_delivery
            ")
            ->first();

        $deliveryRate = $deliveryStats->total_orders_with_delivery > 0
            ? ($deliveryStats->delivered_orders / $deliveryStats->total_orders_with_delivery) * 100
            : 0;

        return [
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
                'completionRate' => round($completionRate, 1),
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
            'timeStats' => [
                'today' => [
                    'orders' => (int) $todayStats->orders,
                    'revenue' => (float) $todayStats->revenue,
                ],
                'last7Days' => [
                    'orders' => (int) $last7DaysStats->orders,
                    'revenue' => (float) $last7DaysStats->revenue,
                ],
                'last30Days' => [
                    'orders' => (int) $last30DaysStats->orders,
                    'revenue' => (float) $last30DaysStats->revenue,
                ],
            ],
            'topProducts' => $topProducts,
            'topAgents' => $topAgents,
            'recentOrders' => $recentOrders,
            'countryDistribution' => $countryDistribution,
            'cityDistribution' => $cityDistribution,
            'orderTypeDistribution' => $orderTypeDistribution,
            'deliveryStats' => [
                'totalWithDelivery' => (int) $deliveryStats->total_orders_with_delivery,
                'delivered' => (int) $deliveryStats->delivered_orders,
                'pendingDelivery' => (int) $deliveryStats->pending_delivery,
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

    private function cacheKey(User $user): string
    {
        return sprintf(
            'dashboard-report:v1:user:%s:role:%s:country:%s',
            $user->getKey(),
            strtolower(trim((string) $user->roles)),
            strtolower(trim((string) CountryAccess::userCountryName($user)))
        );
    }
}
