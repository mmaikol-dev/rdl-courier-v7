"use client"

import AppLayout from '@/layouts/app-layout'
import { type BreadcrumbItem } from '@/types'
import { Deferred, Head, usePage } from '@inertiajs/react'
import {
    Package,
    PackageCheck,
    Clock,
    XCircle,
    ArrowDownRight,
    Activity,
    DollarSign,
    ShoppingCart,
    ChevronLeft,
    ChevronRight,
    AlertCircle,
    CheckCircle,
    RefreshCw,
    Truck,
    Banknote,
    ShoppingBag,
    Inbox,
    BadgeCheck,
    PackageCheck as DeliveredIcon,
    HandCoins,
    PhoneCall,
    Undo2,
    Wallet,
    CircleCheck,
    Boxes,
    TrendingUp
} from "lucide-react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useState, useMemo } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { LucideIcon } from "lucide-react"
import { PageHeader } from "@/components/dashboard/page-header"
import { NeedsYouBanner } from "@/components/dashboard/needs-you-banner"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { RateStrip } from "@/components/dashboard/rate-strip"
import { DailyTrendCard } from "@/components/dashboard/daily-trend-card"
import { TopProductsCard } from "@/components/dashboard/top-products-card"
import type { DashboardPageProps, DashboardReportData } from "@/types/dashboard"
import { Skeleton } from "@/components/ui/skeleton"

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/dashboard' },
]

const emptyDashboardReport: DashboardReportData = {
    countryOptions: [],
    productOptions: [],
    userName: '',
    userRole: '',
    chartData: [],
    dailyTrend: [],
    statusSummary: [],
    metrics: {
        totalOrders: 0,
        totalRevenue: 0,
        avgOrderValue: 0,
        totalCustomers: 0,
        pendingOrders: 0,
        completedOrders: 0,
        cancelledOrders: 0,
        scheduledOrders: 0,
        deliveredOrScheduledCount: 0,
        rateFromLead: 0,
        completionRate: 0,
        cancellationRate: 0,
        deliveryRate: 0,
    },
    kpiMetrics: {
        totalLeads: 0,
        duplicateLeads: 0,
        totalOrders: 0,
        totalRevenue: 0,
        confirmedOrders: 0,
        deliveredOrders: 0,
        pendingOrders: 0,
        shippedOrders: 0,
        returnedOrders: 0,
        remittedAmount: 0,
        productsCount: 0,
        stockAvailable: 0,
        lowStockProducts: 0,
        codCollected: null,
        courierHeldAmount: null,
        upsellRate: null,
        confirmationRate: 0,
        deliveryRate: 0,
        returnRate: 0,
        averageOrderValue: 0,
    },
    topProducts: [],
    productPerformance: [],
    recentOrders: [],
    deliveryStats: {
        totalWithDelivery: 0,
        delivered: 0,
        pendingDelivery: 0,
        deliveryRate: 0,
    },
}

function DashboardLoadingSkeleton() {
    return (
        <div className="space-y-4" role="status" aria-label="Loading dashboard data" aria-live="polite">
            <section aria-label="Loading key performance indicators" className="space-y-4">
                {[0, 1].map((row) => (
                    <div key={row} className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                        {Array.from({ length: 6 }).map((_, index) => (
                            <div key={index} className="min-w-0 space-y-4 rounded-2xl border bg-card p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <Skeleton className="h-4 w-20 max-w-[70%]" />
                                    <Skeleton className="size-9 shrink-0 rounded-xl" />
                                </div>
                                <Skeleton className="h-8 w-3/4 max-w-36" />
                                <Skeleton className="h-3 w-full" />
                                <Skeleton className="h-3 w-1/2" />
                            </div>
                        ))}
                    </div>
                ))}
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
                    {Array.from({ length: 5 }).map((_, index) => (
                        <div key={index} className="space-y-3 rounded-xl border bg-card p-3">
                            <Skeleton className="h-3 w-2/3" />
                            <Skeleton className="h-6 w-1/2" />
                        </div>
                    ))}
                </div>
            </section>
            <section aria-label="Loading dashboard charts" className="grid gap-4 xl:grid-cols-3">
                <div className="space-y-5 rounded-2xl border bg-card p-5 xl:col-span-2">
                    <Skeleton className="h-5 w-44" />
                    <Skeleton className="h-4 w-64 max-w-full" />
                    <Skeleton className="h-64 w-full rounded-xl" />
                </div>
                <div className="space-y-5 rounded-2xl border bg-card p-5">
                    <Skeleton className="h-5 w-36" />
                    <Skeleton className="h-4 w-52 max-w-full" />
                    {Array.from({ length: 3 }).map((_, index) => (
                        <div key={index} className="space-y-2">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-2.5 w-full rounded-full" />
                        </div>
                    ))}
                </div>
            </section>
            <div className="space-y-3 rounded-2xl border bg-card p-5">
                <Skeleton className="h-5 w-48" />
                {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-10 w-full" />
                ))}
            </div>
        </div>
    )
}

