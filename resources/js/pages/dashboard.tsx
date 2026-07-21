"use client"

import AppLayout from '@/layouts/app-layout'
import { type BreadcrumbItem } from '@/types'
import { Head, usePage, router } from '@inertiajs/react'
import {
    TrendingUp,
    TrendingDown,
    Package,
    PackageCheck,
    Clock,
    XCircle,
    ArrowUpRight,
    ArrowDownRight,
    CalendarDays,
    Filter,
    BarChart3,
    Activity,
    DollarSign,
    ShoppingCart,
    Wallet,
    Target,
    Users,
    ChevronLeft,
    ChevronRight,
    AlertCircle,
    CheckCircle,
    RefreshCw,
    Award,
    Truck
} from "lucide-react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart"
import { CartesianGrid, XAxis, YAxis, Area, AreaChart, Bar, BarChart, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useState, useMemo } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ProductFilter } from "@/components/product-filter"

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/dashboard' },
]

type FilterPeriod = 'today' | 'last7Days' | 'last30Days' | 'thisMonth'

interface PageProps {
    period?: FilterPeriod | null
    product?: string | null
    chartData: { month: string, total: number, revenue: number }[]
    statusSummary: { status: string, totalOrders: number, totalAmount: number }[]
    userName: string
    userRole: string
    metrics: {
        totalOrders: number
        totalRevenue: number
        avgOrderValue: number
        totalCustomers: number
        pendingOrders: number
        completedOrders: number
        scheduledOrders: number
        deliveredOrScheduledCount: number
        rateFromLead: number
        completionRate: number
        cancellationRate: number
        deliveryRate: number
    }
    growth: {
        orders: number
        revenue: number
        currentMonth: { orders: number, revenue: number }
        previousMonth: { orders: number, revenue: number }
    }
    topProducts?: Array<{
        product_name: string
        order_count: number
        total_quantity: number
        total_revenue: number
    }>
    productPerformance?: Array<{
        product_name: string
        total_leads: number
        delivered_count: number
        scheduled_count: number
        pending_count: number
        cancelled_count: number
        returned_count: number
        total_revenue: number
        pending_rate: number
        delivered_rate: number
        in_delivery_rate: number
        confirmed_rate: number
        cancelled_rate: number
        returned_rate: number
        global_rate: number
        aov: number
    }>
    recentOrders?: Array<{
        id: number
        order_date: string
        order_no: string
        client_name: string
        product_name: string
        quantity: number
        status: string
        amount: number
        agent: string
    }>
    orderTypeDistribution?: Array<{
        order_type: string
        order_count: number
        total_revenue: number
    }>
    deliveryStats?: {
        totalWithDelivery: number
        delivered: number
        pendingDelivery: number
        deliveryRate: number
    }
}

