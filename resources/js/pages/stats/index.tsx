import AppLayout from '@/layouts/app-layout';
import { Head, router } from '@inertiajs/react';
import { type BreadcrumbItem } from '@/types';
import { useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock3,
  DollarSign,
  Filter,
  LineChart,
  MapPin,
  Package,
  ShoppingCart,
  Store,
  TrendingUp,
  User,
  X,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ProductFilter } from '@/components/product-filter';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart as RechartsLineChart,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const COLORS = ['#1d4ed8', '#0f766e', '#d97706', '#be123c', '#7c3aed', '#0891b2', '#65a30d', '#ea580c'];

const breadcrumbs: BreadcrumbItem[] = [
  { title: 'Statistics Dashboard', href: '/stats' },
];

type Summary = {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  totalQuantity: number;
};

type StatusItem = {
  status: string;
  total: number;
  revenue: number;
  percentage: number;
};

type AgentItem = {
  cc_email: string;
  total_orders: number;
  total_revenue: number;
  delivered_orders: number;
  cancelled_orders: number;
  pending_orders: number;
  scheduled_orders: number;
  avg_order_value: number;
  delivery_rate: number;
  schedule_rate: number;
};

type OverdueSummaryItem = {
  cc_email: string;
  overdue_count: number;
  avg_days_overdue?: number;
  avg_days_pending?: number;
};

type OverdueOrder = {
  cc_email: string;
  merchant: string;
  order_no: string;
  client_name: string;
  delivery_date?: string;
  order_date?: string;
  days_overdue?: number;
  days_pending?: number;
};

type MerchantItem = {
  merchant: string;
  total: number;
  revenue: number;
};

type TrendItem = {
  date: string;
  orders: number;
  revenue: number;
  delivered: number;
};

type ProductItem = {
  product_name: string;
  total: number;
  quantity: number;
  revenue: number;
};

type Rates = {
  totalOrders: number;
  [key: string]: number;
};

type CountryItem = {
  country: string;
  total: number;
  revenue: number;
};

type RecentOrder = {
  id: number;
  order_no: string;
  order_date: string;
  client_name: string;
  amount: number;
  quantity: number;
  status: string;
  cc_email: string;
  merchant: string;
  product_name: string;
  country: string;
  city: string;
};

type FilterOptions = {
  ccEmails: string[];
  merchants: string[];
  statuses: string[];
  countries: string[];
};

type Filters = {
  date_range?: string;
  date_field?: 'order_date' | 'delivery_date';
  cc_email?: string;
  merchant?: string;
  status?: string;
  country?: string;
  product?: string;
};

type StatsPageProps = {
  summary: Summary;
  ordersByStatus: StatusItem[];
  rates: Rates;
  agentPerformance: AgentItem[];
  overdueScheduled: OverdueOrder[];
  overdueScheduledSummary: OverdueSummaryItem[];
  overduePending: OverdueOrder[];
  overduePendingSummary: OverdueSummaryItem[];
  ordersByMerchant: MerchantItem[];
  dailyTrend: TrendItem[];
  topProducts: ProductItem[];
  ordersByCountry: CountryItem[];
  recentOrders: RecentOrder[];
  filterOptions: FilterOptions;
  filters: Filters;
};

const dateRangeLabels: Record<string, string> = {
  all_time: 'All time',
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'This week',
  last_week: 'Last week',
  this_month: 'This month',
  last_month: 'Last month',
  this_year: 'This year',
  last_30_days: 'Last 30 days',
  last_90_days: 'Last 90 days',
};

const dateFieldLabels: Record<'order_date' | 'delivery_date', string> = {
  order_date: 'Order date',
  delivery_date: 'Delivery date',
};