export default function Dashboard() {
    const page = usePage<DashboardPageProps & { selectedCurrency?: string }>()
    const {
        range = 'last30Days',
        country = null,
        countryLabel,
        product,
        needsYou,
        needsYouSample,
        userName,
        userRole,
    } = page.props
    const dashboardReport = page.props.dashboardReport
    const {
        countryOptions,
        productOptions,
        chartData,
        dailyTrend,
        statusSummary,
        metrics,
        kpiMetrics,
        topProducts = [],
        productPerformance = [],
        recentOrders = [],
        deliveryStats,
    } = dashboardReport ?? emptyDashboardReport

    const [currentPage, setCurrentPage] = useState(1)
    const [productPage, setProductPage] = useState(1)
    const itemsPerPage = 6
    const productsPerPage = 10

    // Format currency
    const currencyCode = page.props.selectedCurrency || 'KES'
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-' + (currencyCode === 'KES' ? 'KE' : currencyCode === 'TZS' ? 'TZ' : currencyCode === 'UGX' ? 'UG' : currencyCode === 'ZMW' ? 'ZM' : 'KE'), {
            style: 'currency',
            currency: currencyCode,
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount)
    }

    // Calculate pagination for status summary
    const paginatedStatusSummary = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage
        const endIndex = startIndex + itemsPerPage
        return statusSummary.slice(startIndex, endIndex)
    }, [statusSummary, currentPage])

    const totalPages = Math.ceil(statusSummary.length / itemsPerPage)

    // Calculate pagination for product performance
    const paginatedProductPerformance = useMemo(() => {
        const startIndex = (productPage - 1) * productsPerPage
        const endIndex = startIndex + productsPerPage
        return productPerformance.slice(startIndex, endIndex)
    }, [productPerformance, productPage])

    const totalProductPages = Math.ceil(productPerformance.length / productsPerPage)

    // Prepare chart data
    const dataForChart = useMemo(() => {
        if (!chartData || !Array.isArray(chartData)) return []
        return chartData.map(item => ({
            month: item.month?.substring(0, 3) || 'N/A',
            orders: Number(item.total) || 0,
            revenue: Number(item.revenue) || 0,
        }))
    }, [chartData])
    const orderSparkline = dataForChart.map((item) => item.orders)
    const revenueSparkline = dataForChart.map((item) => item.revenue)

    // Status configurations
    const statusConfig: Record<string, { icon: LucideIcon, color: string, bgColor: string, label: string }> = {
        'Pending': { icon: Clock, color: 'text-warning-foreground', bgColor: 'bg-warning/10 border-warning/30', label: 'Pending' },
        'Processing': { icon: Package, color: 'text-muted-foreground', bgColor: 'bg-accent border-border', label: 'Processing' },
        'Completed': { icon: PackageCheck, color: 'text-success', bgColor: 'bg-success/10 border-success/30', label: 'Completed' },
        'Cancelled': { icon: XCircle, color: 'text-destructive', bgColor: 'bg-destructive/10 border-destructive/30', label: 'Cancelled' },
        'Shipped': { icon: Truck, color: 'text-muted-foreground', bgColor: 'bg-accent border-border', label: 'Shipped' },
        'Delivered': { icon: PackageCheck, color: 'text-success', bgColor: 'bg-success/10 border-success/30', label: 'Delivered' },
        'Returned': { icon: ArrowDownRight, color: 'text-warning-foreground', bgColor: 'bg-warning/10 border-warning/30', label: 'Returned' },
        'Refunded': { icon: DollarSign, color: 'text-destructive', bgColor: 'bg-destructive/10 border-destructive/30', label: 'Refunded' },
        'On Hold': { icon: Clock, color: 'text-muted-foreground', bgColor: 'bg-muted border-border', label: 'On Hold' },
        'Failed': { icon: XCircle, color: 'text-destructive', bgColor: 'bg-destructive/10 border-destructive/30', label: 'Failed' }
    }

    // Get color for status progress bars
    const getStatusColor = (status: string) => {
        const colorMap: Record<string, string> = {
            'Completed': 'bg-success',
            'Delivered': 'bg-success',
            'Processing': 'bg-primary',
            'Shipped': 'bg-primary',
            'Pending': 'bg-primary',
            'On Hold': 'bg-primary',
            'Cancelled': 'bg-destructive',
            'Failed': 'bg-destructive',
            'Returned': 'bg-primary',
            'Refunded': 'bg-primary',
        }
        return colorMap[status] || 'bg-muted'
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Dashboard" />

            <div className="space-y-4 p-4" aria-busy={!dashboardReport}>
                <PageHeader
                    userName={userName}
                    range={range}
                    country={country}
                    countryLabel={countryLabel}
                    product={product ?? null}
                    countryOptions={countryOptions}
                    productOptions={productOptions}
                    canFilterCountries={['g.o.d', 'merchant'].includes(userRole.trim().toLowerCase())}
                    isLoading={!dashboardReport}
                />
                <Deferred
                    key={`${range}:${country ?? ''}:${product ?? ''}`}
                    data="dashboardReport"
                    fallback={<DashboardLoadingSkeleton />}
                >
                    {() => (
                      <>
                <NeedsYouBanner counts={needsYou} isSample={needsYouSample} />

                <section aria-label="Key performance indicators" className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                        <KpiCard
                            label="Total Revenue"
                            value={formatCurrency(kpiMetrics.totalRevenue)}
                            helper="Order value in the selected period"
                            icon={Wallet}
                            href="/sheetorders"
                            variant="featured"
                            sparkline={revenueSparkline}
                        />
                        <KpiCard
                            label="Total Orders"
                            value={kpiMetrics.totalOrders.toLocaleString()}
                            helper={`${kpiMetrics.duplicateLeads.toLocaleString()} duplicate records excluded`}
                            icon={ShoppingBag}
                            href="/sheetorders"
                            sparkline={orderSparkline}
                        />
                        <KpiCard
                            label="Total Leads"
                            value={kpiMetrics.totalLeads.toLocaleString()}
                            helper="Order records received in this period"
                            icon={Inbox}
                            href="/sheetorders"
                            sparkline={orderSparkline}
                        />
                        <KpiCard
                            label="Confirmed"
                            value={kpiMetrics.confirmedOrders.toLocaleString()}
                            helper={`${kpiMetrics.confirmationRate.toFixed(1)}% of leads`}
                            icon={BadgeCheck}
                            href="/sheetorders?status=Scheduled,Delivered"
                            sparkline={orderSparkline}
                        />
                        <KpiCard
                            label="Delivered"
                            value={kpiMetrics.deliveredOrders.toLocaleString()}
                            helper={`${kpiMetrics.deliveryRate.toFixed(1)}% of delivered or returned orders`}
                            icon={DeliveredIcon}
                            href="/sheetorders?status=Delivered"
                            sparkline={orderSparkline}
                        />
                        <KpiCard
                            label="COD Collected"
                            value={formatCurrency(kpiMetrics.codCollected ?? 18500)}
                            helper={kpiMetrics.codCollected === null ? 'Sample only — cash collection is not tracked' : 'Cash collected from delivered orders'}
                            icon={HandCoins}
                            href="/sheetorders?status=Delivered"
                            sparkline={revenueSparkline}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                        <KpiCard
                            label="Pending Confirmation"
                            value={kpiMetrics.pendingOrders.toLocaleString()}
                            helper="Orders with Pending status"
                            icon={PhoneCall}
                            href="/sheetorders?status=Pending"
                        />
                        <KpiCard
                            label="Shipped"
                            value={kpiMetrics.shippedOrders.toLocaleString()}
                            helper="Dispatched or shipped orders"
                            icon={Truck}
                            href="/sheetorders?status=Dispatched,Shipped"
                        />
                        <KpiCard
                            label="Returns"
                            value={kpiMetrics.returnedOrders.toLocaleString()}
                            helper="Orders marked returned"
                            icon={Undo2}
                            href="/sheetorders?status=Returned,return"
                        />
                        <KpiCard
                            label="Held by Couriers"
                            value={formatCurrency(kpiMetrics.courierHeldAmount ?? 6250)}
                            helper={kpiMetrics.courierHeldAmount === null ? 'Sample only — courier-held cash is not tracked' : 'Cash currently held by couriers'}
                            icon={Banknote}
                            href="/dispatch"
                            variant="highlight"
                        />
                        <KpiCard
                            label="Cash Reconciled"
                            value={formatCurrency(kpiMetrics.remittedAmount)}
                            helper="Order value marked as remitted"
                            icon={CircleCheck}
                            href="/finance-workflow"
                        />
                        <KpiCard
                            label="Stock Available"
                            value={kpiMetrics.stockAvailable.toLocaleString()}
                            helper={`${kpiMetrics.productsCount} products · ${kpiMetrics.lowStockProducts} low on stock`}
                            icon={Boxes}
                            href="/products"
                        />
                    </div>

                    <RateStrip items={[
                        { label: 'Confirmation rate', value: `${kpiMetrics.confirmationRate.toFixed(1)}%`, icon: BadgeCheck, href: '/sheetorders?status=Scheduled,Delivered' },
                        { label: 'Delivery rate', value: `${kpiMetrics.deliveryRate.toFixed(1)}%`, icon: DeliveredIcon, href: '/sheetorders?status=Delivered' },
                        { label: 'Return rate', value: `${kpiMetrics.returnRate.toFixed(1)}%`, icon: Undo2, href: '/sheetorders?status=Returned,return' },
                        { label: 'Upsell rate', value: `${(kpiMetrics.upsellRate ?? 12.5).toFixed(1)}%${kpiMetrics.upsellRate === null ? ' · sample' : ''}`, icon: TrendingUp, href: '/sheetorders' },
                        { label: 'Average order value', value: formatCurrency(kpiMetrics.averageOrderValue), icon: ShoppingCart, href: '/sheetorders' },
                    ]} />
                </section>

                <section aria-label="Revenue trends and top products" className="grid gap-4 xl:grid-cols-3">
                    <DailyTrendCard data={dailyTrend} range={range} formatCurrency={formatCurrency} />
                    <TopProductsCard products={topProducts} />
                </section>

                {/* Product Performance Table */}
                {productPerformance.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-xl flex items-center gap-2">
                                <Package className="h-5 w-5 text-muted-foreground" />
                                Product Performance
                            </CardTitle>
                            <CardDescription>
                                Detailed metrics per product — leads, conversion, revenue, and averages
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead className="font-semibold">Product Name</TableHead>
                                            <TableHead className="text-right font-semibold">Leads</TableHead>
                                            <TableHead className="text-right font-semibold">Confirmed</TableHead>
                                            <TableHead className="text-right font-semibold">Cancelled</TableHead>
                                            <TableHead className="text-right font-semibold">Pending</TableHead>
                                            <TableHead className="text-right font-semibold">In Delivery</TableHead>
                                            <TableHead className="text-right font-semibold">Returned</TableHead>
                                            <TableHead className="text-right font-semibold">Delivered</TableHead>
                                            <TableHead className="text-right font-semibold">Global Rate</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {paginatedProductPerformance.map((item) => (
                                            <TableRow key={item.product_name}>
                                                <TableCell className="font-medium max-w-[200px]">
                                                    <div className="truncate" title={item.product_name}>
                                                        {item.product_name}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">
                                                    {item.total_leads.toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex flex-col items-end gap-0.5">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                            item.confirmed_rate >= 70
                                                                ? 'bg-success/10 text-success'
                                                                : item.confirmed_rate >= 40
                                                                    ? 'bg-warning/10 text-warning-foreground'
                                                                    : 'bg-destructive/10 text-destructive'
                                                        }`}>
                                                            {item.confirmed_rate}%
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground tabular-nums">
                                                            {(item.delivered_count + item.scheduled_count).toLocaleString()}/{item.total_leads.toLocaleString()}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex flex-col items-end gap-0.5">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                            item.cancelled_rate >= 50
                                                                ? 'bg-destructive/10 text-destructive'
                                                                : item.cancelled_rate >= 20
                                                                    ? 'bg-warning/10 text-warning-foreground'
                                                                    : 'bg-muted text-foreground'
                                                        }`}>
                                                            {item.cancelled_rate}%
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground tabular-nums">
                                                            {item.cancelled_count.toLocaleString()}/{item.total_leads.toLocaleString()}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex flex-col items-end gap-0.5">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                            item.pending_rate >= 50
                                                                ? 'bg-warning/10 text-warning-foreground'
                                                                : item.pending_rate >= 20
                                                                    ? 'bg-warning/10 text-warning-foreground'
                                                                    : 'bg-muted text-foreground'
                                                        }`}>
                                                            {item.pending_rate}%
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground tabular-nums">
                                                            {item.pending_count.toLocaleString()}/{item.total_leads.toLocaleString()}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex flex-col items-end gap-0.5">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                            item.in_delivery_rate >= 50
                                                                ? 'bg-accent text-foreground'
                                                                : item.in_delivery_rate >= 20
                                                                    ? 'bg-warning/10 text-warning-foreground'
                                                                    : 'bg-muted text-foreground'
                                                        }`}>
                                                            {item.in_delivery_rate}%
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground tabular-nums">
                                                            {item.scheduled_count.toLocaleString()}/{(item.delivered_count + item.scheduled_count).toLocaleString()}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex flex-col items-end gap-0.5">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                            item.returned_rate >= 50
                                                                ? 'bg-warning/10 text-warning-foreground'
                                                                : item.returned_rate >= 20
                                                                    ? 'bg-warning/10 text-warning-foreground'
                                                                    : 'bg-muted text-foreground'
                                                        }`}>
                                                            {item.returned_rate}%
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground tabular-nums">
                                                            {item.returned_count.toLocaleString()}/{(item.delivered_count + item.scheduled_count).toLocaleString()}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex flex-col items-end gap-0.5">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                            item.delivered_rate >= 50
                                                                ? 'bg-success/10 text-success'
                                                                : item.delivered_rate >= 20
                                                                    ? 'bg-warning/10 text-warning-foreground'
                                                                    : 'bg-destructive/10 text-destructive'
                                                        }`}>
                                                            {item.delivered_rate}%
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground tabular-nums">
                                                            {item.delivered_count.toLocaleString()}/{(item.delivered_count + item.scheduled_count).toLocaleString()}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex flex-col items-end gap-0.5">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                            item.global_rate >= 50
                                                                ? 'bg-success/10 text-success'
                                                                : item.global_rate >= 20
                                                                    ? 'bg-warning/10 text-warning-foreground'
                                                                    : 'bg-destructive/10 text-destructive'
                                                        }`}>
                                                            {item.global_rate}%
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground tabular-nums">
                                                            {item.delivered_count.toLocaleString()}/{item.total_leads.toLocaleString()}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                        {totalProductPages > 1 && (
                            <CardFooter className="border-t pt-4">
                                <div className="flex items-center justify-between w-full">
                                    <div className="text-sm text-muted-foreground">
                                        Page {productPage} of {totalProductPages}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setProductPage(prev => Math.max(prev - 1, 1))}
                                            disabled={productPage === 1}
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setProductPage(prev => Math.min(prev + 1, totalProductPages))}
                                            disabled={productPage === totalProductPages}
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardFooter>
                        )}
                    </Card>
                )}

                {/* Bottom Section: Status Distribution and Quick Stats */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Order Status Distribution */}
                    <Card className="lg:col-span-2">
                        <CardHeader>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    <CardTitle className="text-xl">Order Status Distribution</CardTitle>
                                    <CardDescription>
                                        Showing {paginatedStatusSummary.length} of {statusSummary.length} statuses
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-6">
                                {paginatedStatusSummary.map((status) => {
                                    const config = statusConfig[status.status] || {
                                        icon: Package,
                                        color: 'text-muted-foreground',
                                        bgColor: 'bg-muted border-border',
                                        label: status.status
                                    }

                                    const Icon = config.icon
                                    const percentage = metrics.totalOrders > 0 ?
                                        (status.totalOrders / metrics.totalOrders * 100).toFixed(1) : '0.0'
                                    const avgValue = status.totalOrders > 0 ?
                                        status.totalAmount / status.totalOrders : 0

                                    return (
                                        <div key={status.status} className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-lg ${config.bgColor}`}>
                                                        <Icon className={`h-4 w-4 ${config.color}`} />
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-sm text-foreground">{config.label}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {status.totalOrders.toLocaleString()} orders • {percentage}%
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-bold text-sm text-foreground">
                                                        {formatCurrency(status.totalAmount)}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        Avg: {formatCurrency(avgValue)}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full transition-all duration-500 ${getStatusColor(status.status)}`}
                                                    style={{ width: `${percentage}%` }}
                                                />
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </CardContent>
                        {totalPages > 1 && (
                            <CardFooter className="border-t pt-4">
                                <div className="flex items-center justify-between w-full">
                                    <div className="text-sm text-muted-foreground">
                                        Page {currentPage} of {totalPages}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                            disabled={currentPage === 1}
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                            disabled={currentPage === totalPages}
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardFooter>
                        )}
                    </Card>

                    {/* Quick Stats Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-xl">Quick Stats</CardTitle>
                            <CardDescription>Key performance indicators</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-3 bg-success/10 rounded-lg">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle className="h-4 w-4 text-success" />
                                        <span className="text-sm font-medium text-foreground">Completion Rate</span>
                                    </div>
                                    <span className="font-bold text-success">{metrics.completionRate}%</span>
                                </div>

                                <div className="flex items-center justify-between p-3 bg-warning/10 rounded-lg">
                                    <div className="flex items-center gap-2">
                                        <Clock className="h-4 w-4 text-warning-foreground" />
                                        <span className="text-sm font-medium text-foreground">Pending Orders</span>
                                    </div>
                                    <span className="font-bold text-warning-foreground">{metrics.pendingOrders}</span>
                                </div>

                                <div className="flex items-center justify-between p-3 bg-destructive/10 rounded-lg">
                                    <div className="flex items-center gap-2">
                                        <AlertCircle className="h-4 w-4 text-destructive" />
                                        <span className="text-sm font-medium text-foreground">Cancellation Rate</span>
                                    </div>
                                    <span className="font-bold text-destructive">{metrics.cancellationRate}%</span>
                                </div>

                                {deliveryStats && (
                                    <div className="flex items-center justify-between p-3 bg-accent rounded-lg">
                                        <div className="flex items-center gap-2">
                                            <Truck className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-sm font-medium text-foreground">Delivery Rate</span>
                                        </div>
                                        <span className="font-bold text-muted-foreground">{deliveryStats.deliveryRate}%</span>
                                    </div>
                                )}
                            </div>

                            <div className="pt-4 border-t">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Activity className="h-3 w-3" />
                                    <span>Last updated: Just now</span>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button variant="outline" className="w-full gap-2">
                                <RefreshCw className="h-4 w-4" />
                                Refresh Data
                            </Button>
                        </CardFooter>
                    </Card>
                </div>

                {/* Recent Orders Table */}
                {recentOrders.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-xl">Recent Orders</CardTitle>
                            <CardDescription>Latest 10 orders</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Order #</TableHead>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Customer</TableHead>
                                            <TableHead>Product</TableHead>
                                            <TableHead>Qty</TableHead>
                                            <TableHead>Agent</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Amount</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {recentOrders.map((order) => (
                                            <TableRow key={order.id}>
                                                <TableCell className="font-medium">{order.order_no || `#${order.id}`}</TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    {new Date(order.order_date).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell className="text-sm">{order.client_name || 'N/A'}</TableCell>
                                                <TableCell className="text-sm max-w-[150px] truncate">{order.product_name || 'N/A'}</TableCell>
                                                <TableCell className="text-sm">{order.quantity || 0}</TableCell>
                                                <TableCell className="text-sm">{order.agent || 'N/A'}</TableCell>
                                                <TableCell>
                                                    <Badge
                                                        variant="outline"
                                                        className={statusConfig[order.status]?.bgColor || 'bg-muted'}
                                                    >
                                                        {order.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right font-semibold">
                                                    {formatCurrency(order.amount)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                )}
                      </>
                    )}
                </Deferred>
            </div>
        </AppLayout>
    )
}
