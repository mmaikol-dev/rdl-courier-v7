import AppLayout from '@/layouts/app-layout'
import { Head, usePage } from '@inertiajs/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"
import { Bar, BarChart, CartesianGrid, XAxis, LabelList, ResponsiveContainer } from "recharts"
import { Package, Barcode, Truck, Layers, AlertTriangle, CheckCircle2, Warehouse, Scan, Clock, Hash, TrendingUp, AlertCircle, BarChart3 } from "lucide-react"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"

interface DashboardProps {
  userName: string
  summary: {
    totalProducts: number
    totalBarcodes: number
    totalTransfers: number
    totalStock: number
  }
  depletedProducts: { id: number, name: string, quantity: number }[]
  nearDepletedProducts: { id: number, name: string, quantity: number, quantity_alert: number }[]
  transfersByRegion: { region: string, total: number }[]
  scansByOperation: { operation_type: string, total: number }[]
  recentScans: {
    id: number
    product_name: string
    barcode: string
    operation_type: string
    scanned_by: string
    scanned_at: string
  }[]
  products: {
    name: string
    current: number
    available: number
    inDelivery: number
    totalDelivered: number
  }[]
}

export default function WarehouseDashboard() {
  const { userName, summary, depletedProducts, nearDepletedProducts, transfersByRegion, scansByOperation, recentScans, products } = usePage<DashboardProps>().props

  const maxStock = Math.max(...products.map(p => p.current), 1)

  return (
    <AppLayout breadcrumbs={[{ title: "Warehouse Dashboard", href: "/waredash" }]}>
      <Head title="Warehouse Dashboard" />
      <div className="flex flex-col gap-6 p-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Warehouse Dashboard</h1>
            <p className="text-muted-foreground mt-1">Welcome back, {userName}.</p>
          </div>
          <Badge variant="secondary" className="gap-1.5 px-3 py-1.5 text-sm">
            <Clock className="size-3.5" />
            Updated just now
          </Badge>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            title="Total Products"
            value={summary.totalProducts}
            icon={<Package className="size-5" />}
            trend="+0.5% this month"
          />
          <SummaryCard
            title="Total Barcodes"
            value={summary.totalBarcodes}
            icon={<Barcode className="size-5" />}
            trend="Scanned items"
          />
          <SummaryCard
            title="Total Transfers"
            value={summary.totalTransfers}
            icon={<Truck className="size-5" />}
            trend="Outgoing stock"
          />
          <SummaryCard
            title="Stock Quantity"
            value={summary.totalStock}
            icon={<Layers className="size-5" />}
            trend="Units in warehouse"
          />
        </div>

        {/* Stock Alerts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-destructive/30">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="flex size-9 items-center justify-center rounded-lg bg-destructive/10">
                  <AlertCircle className="size-5 text-destructive" />
                </div>
                <div>
                  <CardTitle className="text-base">Depleted Products</CardTitle>
                  <CardDescription>Items at zero stock</CardDescription>
                </div>
                <Badge variant="destructive" className="ml-auto text-lg font-bold size-9 flex items-center justify-center rounded-full p-0">
                  {depletedProducts.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {depletedProducts.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {depletedProducts.map((p) => (
                    <Badge key={p.id} variant="destructive" className="text-xs">
                      {p.name}
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4 text-green-500" />
                  All products are in stock
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-amber-500/30">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="flex size-9 items-center justify-center rounded-lg bg-amber-500/10">
                  <AlertTriangle className="size-5 text-amber-500" />
                </div>
                <div>
                  <CardTitle className="text-base">Near-Depleted Products</CardTitle>
                  <CardDescription>At or below alert threshold</CardDescription>
                </div>
                <Badge variant="outline" className="ml-auto text-lg font-bold size-9 flex items-center justify-center rounded-full p-0 border-amber-500 text-amber-500">
                  {nearDepletedProducts.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {nearDepletedProducts.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {nearDepletedProducts.map((p) => (
                    <Badge key={p.id} variant="secondary" className="text-xs border-amber-500/50">
                      {p.name} ({p.quantity} left)
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4 text-green-500" />
                  All products above alert threshold
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid md:grid-cols-2 gap-4">
          <ChartCard
            title="Transfers by Region"
            description="Stock movement per region"
            data={transfersByRegion}
            xKey="region"
            color="var(--color-chart-1)"
          />
          <ChartCard
            title="Scans by Operation"
            description="Barcode scan breakdown"
            data={scansByOperation}
            xKey="operation_type"
            color="var(--color-chart-2)"
          />
        </div>

        {/* Product Stock Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Product Stock Status</CardTitle>
                <CardDescription>Stock breakdown per product</CardDescription>
              </div>
              <Badge variant="outline" className="gap-1">
                <Hash className="size-3" />
                {products.length} products
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[200px]">Product</TableHead>
                  <TableHead>Current Stock</TableHead>
                  <TableHead>Available</TableHead>
                  <TableHead>In Delivery</TableHead>
                  <TableHead>Total Delivered</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      <Warehouse className="size-8 mx-auto mb-2 opacity-50" />
                      No product data available
                    </TableCell>
                  </TableRow>
                ) : (
                  products.map((p, i) => {
                    const stockPercent = maxStock > 0 ? Math.round((p.current / maxStock) * 100) : 0
                    const isLow = p.current <= 5
                    const isMedium = p.current > 5 && p.current <= 20

                    return (
                      <TableRow key={i} className={isLow ? "bg-destructive/5" : ""}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <div className={`size-2 rounded-full ${isLow ? 'bg-destructive' : isMedium ? 'bg-amber-500' : 'bg-green-500'}`} />
                            {p.name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Progress
                              value={stockPercent}
                              className={`h-2 w-24 ${isLow ? '[&>div]:bg-destructive' : isMedium ? '[&>div]:bg-amber-500' : ''}`}
                            />
                            <span className={`font-mono text-sm tabular-nums ${isLow ? 'text-destructive font-bold' : ''}`}>
                              {p.current}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm tabular-nums">{p.available}</span>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm tabular-nums">{p.inDelivery}</span>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm tabular-nums">{p.totalDelivered}</span>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Recent Scans */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Scans</CardTitle>
                <CardDescription>Last 10 barcode scans</CardDescription>
              </div>
              <Badge variant="outline" className="gap-1">
                <Scan className="size-3" />
                {recentScans.length} scans
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Barcode</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Operation</TableHead>
                  <TableHead>Scanned By</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentScans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      <Scan className="size-8 mx-auto mb-2 opacity-50" />
                      No recent scans
                    </TableCell>
                  </TableRow>
                ) : (
                  recentScans.map(scan => (
                    <TableRow key={scan.id}>
                      <TableCell>
                        <code className="rounded bg-muted px-2 py-0.5 text-xs font-mono">{scan.barcode}</code>
                      </TableCell>
                      <TableCell className="font-medium">{scan.product_name}</TableCell>
                      <TableCell>
                        <Badge variant={scan.operation_type === 'inbound' ? 'default' : 'secondary'}>
                          {scan.operation_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{scan.scanned_by}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(scan.scanned_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

      </div>
    </AppLayout>
  )
}

function SummaryCard({ title, value, icon, trend }: { title: string; value: number; icon: React.ReactNode; trend: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between pb-2 gap-4">
        <div>
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <div className="text-3xl font-bold mt-1 tracking-tight">{value.toLocaleString()}</div>
        </div>
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/5 text-primary">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <TrendingUp className="size-3" />
          {trend}
        </div>
      </CardContent>
    </Card>
  )
}

function ChartCard({ title, description, data, xKey, color }: { title: string; description?: string; data: any[]; xKey: string; color: string }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
            <BarChart3 className="size-4 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-sm">{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="h-[280px]">
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            No data available
          </div>
        ) : (
          <ChartContainer config={{ total: { label: "Total", color } }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                <defs>
                  <linearGradient id={`fill-${xKey}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey={xKey}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ fontSize: 12 }}
                  stroke="var(--muted-foreground)"
                />
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Bar dataKey="total" fill={`url(#fill-${xKey})`} radius={8}>
                  <LabelList position="top" className="fill-foreground text-xs" fontWeight={600} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