export default function Dashboard() {
    const page = usePage<PageProps & { selectedCurrency?: string }>()
    const {
        period,
        product,
        chartData,
        statusSummary = [],
        userName,
        userRole,
        metrics = {} as PageProps['metrics'],
        growth = {} as PageProps['growth'],
        topProducts = [],
        productPerformance = [],
        recentOrders = [],
        orderTypeDistribution = [],
        deliveryStats
    } = page.props

    const [chartType, setChartType] = useState<'orders' | 'revenue'>('orders')
    const [chartView, setChartView] = useState<'bar' | 'area'>('bar')
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

    const chartConfig = {
        orders: {
            label: "Total Orders",
            color: "hsl(220 70% 50%)",
        },
        revenue: {
            label: "Revenue",
            color: "hsl(142 76% 36%)",
        }
    } satisfies ChartConfig

    // Status configurations
    const statusConfig: Record<string, { icon: any, color: string, bgColor: string, label: string }> = {
        'Pending': { icon: Clock, color: 'text-orange-600', bgColor: 'bg-orange-50 border-orange-200', label: 'Pending' },
        'Processing': { icon: Package, color: 'text-blue-600', bgColor: 'bg-blue-50 border-blue-200', label: 'Processing' },
        'Completed': { icon: PackageCheck, color: 'text-green-600', bgColor: 'bg-green-50 border-green-200', label: 'Completed' },
        'Cancelled': { icon: XCircle, color: 'text-red-600', bgColor: 'bg-red-50 border-red-200', label: 'Cancelled' },
        'Shipped': { icon: Truck, color: 'text-indigo-600', bgColor: 'bg-indigo-50 border-indigo-200', label: 'Shipped' },
        'Delivered': { icon: PackageCheck, color: 'text-emerald-600', bgColor: 'bg-emerald-50 border-emerald-200', label: 'Delivered' },
        'Returned': { icon: ArrowDownRight, color: 'text-amber-600', bgColor: 'bg-amber-50 border-amber-200', label: 'Returned' },
        'Refunded': { icon: DollarSign, color: 'text-rose-600', bgColor: 'bg-rose-50 border-rose-200', label: 'Refunded' },
        'On Hold': { icon: Clock, color: 'text-slate-600', bgColor: 'bg-slate-50 border-slate-200', label: 'On Hold' },
        'Failed': { icon: XCircle, color: 'text-red-700', bgColor: 'bg-red-50 border-red-200', label: 'Failed' }
    }

    // Get color for status progress bars
    const getStatusColor = (status: string) => {
        const colorMap: Record<string, string> = {
            'Completed': 'bg-green-500',
            'Delivered': 'bg-green-500',
            'Processing': 'bg-blue-500',
            'Shipped': 'bg-blue-500',
            'Pending': 'bg-orange-500',
            'On Hold': 'bg-orange-500',
            'Cancelled': 'bg-red-500',
            'Failed': 'bg-red-500',
            'Returned': 'bg-amber-500',
            'Refunded': 'bg-amber-500',
        }
        return colorMap[status] || 'bg-slate-500'
    }

    // Colors for pie chart
    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Dashboard" />

            <style jsx global>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
                
                * {
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                }
                
                .metric-card {
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                
                .metric-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 16px -4px rgba(0,0,0,0.1);
                }
                
                .fade-in {
                    animation: fadeIn 0.5s ease-out forwards;
                    opacity: 0;
                }
                
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `}</style>

            <div className="flex h-full flex-1 flex-col gap-6 p-6 bg-slate-50/50">
                {/* Header Section */}
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 mb-1">
                            Welcome back, {userName}! 👋
                        </h1>
                        <p className="text-slate-600 flex items-center gap-2">
                            <CalendarDays className="h-4 w-4" />
                            <span>
                                {userRole === 'merchant' ? 'Your merchant dashboard' : 'Complete business overview'}
                            </span>
                        </p>
                    </div>
                    <ProductFilter value={product} />
                </div>

                {/* Filter Section */}
                <Card className="overflow-hidden">
                    <CardContent className="pt-6">
                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.7fr_1fr]">
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <Filter className="h-4 w-4" />
                                    <span className="text-xs font-semibold uppercase tracking-[0.12em]">Time Period</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {([
                                        { key: 'today', label: 'Today' },
                                        { key: 'last7Days', label: 'Last 7 Days' },
                                        { key: 'last30Days', label: 'Last 30 Days' },
                                        { key: 'thisMonth', label: 'This Month' },
                                        { key: null, label: 'All Time' },
                                    ] as { key: FilterPeriod | null, label: string }[]).map(p => {
                                        const params = new URLSearchParams()
                                        if (p.key) params.set('period', p.key)
                                        if (product) params.set('product', product)
                                        const qs = params.toString()
                                        const href = qs ? `/dashboard?${qs}` : '/dashboard'
                                        const isActive = p.key === period || (!p.key && !period)
                                        return (
                                            <Button
                                                key={p.key ?? 'allTime'}
                                                size="sm"
                                                variant={isActive ? "default" : "outline"}
                                                onClick={() => router.get(href)}
                                            >
                                                {p.label}
                                            </Button>
                                        )
                                    })}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Stay focused on momentum. Choose a window and track performance trends with intent.
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-xl border bg-muted/30 p-4">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Orders</p>
                                    <p className="mt-2 text-2xl font-extrabold text-foreground">
                                        {metrics.totalOrders.toLocaleString()}
                                    </p>
                                </div>
                                <div className="rounded-xl border bg-muted/30 p-4">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Revenue</p>
                                    <p className="mt-2 text-2xl font-extrabold text-foreground">
                                        {formatCurrency(metrics.totalRevenue)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Key Metrics Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Total Orders Card */}
                    <Card className="fade-in metric-card border-l-4 border-l-green-500">
                        <CardHeader className="pb-2">
                            <CardDescription className="flex items-center justify-between">
                                <span className="text-xs font-medium text-slate-600">Total Orders</span>
                                <div className="p-2 rounded-lg bg-green-100">
                                    <ShoppingCart className="h-4 w-4 text-green-600" />
                                </div>
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-baseline gap-2">
                                <p className="text-2xl font-bold text-slate-900">
                                    {metrics.totalOrders.toLocaleString()}
                                </p>
                                <Badge
                                    variant="secondary"
                                    className={`gap-1 ${growth.orders >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'} hover:bg-transparent`}
                                >
                                    {growth.orders >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                    {Math.abs(growth.orders).toFixed(1)}%
                                </Badge>
                            </div>
                            <p className="text-xs text-slate-500 mt-2">
                                {growth.orders >= 0 ? '+' : ''}{(growth.currentMonth.orders - growth.previousMonth.orders)} from last month
                            </p>
                        </CardContent>
                    </Card>

                    {/* Confirmation Rate Card */}
                    <Card className="fade-in metric-card border-l-4 border-l-blue-500">
                        <CardHeader className="pb-2">
                            <CardDescription className="flex items-center justify-between">
                                <span className="text-xs font-medium text-slate-600">Confirmation Rate</span>
                                <div className="p-2 rounded-lg bg-blue-100">
                                    <CheckCircle className="h-4 w-4 text-blue-600" />
                                </div>
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-baseline gap-2">
                                <p className="text-2xl font-bold text-slate-900">
                                    {metrics.completionRate}%
                                </p>
                            </div>
                            <p className="text-xs text-slate-500 mt-2">
                                {(metrics.completedOrders + metrics.scheduledOrders).toLocaleString()} of {metrics.totalOrders.toLocaleString()} completed or scheduled
                            </p>
                        </CardContent>
                    </Card>

                    {/* Delivery Rate Card */}
                    <Card className="fade-in metric-card border-l-4 border-l-purple-500">
                        <CardHeader className="pb-2">
                            <CardDescription className="flex items-center justify-between">
                                <span className="text-xs font-medium text-slate-600">Delivery Rate</span>
                                <div className="p-2 rounded-lg bg-purple-100">
                                    <Truck className="h-4 w-4 text-purple-600" />
                                </div>
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-baseline gap-2">
                                <p className="text-2xl font-bold text-slate-900">
                                    {metrics.deliveryRate}%
                                </p>
                            </div>
                            <p className="text-xs text-slate-500 mt-2">
                                {metrics.completedOrders.toLocaleString()} of {(metrics.completedOrders + metrics.scheduledOrders).toLocaleString()} delivered (excl. pending)
                            </p>
                        </CardContent>
                    </Card>

                    {/* Rate From Lead Card */}
                    <Card className="fade-in metric-card border-l-4 border-l-orange-500">
                        <CardHeader className="pb-2">
                            <CardDescription className="flex items-center justify-between">
                                <span className="text-xs font-medium text-slate-600">Rate From Lead</span>
                                <div className="p-2 rounded-lg bg-orange-100">
                                    <Target className="h-4 w-4 text-orange-600" />
                                </div>
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-baseline gap-2">
                                <p className="text-2xl font-bold text-slate-900">
                                    {metrics.rateFromLead.toFixed(1)}%
                                </p>
                            </div>
                            <p className="text-xs text-slate-500 mt-2">
                                {metrics.completedOrders.toLocaleString()} of {metrics.totalOrders.toLocaleString()} delivered
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Main Chart Section */}
                <Card className="border-slate-200">
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <CardTitle className="text-xl">Performance Overview</CardTitle>
                                <CardDescription className="mt-1">
                                    Monthly trends for the last 12 months
                                </CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                                <Tabs
                                    defaultValue="orders"
                                    className="w-full sm:w-auto"
                                    onValueChange={(value) => setChartType(value as 'orders' | 'revenue')}
                                >
                                    <TabsList className="grid w-full sm:w-auto grid-cols-2">
                                        <TabsTrigger value="orders" className="flex items-center gap-2">
                                            <ShoppingCart className="h-3 w-3" />
                                            Orders
                                        </TabsTrigger>
                                        <TabsTrigger value="revenue" className="flex items-center gap-2">
                                            <DollarSign className="h-3 w-3" />
                                            Revenue
                                        </TabsTrigger>
                                    </TabsList>
                                </Tabs>
                                <Tabs
                                    defaultValue="bar"
                                    className="w-full sm:w-auto"
                                    onValueChange={(value) => setChartView(value as 'bar' | 'area')}
                                >
                                    <TabsList className="grid w-full sm:w-auto grid-cols-2">
                                        <TabsTrigger value="bar" className="flex items-center gap-2">
                                            <BarChart3 className="h-3 w-3" />
                                            Bar
                                        </TabsTrigger>
                                        <TabsTrigger value="area" className="flex items-center gap-2">
                                            <Activity className="h-3 w-3" />
                                            Area
                                        </TabsTrigger>
                                    </TabsList>
                                </Tabs>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer
                            config={chartConfig}
                            className="w-full h-[350px]"
                        >
                            {chartView === 'bar' ? (
                                <BarChart
                                    data={dataForChart}
                                    margin={{ top: 20, right: 30, left: 0, bottom: 0 }}
                                >
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        stroke="#e2e8f0"
                                        vertical={false}
                                    />
                                    <XAxis
                                        dataKey="month"
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fill: '#64748b', fontSize: 12 }}
                                        tickMargin={10}
                                    />
                                    <YAxis
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fill: '#64748b', fontSize: 12 }}
                                        tickFormatter={(value) => {
                                            if (chartType === 'revenue') {
                                                return `${(value / 1000).toFixed(0)}k`
                                            }
                                            return value.toString()
                                        }}
                                    />
                                    <ChartTooltip
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                const data = payload[0].payload
                                                return (
                                                    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 min-w-[180px]">
                                                        <p className="text-xs font-semibold text-slate-600 mb-2">
                                                            {data.month}
                                                        </p>
                                                        <div className="space-y-1">
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-xs text-slate-500">Orders:</span>
                                                                <span className="text-sm font-bold text-slate-900">
                                                                    {data.orders.toLocaleString()}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-xs text-slate-500">Revenue:</span>
                                                                <span className="text-sm font-bold text-green-600">
                                                                    {formatCurrency(data.revenue)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            }
                                            return null
                                        }}
                                    />
                                    <Bar
                                        dataKey={chartType === 'orders' ? 'orders' : 'revenue'}
                                        fill={chartType === 'orders' ? "hsl(220 70% 50%)" : "hsl(142 76% 36%)"}
                                        radius={[6, 6, 0, 0]}
                                        maxBarSize={44}
                                    />
                                </BarChart>
                            ) : (
                                <AreaChart
                                    data={dataForChart}
                                    margin={{ top: 20, right: 30, left: 0, bottom: 0 }}
                                >
                                <defs>
                                    <linearGradient
                                        id={`color${chartType}`}
                                        x1="0"
                                        y1="0"
                                        x2="0"
                                        y2="1"
                                    >
                                        <stop
                                            offset="5%"
                                            stopColor={chartType === 'orders' ? "hsl(220 70% 50%)" : "hsl(142 76% 36%)"}
                                            stopOpacity={0.3}
                                        />
                                        <stop
                                            offset="95%"
                                            stopColor={chartType === 'orders' ? "hsl(220 70% 50%)" : "hsl(142 76% 36%)"}
                                            stopOpacity={0.05}
                                        />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid
                                    strokeDasharray="3 3"
                                    stroke="#e2e8f0"
                                    vertical={false}
                                />
                                <XAxis
                                    dataKey="month"
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fill: '#64748b', fontSize: 12 }}
                                    tickMargin={10}
                                />
                                <YAxis
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fill: '#64748b', fontSize: 12 }}
                                    tickFormatter={(value) => {
                                        if (chartType === 'revenue') {
                                            return `${(value / 1000).toFixed(0)}k`
                                        }
                                        return value.toString()
                                    }}
                                />
                                <ChartTooltip
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            const data = payload[0].payload
                                            return (
                                                <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 min-w-[180px]">
                                                    <p className="text-xs font-semibold text-slate-600 mb-2">
                                                        {data.month}
                                                    </p>
                                                    <div className="space-y-1">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-xs text-slate-500">Orders:</span>
                                                            <span className="text-sm font-bold text-slate-900">
                                                                {data.orders.toLocaleString()}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-xs text-slate-500">Revenue:</span>
                                                            <span className="text-sm font-bold text-green-600">
                                                                {formatCurrency(data.revenue)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        }
                                        return null
                                    }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey={chartType === 'orders' ? 'orders' : 'revenue'}
                                    stroke={chartType === 'orders' ? "hsl(220 70% 50%)" : "hsl(142 76% 36%)"}
                                    strokeWidth={3}
                                    fill={`url(#color${chartType})`}
                                    dot={{
                                        fill: chartType === 'orders' ? "hsl(220 70% 50%)" : "hsl(142 76% 36%)",
                                        strokeWidth: 2,
                                        r: 4
                                    }}
                                    activeDot={{
                                        r: 6,
                                        strokeWidth: 2,
                                        fill: chartType === 'orders' ? "hsl(220 70% 50%)" : "hsl(142 76% 36%)"
                                    }}
                                />
                                </AreaChart>
                            )}
                        </ChartContainer>
                    </CardContent>
                </Card>

                {/* Top Products */}
                {topProducts.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-xl flex items-center gap-2">
                                <Award className="h-5 w-5 text-blue-600" />
                                Top Products
                            </CardTitle>
                            <CardDescription>Best selling products by quantity</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {topProducts.slice(0, 5).map((product, index) => (
                                    <div key={product.product_name} className="flex items-center gap-3">
                                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                                            <span className="text-sm font-bold text-blue-600">#{index + 1}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-slate-900 truncate">
                                                {product.product_name}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                {product.total_quantity} units • {product.order_count} orders
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-bold text-slate-900">
                                                {formatCurrency(product.total_revenue)}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Product Performance Table */}
                {productPerformance.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-xl flex items-center gap-2">
                                <Package className="h-5 w-5 text-indigo-600" />
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
                                                                ? 'bg-green-100 text-green-700'
                                                                : item.confirmed_rate >= 40
                                                                    ? 'bg-yellow-100 text-yellow-700'
                                                                    : 'bg-red-100 text-red-700'
                                                        }`}>
                                                            {item.confirmed_rate}%
                                                        </span>
                                                        <span className="text-[10px] text-slate-400 tabular-nums">
                                                            {(item.delivered_count + item.scheduled_count).toLocaleString()}/{item.total_leads.toLocaleString()}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex flex-col items-end gap-0.5">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                            item.cancelled_rate >= 50
                                                                ? 'bg-red-100 text-red-700'
                                                                : item.cancelled_rate >= 20
                                                                    ? 'bg-yellow-100 text-yellow-700'
                                                                    : 'bg-slate-100 text-slate-700'
                                                        }`}>
                                                            {item.cancelled_rate}%
                                                        </span>
                                                        <span className="text-[10px] text-slate-400 tabular-nums">
                                                            {item.cancelled_count.toLocaleString()}/{item.total_leads.toLocaleString()}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex flex-col items-end gap-0.5">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                            item.pending_rate >= 50
                                                                ? 'bg-orange-100 text-orange-700'
                                                                : item.pending_rate >= 20
                                                                    ? 'bg-yellow-100 text-yellow-700'
                                                                    : 'bg-slate-100 text-slate-700'
                                                        }`}>
                                                            {item.pending_rate}%
                                                        </span>
                                                        <span className="text-[10px] text-slate-400 tabular-nums">
                                                            {item.pending_count.toLocaleString()}/{item.total_leads.toLocaleString()}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex flex-col items-end gap-0.5">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                            item.in_delivery_rate >= 50
                                                                ? 'bg-blue-100 text-blue-700'
                                                                : item.in_delivery_rate >= 20
                                                                    ? 'bg-yellow-100 text-yellow-700'
                                                                    : 'bg-slate-100 text-slate-700'
                                                        }`}>
                                                            {item.in_delivery_rate}%
                                                        </span>
                                                        <span className="text-[10px] text-slate-400 tabular-nums">
                                                            {item.scheduled_count.toLocaleString()}/{(item.delivered_count + item.scheduled_count).toLocaleString()}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex flex-col items-end gap-0.5">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                            item.returned_rate >= 50
                                                                ? 'bg-amber-100 text-amber-700'
                                                                : item.returned_rate >= 20
                                                                    ? 'bg-yellow-100 text-yellow-700'
                                                                    : 'bg-slate-100 text-slate-700'
                                                        }`}>
                                                            {item.returned_rate}%
                                                        </span>
                                                        <span className="text-[10px] text-slate-400 tabular-nums">
                                                            {item.returned_count.toLocaleString()}/{(item.delivered_count + item.scheduled_count).toLocaleString()}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex flex-col items-end gap-0.5">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                            item.delivered_rate >= 50
                                                                ? 'bg-green-100 text-green-700'
                                                                : item.delivered_rate >= 20
                                                                    ? 'bg-yellow-100 text-yellow-700'
                                                                    : 'bg-red-100 text-red-700'
                                                        }`}>
                                                            {item.delivered_rate}%
                                                        </span>
                                                        <span className="text-[10px] text-slate-400 tabular-nums">
                                                            {item.delivered_count.toLocaleString()}/{(item.delivered_count + item.scheduled_count).toLocaleString()}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex flex-col items-end gap-0.5">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                            item.global_rate >= 50
                                                                ? 'bg-green-100 text-green-700'
                                                                : item.global_rate >= 20
                                                                    ? 'bg-yellow-100 text-yellow-700'
                                                                    : 'bg-red-100 text-red-700'
                                                        }`}>
                                                            {item.global_rate}%
                                                        </span>
                                                        <span className="text-[10px] text-slate-400 tabular-nums">
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
                                    <div className="text-sm text-slate-600">
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
                                        color: 'text-slate-600',
                                        bgColor: 'bg-slate-50 border-slate-200',
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
                                                        <p className="font-semibold text-sm text-slate-900">{config.label}</p>
                                                        <p className="text-xs text-slate-500">
                                                            {status.totalOrders.toLocaleString()} orders • {percentage}%
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-bold text-sm text-slate-900">
                                                        {formatCurrency(status.totalAmount)}
                                                    </p>
                                                    <p className="text-xs text-slate-500">
                                                        Avg: {formatCurrency(avgValue)}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
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
                                    <div className="text-sm text-slate-600">
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
                                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle className="h-4 w-4 text-green-600" />
                                        <span className="text-sm font-medium text-slate-700">Completion Rate</span>
                                    </div>
                                    <span className="font-bold text-green-600">{metrics.completionRate}%</span>
                                </div>

                                <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                                    <div className="flex items-center gap-2">
                                        <Clock className="h-4 w-4 text-orange-600" />
                                        <span className="text-sm font-medium text-slate-700">Pending Orders</span>
                                    </div>
                                    <span className="font-bold text-orange-600">{metrics.pendingOrders}</span>
                                </div>

                                <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                                    <div className="flex items-center gap-2">
                                        <AlertCircle className="h-4 w-4 text-red-600" />
                                        <span className="text-sm font-medium text-slate-700">Cancellation Rate</span>
                                    </div>
                                    <span className="font-bold text-red-600">{metrics.cancellationRate}%</span>
                                </div>

                                {deliveryStats && (
                                    <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                                        <div className="flex items-center gap-2">
                                            <Truck className="h-4 w-4 text-blue-600" />
                                            <span className="text-sm font-medium text-slate-700">Delivery Rate</span>
                                        </div>
                                        <span className="font-bold text-blue-600">{deliveryStats.deliveryRate}%</span>
                                    </div>
                                )}
                            </div>

                            <div className="pt-4 border-t">
                                <div className="flex items-center gap-2 text-xs text-slate-500">
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
                                                <TableCell className="text-sm text-slate-600">
                                                    {new Date(order.order_date).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell className="text-sm">{order.client_name || 'N/A'}</TableCell>
                                                <TableCell className="text-sm max-w-[150px] truncate">{order.product_name || 'N/A'}</TableCell>
                                                <TableCell className="text-sm">{order.quantity || 0}</TableCell>
                                                <TableCell className="text-sm">{order.agent || 'N/A'}</TableCell>
                                                <TableCell>
                                                    <Badge
                                                        variant="outline"
                                                        className={statusConfig[order.status]?.bgColor || 'bg-slate-50'}
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
            </div>
        </AppLayout>
    )
}
