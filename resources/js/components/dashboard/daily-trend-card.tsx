import { useMemo, useState } from 'react';
import { Link } from '@inertiajs/react';
import { DollarSign, ShoppingCart, TrendingUp } from 'lucide-react';
import {
    CartesianGrid,
    Line,
    LineChart,
    XAxis,
    YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    ChartConfig,
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { DashboardPageProps, DashboardRange } from '@/types/dashboard';

type DailyTrendPoint = DashboardPageProps['dailyTrend'][number];
type ChartMode = 'orders' | 'revenue';

interface DailyTrendCardProps {
    data: DailyTrendPoint[];
    range: DashboardRange;
    formatCurrency: (amount: number) => string;
}

const orderConfig = {
    orders: { label: 'Orders placed', color: 'var(--color-chart-1)' },
    delivered: { label: 'Delivered', color: 'var(--color-chart-2)' },
    previous: { label: 'Orders, previous period', color: 'var(--color-chart-3)' },
} satisfies ChartConfig;

const revenueConfig = {
    revenue: { label: 'Revenue', color: 'var(--color-chart-1)' },
    deliveredRevenue: { label: 'Delivered revenue', color: 'var(--color-chart-2)' },
    previousRevenue: { label: 'Revenue, previous period', color: 'var(--color-chart-3)' },
} satisfies ChartConfig;

const rangeLabels: Record<DashboardRange, string> = {
    today: 'Today',
    last7Days: 'Last 7 days',
    last30Days: 'Last 30 days',
    thisMonth: 'This month',
    allTime: 'Last 30 days',
};

export function DailyTrendCard({ data, range, formatCurrency }: DailyTrendCardProps) {
    const [mode, setMode] = useState<ChartMode>('orders');
    const config = mode === 'orders' ? orderConfig : revenueConfig;
    const currentConfig = mode === 'orders' ? orderConfig.orders : revenueConfig.revenue;
    const deliveredConfig = mode === 'orders' ? orderConfig.delivered : revenueConfig.deliveredRevenue;
    const previousConfig = mode === 'orders' ? orderConfig.previous : revenueConfig.previousRevenue;
    const seriesLabels: Record<string, string> = mode === 'orders'
        ? {
            orders: orderConfig.orders.label,
            delivered: orderConfig.delivered.label,
            previous: orderConfig.previous.label,
        }
        : {
            revenue: revenueConfig.revenue.label,
            deliveredRevenue: revenueConfig.deliveredRevenue.label,
            previousRevenue: revenueConfig.previousRevenue.label,
        };
    const totals = useMemo(
        () =>
            data.reduce(
                (sum, point) => ({
                    orders: sum.orders + point.orders,
                    delivered: sum.delivered + point.delivered,
                }),
                { orders: 0, delivered: 0 },
            ),
        [data],
    );
    const currentSeries = mode === 'orders' ? 'orders' : 'revenue';
    const deliveredSeries = mode === 'orders' ? 'delivered' : 'deliveredRevenue';
    const previousSeries = mode === 'orders' ? 'previousOrders' : 'previousRevenue';
    const subtitle = range === 'allTime'
        ? 'Per day · Last 30 days · vs the 30 days before'
        : `Per day · ${rangeLabels[range]} · vs the previous period`;

    return (
        <Card className="rounded-2xl border bg-card p-4 shadow-xs xl:col-span-2">
            <CardHeader className="flex flex-row items-start justify-between gap-3 p-0">
                <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <TrendingUp aria-hidden="true" className="size-5" strokeWidth={1.75} />
                    </span>
                    <div>
                        <CardTitle className="text-[15px] font-semibold">Revenue &amp; orders</CardTitle>
                        <CardDescription className="mt-1 text-xs">{subtitle}</CardDescription>
                    </div>
                </div>
                <Tabs value={mode} onValueChange={(value) => setMode(value as ChartMode)}>
                    <TabsList className="h-9 rounded-xl bg-muted p-1">
                        <TabsTrigger value="orders" className="gap-1.5 rounded-lg px-3 text-xs">
                            <ShoppingCart aria-hidden="true" className="size-3.5" />
                            Orders
                        </TabsTrigger>
                        <TabsTrigger value="revenue" className="gap-1.5 rounded-lg px-3 text-xs">
                            <DollarSign aria-hidden="true" className="size-3.5" />
                            Revenue
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </CardHeader>

            <CardContent className="mt-4 p-0">
                <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="h-0.5 w-4 rounded bg-chart-1" />
                        {mode === 'orders' ? 'Orders placed' : 'Revenue'}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="h-0.5 w-4 rounded bg-chart-2" />
                        {mode === 'orders' ? 'Delivered' : 'Delivered revenue'}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="w-4 border-t-2 border-dashed border-chart-3" />
                        {mode === 'orders' ? 'Orders, previous period' : 'Revenue, previous period'}
                    </span>
                    <Link
                        href="/sheetorders"
                        className="ml-auto text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <strong>{totals.orders.toLocaleString()}</strong> orders ·{' '}
                        <strong>{totals.delivered.toLocaleString()}</strong> delivered
                    </Link>
                </div>

                <ChartContainer config={config} className="h-[260px] w-full">
                    <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                        <XAxis
                            dataKey="label"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            interval={Math.max(0, Math.floor(data.length / 7) - 1)}
                        />
                        <YAxis
                            tickLine={false}
                            axisLine={false}
                            width={48}
                            tickFormatter={(value: number) =>
                                mode === 'revenue'
                                    ? Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
                                    : value.toLocaleString()
                            }
                        />
                        <ChartTooltip
                            content={
                                <ChartTooltipContent
                                    labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ''}
                                    formatter={(value, name) => {
                                        const numericValue = typeof value === 'number' ? value : Number(value);
                                        return [
                                            mode === 'revenue' ? formatCurrency(numericValue) : numericValue.toLocaleString(),
                                            seriesLabels[name] ?? name,
                                        ];
                                    }}
                                />
                            }
                        />
                        <Line
                            type="monotone"
                            dataKey={currentSeries}
                            name={currentConfig.label}
                            stroke={currentConfig.color}
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                        />
                        <Line
                            type="monotone"
                            dataKey={deliveredSeries}
                            name={deliveredConfig.label}
                            stroke={deliveredConfig.color}
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                        />
                        <Line
                            type="monotone"
                            dataKey={previousSeries}
                            name={previousConfig.label}
                            stroke={previousConfig.color}
                            strokeWidth={1.75}
                            strokeDasharray="3 4"
                            strokeOpacity={0.65}
                            dot={false}
                        />
                    </LineChart>
                </ChartContainer>
            </CardContent>
        </Card>
    );
}