const getStatusTone = (status?: string | null) => {
  const value = String(status ?? '').toLowerCase();
  if (value.includes('deliver')) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (value.includes('cancel')) return 'bg-red-100 text-red-700 border-red-200';
  if (value.includes('pending')) return 'bg-amber-100 text-amber-700 border-amber-200';
  if (value.includes('schedule')) return 'bg-blue-100 text-blue-700 border-blue-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

const formatMoney = (value: number) => `Ksh ${Number(value || 0).toLocaleString()}`;

const compactDate = (value?: string) => {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export default function StatsDashboard({
  summary,
  ordersByStatus,
  rates,
  agentPerformance,
  overdueScheduled,
  overdueScheduledSummary,
  overduePending,
  overduePendingSummary,
  ordersByMerchant,
  dailyTrend,
  topProducts,
  ordersByCountry,
  recentOrders,
  filterOptions,
  filters,
}: StatsPageProps) {
  const [showFilters, setShowFilters] = useState(false);

  const handleFilterChange = (key: keyof Filters, value?: string | null) => {
    const nextFilters: Record<string, string> = { ...filters } as Record<string, string>;

    if (!value || value === 'all_time') {
      delete nextFilters[key];
    } else {
      nextFilters[key] = value;
    }

    router.get('/stats', nextFilters, {
      preserveState: true,
      preserveScroll: true,
    });
  };

  const clearAllFilters = () => {
    router.get('/stats', {}, {
      preserveState: true,
      preserveScroll: true,
    });
  };

  const activeFiltersCount = Object.entries(filters).filter(([key, value]) => {
    if (!value) return false;
    if (key === 'date_field' && value === 'order_date') return false;
    return true;
  }).length;
  const topStatus = ordersByStatus[0];
  const topAgent = agentPerformance[0];
  const topMerchant = ordersByMerchant[0];
  const attentionCount =
    overdueScheduledSummary.reduce((sum, item) => sum + item.overdue_count, 0) +
    overduePendingSummary.reduce((sum, item) => sum + item.overdue_count, 0);

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Statistics Dashboard" />

      <div className="flex h-full flex-1 flex-col gap-4 px-2 py-3 sm:px-4 sm:py-4">
        <section className="rounded-2xl border border-slate-200 bg-[linear-gradient(135deg,#eff6ff_0%,#ffffff_45%,#ecfeff_100%)] p-4 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <Badge variant="outline" className="border-sky-200 bg-white/80 text-sky-700">
                Stats workspace
              </Badge>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Orders Analytics</h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-600">
                Focus on the signals that matter first: volume, revenue, delivery health, and agent workload.
                Secondary detail is grouped into tabs so the page remains faster and easier to scan.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <ProductFilter value={filters.product} preserveState preserveScroll />
              <Button variant="outline" className="bg-white/80" onClick={() => setShowFilters((value) => !value)}>
                <Filter className="mr-2 h-4 w-4" />
                Filters
                {activeFiltersCount > 0 && (
                  <span className="ml-2 rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white">
                    {activeFiltersCount}
                  </span>
                )}
              </Button>
              {activeFiltersCount > 0 && (
                <Button variant="ghost" onClick={clearAllFilters}>
                  <X className="mr-2 h-4 w-4" />
                  Clear all
                </Button>
              )}
            </div>
          </div>
        </section>

        <Dialog open={showFilters} onOpenChange={setShowFilters}>
          <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Filter the dashboard</DialogTitle>
              <DialogDescription>Reduce the dataset before charts and tables render.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-3">
                <FilterSelect
                  icon={<Calendar className="h-4 w-4" />}
                  label="Date column"
                  value={filters.date_field || 'order_date'}
                  onChange={(value) => handleFilterChange('date_field', value)}
                  options={[
                    { value: 'order_date', label: 'Order date' },
                    { value: 'delivery_date', label: 'Delivery date' },
                  ]}
                />
                <FilterSelect
                  icon={<Calendar className="h-4 w-4" />}
                  label="Date range"
                  value={filters.date_range || 'all_time'}
                  onChange={(value) => handleFilterChange('date_range', value)}
                  options={Object.entries(dateRangeLabels).map(([value, label]) => ({ value, label }))}
                />
                <FilterSelect
                  icon={<User className="h-4 w-4" />}
                  label="Agent"
                  value={filters.cc_email || ''}
                  onChange={(value) => handleFilterChange('cc_email', value)}
                  placeholder={`All agents (${filterOptions.ccEmails.length})`}
                  options={filterOptions.ccEmails.map((value) => ({ value, label: value }))}
                />
                <FilterSelect
                  icon={<Store className="h-4 w-4" />}
                  label="Merchant"
                  value={filters.merchant || ''}
                  onChange={(value) => handleFilterChange('merchant', value)}
                  placeholder={`All merchants (${filterOptions.merchants.length})`}
                  options={filterOptions.merchants.map((value) => ({ value, label: value }))}
                />
                <FilterSelect
                  icon={<Package className="h-4 w-4" />}
                  label="Status"
                  value={filters.status || ''}
                  onChange={(value) => handleFilterChange('status', value)}
                  placeholder={`All statuses (${filterOptions.statuses.length})`}
                  options={filterOptions.statuses.map((value) => ({ value, label: value }))}
                />
                <FilterSelect
                  icon={<MapPin className="h-4 w-4" />}
                  label="Country"
                  value={filters.country || ''}
                  onChange={(value) => handleFilterChange('country', value)}
                  placeholder={`All countries (${filterOptions.countries.length})`}
                  options={filterOptions.countries.map((value) => ({ value, label: value }))}
                />
              </div>

              {activeFiltersCount > 0 && (
                <div className="flex flex-wrap gap-2 border-t pt-4">
                  {filters.date_range && filters.date_range !== 'all_time' && (
                    <FilterChip label="Date" value={dateRangeLabels[filters.date_range] ?? filters.date_range} />
                  )}
                  {filters.date_field && filters.date_field !== 'order_date' && (
                    <FilterChip label="Using" value={dateFieldLabels[filters.date_field]} />
                  )}
                  {filters.cc_email && <FilterChip label="Agent" value={filters.cc_email} />}
                  {filters.merchant && <FilterChip label="Merchant" value={filters.merchant} />}
                  {filters.status && <FilterChip label="Status" value={filters.status} />}
                  {filters.country && <FilterChip label="Country" value={filters.country} />}
                  {filters.product && <FilterChip label="Product" value={filters.product} />}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Total orders"
            value={summary.totalOrders.toLocaleString()}
            subtitle="Current filtered dataset"
            icon={<ShoppingCart className="h-5 w-5" />}
          />
          <MetricCard
            title="Revenue"
            value={formatMoney(summary.totalRevenue)}
            subtitle="Gross order value"
            icon={<DollarSign className="h-5 w-5" />}
          />
          <MetricCard
            title="Average order"
            value={formatMoney(summary.averageOrderValue)}
            subtitle="Average basket value"
            icon={<TrendingUp className="h-5 w-5" />}
          />
          <MetricCard
            title="Items sold"
            value={summary.totalQuantity.toLocaleString()}
            subtitle="Combined quantity"
            icon={<Package className="h-5 w-5" />}
          />
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Object.entries(rates)
            .filter(([key]) => key.endsWith('Rate') && key !== 'totalOrders')
            .sort((a, b) => b[1] - a[1])
            .map(([key, value]) => {
              const countKey = key.replace('Rate', 'Count');
              const count = rates[countKey] as number | undefined;
              return (
                <RateMeter
                  key={key}
                  label={key.replace('Rate', '')}
                  value={value}
                  count={count}
                  tone={key.startsWith('delivered') && value >= 70 ? 'green' : key.startsWith('cancelled') && value <= 10 ? 'green' : 'blue'}
                />
              );
            })}
        </section>

        <section className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <InsightCard
            title="Top status"
            icon={<BarChart3 className="h-4 w-4" />}
            value={topStatus ? topStatus.status : 'No data'}
            supporting={topStatus ? `${topStatus.total.toLocaleString()} orders, ${topStatus.percentage}% of total` : 'No filtered orders yet'}
          />
          <InsightCard
            title="Best active agent"
            icon={<User className="h-4 w-4" />}
            value={topAgent ? topAgent.cc_email : 'No data'}
            supporting={topAgent ? `${topAgent.delivery_rate}% delivery rate across ${topAgent.total_orders} orders` : 'No assigned orders yet'}
          />
          <InsightCard
            title="Largest merchant"
            icon={<Store className="h-4 w-4" />}
            value={topMerchant ? topMerchant.merchant : 'No data'}
            supporting={topMerchant ? `${topMerchant.total.toLocaleString()} orders, ${formatMoney(topMerchant.revenue)}` : 'No merchant volume yet'}
          />
          <InsightCard
            title="Needs attention"
            icon={<AlertTriangle className="h-4 w-4" />}
            value={attentionCount.toLocaleString()}
            supporting="Overdue scheduled + long-pending orders"
            tone={attentionCount > 0 ? 'alert' : 'neutral'}
          />
        </section>

        <Tabs defaultValue="overview" className="space-y-4">
          <div className="overflow-x-auto">
            <TabsList className="inline-flex h-auto min-w-full justify-start gap-2 rounded-xl border bg-white p-1">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
              <TabsTrigger value="alerts">Alerts</TabsTrigger>
              <TabsTrigger value="recent">Recent Activity</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr_1fr]">
              <ChartCard
                title="Daily trend"
                description="Volume, delivered orders, and revenue over time"
                empty={dailyTrend.length === 0}
              >
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsLineChart data={dailyTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => compactDate(value)}
                      minTickGap={24}
                      style={{ fontSize: 11 }}
                    />
                    <YAxis yAxisId="left" style={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" style={{ fontSize: 11 }} />
                    <Tooltip
                      labelFormatter={(value) => compactDate(String(value))}
                      formatter={(value: number, name: string) => [
                        name === 'revenue' ? formatMoney(Number(value)) : Number(value).toLocaleString(),
                        name === 'orders' ? 'Orders' : name === 'delivered' ? 'Delivered' : 'Revenue',
                      ]}
                    />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="orders" stroke="#1d4ed8" strokeWidth={2} dot={false} />
                    <Line yAxisId="left" type="monotone" dataKey="delivered" stroke="#059669" strokeWidth={2} dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="#7c3aed" strokeWidth={2} dot={false} />
                  </RechartsLineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard
                title="Status distribution"
                description="How the current order pool is split"
                empty={ordersByStatus.length === 0}
              >
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsPieChart>
                    <Pie
                      data={ordersByStatus}
                      dataKey="total"
                      nameKey="status"
                      innerRadius={62}
                      outerRadius={105}
                      paddingAngle={3}
                    >
                      {ordersByStatus.map((entry, index) => (
                        <Cell key={entry.status} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number, _name, item) => [`${value.toLocaleString()} orders`, item.payload.status]} />
                    <Legend />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <ChartCard
                title="Top merchants"
                description="Top contributors by order count"
                empty={ordersByMerchant.length === 0}
              >
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={ordersByMerchant} layout="vertical" margin={{ left: 20, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" style={{ fontSize: 11 }} />
                    <YAxis dataKey="merchant" type="category" width={96} style={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: number, _name, item) => [`${value.toLocaleString()} orders`, item.payload.merchant]} />
                    <Bar dataKey="total" fill="#1d4ed8" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle>Top products</CardTitle>
                  <CardDescription>Best-selling products in the current filter window</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {topProducts.length === 0 && <EmptyState message="No product data available." />}
                  {topProducts.map((product, index) => (
                    <div key={product.product_name} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{product.product_name}</p>
                          <p className="text-xs text-slate-500">
                            {product.total.toLocaleString()} orders, {product.quantity.toLocaleString()} units
                          </p>
                        </div>
                        <Badge variant="outline">#{index + 1}</Badge>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-emerald-600">{formatMoney(product.revenue)}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <ChartCard
                title="Country distribution"
                description="Top destination countries by order volume"
                empty={ordersByCountry.length === 0}
              >
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={ordersByCountry}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="country" style={{ fontSize: 11 }} />
                    <YAxis style={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: number, _name, item) => [`${value.toLocaleString()} orders`, item.payload.country]} />
                    <Bar dataKey="total" fill="#0f766e" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle>Interpretation</CardTitle>
                  <CardDescription>Quick read of what the dashboard is saying</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-600">
                  <NarrativeItem
                    title="Volume signal"
                    body={
                      topStatus
                        ? `${topStatus.status} is currently the largest order bucket at ${topStatus.percentage}% of filtered volume.`
                        : 'No status trend can be interpreted yet.'
                    }
                  />
                  <NarrativeItem
                    title="Execution signal"
                    body={
                      topAgent
                        ? `${topAgent.cc_email} is leading current activity with a ${topAgent.delivery_rate}% delivery rate.`
                        : 'No agent performance signal is available.'
                    }
                  />
                  <NarrativeItem
                    title="Risk signal"
                    body={
                      attentionCount > 0
                        ? `${attentionCount.toLocaleString()} orders need attention across overdue scheduled or long-pending queues.`
                        : 'No overdue pressure is visible in the current dataset.'
                    }
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="performance" className="space-y-4">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Agent performance leaderboard</CardTitle>
                <CardDescription>Compressed for faster scanning on desktop and mobile.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {agentPerformance.length === 0 && <EmptyState message="No agent performance data available." />}
                {agentPerformance.map((agent, index) => (
                  <div key={agent.cc_email} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">#{index + 1}</Badge>
                          <h3 className="truncate font-semibold">{agent.cc_email}</h3>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">
                          {agent.total_orders.toLocaleString()} orders • {formatMoney(agent.total_revenue)}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs sm:w-[320px]">
                        <StatPill label="Delivered" value={agent.delivered_orders} tone="green" />
                        <StatPill label="Scheduled" value={agent.scheduled_orders} tone="blue" />
                        <StatPill label="Pending" value={agent.pending_orders} tone="amber" />
                        <StatPill label="Cancelled" value={agent.cancelled_orders} tone="red" />
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <RateMeter label="Delivery rate" value={agent.delivery_rate} />
                      <RateMeter label="Schedule rate" value={agent.schedule_rate} tone="blue" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="alerts" className="space-y-4">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <AlertCard
                title="Overdue scheduled deliveries"
                description="Agents with scheduled orders past delivery date"
                summary={overdueScheduledSummary}
                details={overdueScheduled}
                detailDateKey="delivery_date"
                dayLabel="days overdue"
                tone="red"
              />
              <AlertCard
                title="Long pending orders"
                description="Agents carrying pending orders older than two days"
                summary={overduePendingSummary}
                details={overduePending}
                detailDateKey="order_date"
                dayLabel="days pending"
                tone="amber"
              />
            </div>
          </TabsContent>

          <TabsContent value="recent" className="space-y-4">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Recent orders</CardTitle>
                <CardDescription>The latest 12 records from the filtered dataset.</CardDescription>
              </CardHeader>
              <CardContent>
                {recentOrders.length === 0 && <EmptyState message="No recent orders available." />}

                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-slate-50">
                      <tr>
                        <th className="px-3 py-3 text-left font-medium">Order</th>
                        <th className="px-3 py-3 text-left font-medium">Client</th>
                        <th className="px-3 py-3 text-left font-medium">Product</th>
                        <th className="px-3 py-3 text-left font-medium">Agent</th>
                        <th className="px-3 py-3 text-left font-medium">Merchant</th>
                        <th className="px-3 py-3 text-left font-medium">Status</th>
                        <th className="px-3 py-3 text-right font-medium">Qty</th>
                        <th className="px-3 py-3 text-right font-medium">Amount</th>
                        <th className="px-3 py-3 text-left font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentOrders.map((order) => (
                        <tr key={order.id} className="border-b last:border-b-0 hover:bg-slate-50">
                          <td className="px-3 py-3 font-medium text-sky-700">{order.order_no}</td>
                          <td className="px-3 py-3">{order.client_name}</td>
                          <td className="px-3 py-3 text-slate-500">{order.product_name}</td>
                          <td className="px-3 py-3">{order.cc_email || '-'}</td>
                          <td className="px-3 py-3">{order.merchant || '-'}</td>
                          <td className="px-3 py-3">
                            <Badge variant="outline" className={getStatusTone(order.status)}>
                              {order.status || 'Unknown'}
                            </Badge>
                          </td>
                          <td className="px-3 py-3 text-right">{order.quantity}</td>
                          <td className="px-3 py-3 text-right font-semibold">{formatMoney(order.amount)}</td>
                          <td className="px-3 py-3 text-slate-500">{compactDate(order.order_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid gap-3 lg:hidden">
                  {recentOrders.map((order) => (
                    <div key={order.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-sky-700">{order.order_no}</p>
                          <p className="truncate text-sm text-slate-600">{order.client_name}</p>
                        </div>
                        <Badge variant="outline" className={getStatusTone(order.status)}>
                          {order.status || 'Unknown'}
                        </Badge>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                        <MiniField label="Product" value={order.product_name || '-'} />
                        <MiniField label="Merchant" value={order.merchant || '-'} />
                        <MiniField label="Agent" value={order.cc_email || '-'} />
                        <MiniField label="Date" value={compactDate(order.order_date)} />
                        <MiniField label="Quantity" value={String(order.quantity)} />
                        <MiniField label="Amount" value={formatMoney(order.amount)} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="flex items-start justify-between gap-4 p-4">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
        </div>
        <div className="rounded-xl bg-slate-100 p-2 text-slate-700">{icon}</div>
      </CardContent>
    </Card>
  );
}

function InsightCard({
  title,
  icon,
  value,
  supporting,
  tone = 'neutral',
}: {
  title: string;
  icon: React.ReactNode;
  value: string;
  supporting: string;
  tone?: 'neutral' | 'alert';
}) {
  return (
    <Card className={`shadow-sm ${tone === 'alert' ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200'}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          {icon}
          <span>{title}</span>
        </div>
        <p className="mt-3 text-lg font-semibold">{value}</p>
        <p className="mt-1 text-sm text-slate-600">{supporting}</p>
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  icon,
  label,
  value,
  onChange,
  options,
  placeholder = 'All',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-0 transition focus:border-slate-400"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterChip({ label, value }: { label: string; value: string }) {
  return (
    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
      {label}: {value}
    </Badge>
  );
}

function ChartCard({
  title,
  description,
  empty,
  children,
}: {
  title: string;
  description: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{empty ? <EmptyState message="No data available for this chart." /> : children}</CardContent>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="flex min-h-[180px] items-center justify-center text-sm text-slate-500">{message}</div>;
}

function NarrativeItem({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="font-medium text-slate-900">{title}</p>
      <p className="mt-1">{body}</p>
    </div>
  );
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'green' | 'blue' | 'amber' | 'red';
}) {
  const tones: Record<typeof tone, string> = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <div className={`rounded-xl border px-3 py-2 ${tones[tone]}`}>
      <p>{label}</p>
      <p className="mt-1 text-sm font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}

function RateMeter({
  label,
  value,
  count,
  tone = 'green',
}: {
  label: string;
  value: number;
  count?: number;
  tone?: 'green' | 'blue';
}) {
  const barClass = tone === 'blue' ? 'bg-blue-500' : value >= 80 ? 'bg-emerald-500' : value >= 60 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-slate-500">{label}</span>
        <span className="font-semibold">{value}%</span>
      </div>
      {count !== undefined && (
        <p className="mb-1 text-xs text-slate-400">{count.toLocaleString()} orders</p>
      )}
      <div className="h-2 rounded-full bg-slate-100">
        <div className={`h-2 rounded-full ${barClass}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

function AlertCard({
  title,
  description,
  summary,
  details,
  detailDateKey,
  dayLabel,
  tone,
}: {
  title: string;
  description: string;
  summary: OverdueSummaryItem[];
  details: OverdueOrder[];
  detailDateKey: 'delivery_date' | 'order_date';
  dayLabel: string;
  tone: 'red' | 'amber';
}) {
  const toneClasses =
    tone === 'red'
      ? {
          card: 'border-red-200 bg-red-50/60',
          chip: 'bg-red-100 text-red-700',
        }
      : {
          card: 'border-amber-200 bg-amber-50/60',
          chip: 'bg-amber-100 text-amber-700',
        };

  return (
    <Card className={`shadow-sm ${toneClasses.card}`}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {summary.length === 0 && <EmptyState message="No alerts in this category." />}
        {summary.map((item) => {
          const relatedOrders = details.filter((detail) => detail.cc_email === item.cc_email).slice(0, 3);

          return (
            <div key={item.cc_email} className="rounded-2xl border border-white/80 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{item.cc_email}</p>
                  <p className="text-sm text-slate-500">
                    {item.overdue_count.toLocaleString()} affected orders
                  </p>
                </div>
                <Badge className={toneClasses.chip}>
                  {(item.avg_days_overdue ?? item.avg_days_pending ?? 0).toFixed(1)} avg days
                </Badge>
              </div>

              <div className="mt-3 space-y-2">
                {relatedOrders.map((order) => (
                  <div key={order.order_no} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{order.order_no}</p>
                        <p className="truncate text-slate-600">{order.client_name}</p>
                        <p className="truncate text-xs text-slate-500">{order.merchant}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{(order.days_overdue ?? order.days_pending ?? 0).toLocaleString()}</p>
                        <p className="text-xs text-slate-500">{dayLabel}</p>
                        <p className="text-xs text-slate-500">{compactDate(order[detailDateKey])}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function MiniField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 break-words text-slate-700">{value}</p>
    </div>
  );
}
