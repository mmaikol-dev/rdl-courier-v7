export type DashboardRange = 'today' | 'last7Days' | 'last30Days' | 'thisMonth' | 'allTime';

export interface DashboardNeedsYouCounts {
    toConfirm: number;
    outOfStock: number;
    toPrepare: number;
    readyForCourier: number;
    expectedBack: number;
    cashUpsToSettle: number;
}

export interface DashboardPageProps {
    [key: string]: unknown;

    range?: DashboardRange;
    period?: Exclude<DashboardRange, 'allTime'> | null;
    country?: string | null;
    countryLabel: string;
    product?: string | null;
    countryOptions: string[];
    productOptions: string[];
    needsYou: DashboardNeedsYouCounts;
    needsYouSample: boolean;
    dashboardReport?: DashboardReportData;
    kpiMetrics: {
        totalLeads: number;
        duplicateLeads: number;
        totalOrders: number;
        totalRevenue: number;
        confirmedOrders: number;
        deliveredOrders: number;
        pendingOrders: number;
        shippedOrders: number;
        returnedOrders: number;
        remittedAmount: number;
        productsCount: number;
        stockAvailable: number;
        lowStockProducts: number;
        codCollected: number | null;
        courierHeldAmount: number | null;
        upsellRate: number | null;
        confirmationRate: number;
        deliveryRate: number;
        returnRate: number;
        averageOrderValue: number;
    };
    chartData: { month: string; total: number; revenue: number }[];
    dailyTrend: {
        date: string;
        label: string;
        orders: number;
        delivered: number;
        revenue: number;
        deliveredRevenue: number;
        previousOrders: number;
        previousDelivered: number;
        previousRevenue: number;
    }[];
    statusSummary: { status: string; totalOrders: number; totalAmount: number }[];
    userName: string;
    userRole: string;
    metrics: {
        totalOrders: number;
        totalRevenue: number;
        avgOrderValue: number;
        totalCustomers: number;
        pendingOrders: number;
        completedOrders: number;
        cancelledOrders?: number;
        scheduledOrders: number;
        deliveredOrScheduledCount: number;
        rateFromLead: number;
        completionRate: number;
        cancellationRate: number;
        deliveryRate: number;
    };
    growth: {
        orders: number;
        revenue: number;
        currentMonth: { orders: number; revenue: number };
        previousMonth: { orders: number; revenue: number };
    };
    topProducts?: Array<{
        product_name: string;
        order_count: number;
        confirmed_count: number;
        total_quantity: number;
        total_revenue: number;
    }>;
    productPerformance?: Array<{
        product_name: string;
        total_leads: number;
        delivered_count: number;
        scheduled_count: number;
        pending_count: number;
        cancelled_count: number;
        returned_count: number;
        total_revenue: number;
        pending_rate: number;
        delivered_rate: number;
        in_delivery_rate: number;
        confirmed_rate: number;
        cancelled_rate: number;
        returned_rate: number;
        global_rate: number;
        aov: number;
    }>;
    recentOrders?: Array<{
        id: number;
        order_date: string;
        order_no: string;
        client_name: string;
        product_name: string;
        quantity: number;
        status: string;
        amount: number;
        agent: string;
    }>;
    orderTypeDistribution?: Array<{
        order_type: string;
        order_count: number;
        total_revenue: number;
    }>;
    deliveryStats?: {
        totalWithDelivery: number;
        delivered: number;
        pendingDelivery: number;
        deliveryRate: number;
    };
}

export type DashboardReportData = Pick<
    DashboardPageProps,
    | 'countryOptions'
    | 'productOptions'
    | 'userName'
    | 'userRole'
    | 'chartData'
    | 'dailyTrend'
    | 'statusSummary'
    | 'metrics'
    | 'kpiMetrics'
    | 'topProducts'
    | 'productPerformance'
    | 'recentOrders'
    | 'deliveryStats'
>;
