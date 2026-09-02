import AppLayout from '@/layouts/app-layout'
import { Head, usePage } from '@inertiajs/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, LabelList, ResponsiveContainer } from "recharts"
import { Package, Barcode, Truck, Layers, AlertTriangle, CheckCircle2, Warehouse, Scan, Hash, AlertCircle, BarChart3 } from "lucide-react"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { cn } from "@/lib/utils"
import * as React from "react"

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
  const { userName, summary, depletedProducts, nearDepletedProducts, transfersByRegion, recentScans, products } = usePage<DashboardProps>().props

  const maxStock = Math.max(...products.map(p => p.current), 1)

  const PRODUCTS_PER_PAGE = 10
  const [productPage, setProductPage] = React.useState(1)
  const totalProductPages = Math.max(1, Math.ceil(products.length / PRODUCTS_PER_PAGE))

  React.useEffect(() => {
    if (productPage > totalProductPages) setProductPage(totalProductPages)
  }, [productPage, totalProductPages])

  const paginatedProducts = React.useMemo(() => {
    const startIndex = (productPage - 1) * PRODUCTS_PER_PAGE
    return products.slice(startIndex, startIndex + PRODUCTS_PER_PAGE)
  }, [products, productPage])

  const pageNumbers = React.useMemo(() => {
    if (totalProductPages <= 7) return Array.from({ length: totalProductPages }, (_, i) => i + 1)
    const pages: (number | '...')[] = [1]
    const start = Math.max(2, productPage - 1)
    const end = Math.min(totalProductPages - 1, productPage + 1)
    if (start > 2) pages.push('...')
    for (let i = start; i <= end; i++) pages.push(i)
    if (end < totalProductPages - 1) pages.push('...')
    pages.push(totalProductPages)
    return pages
  }, [productPage, totalProductPages])

  return (
    <AppLayout breadcrumbs={[{ title: "Warehouse Dashboard", href: "/waredash" }]}>
      <Head title="Warehouse Dashboard" />
      <div className="flex flex-col gap-6 p-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Warehouse Dashboard</h1>
            <p className="text-muted-foreground mt-1">Welcome back, {userName}.</p>
          </div>
          <Badge variant="outline" className="gap-2 px-3 py-1.5 text-xs font-normal text-muted-foreground">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-chart-2 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-chart-2" />
            </span>
            Updated just now
          </Badge>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Total Products"
            value={summary.totalProducts}
            icon={<Package className="size-5" />}
            hint="Registered in catalog"
            accent="bg-chart-1/10 text-chart-1"
          />
          <SummaryCard
            title="Total Barcodes"
            value={summary.totalBarcodes}
            icon={<Barcode className="size-5" />}
            hint="Scanned items"
            accent="bg-chart-2/10 text-chart-2"
          />
          <SummaryCard
            title="Total Transfers"
            value={summary.totalTransfers}
            icon={<Truck className="size-5" />}
            hint="Outgoing stock"
            accent="bg-chart-3/10 text-chart-3"
          />
          <SummaryCard
            title="Stock Quantity"
            value={summary.totalStock}
            icon={<Layers className="size-5" />}
            hint="Units in warehouse"
            accent="bg-chart-4/10 text-chart-4"
          />
        </div>

        {/* Stock Alerts */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="border-destructive/40">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-destructive/10">
                  <AlertCircle className="size-5 text-destructive" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-sm">Depleted Products</CardTitle>
                  <CardDescription className="text-xs">Items at zero stock</CardDescription>
                </div>
                <Badge variant="destructive" className="flex size-8 items-center justify-center rounded-full p-0 font-semibold">
                  {depletedProducts.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {depletedProducts.length > 0 ? (
                <div className="scrollbar-custom max-h-[280px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10">
                      <TableRow className="bg-muted/80 backdrop-blur supports-[backdrop-filter]:bg-muted/60">
                        <TableHead className="w-[70%]">Product</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {depletedProducts.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <span className="size-2 shrink-0 rounded-full bg-destructive" />
                              {p.name}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="destructive" className="font-mono tabular-nums">
                              {p.quantity}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4 text-chart-2" />
                  All products are in stock
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-accent">
                  <AlertTriangle className="size-5 text-accent-foreground" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-sm">Near-Depleted Products</CardTitle>
                  <CardDescription className="text-xs">At or below alert threshold</CardDescription>
                </div>
                <Badge variant="outline" className="flex size-8 items-center justify-center rounded-full p-0 font-semibold">
                  {nearDepletedProducts.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {nearDepletedProducts.length > 0 ? (
                <div className="scrollbar-custom max-h-[280px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10">
                      <TableRow className="bg-muted/80 backdrop-blur supports-[backdrop-filter]:bg-muted/60">
                        <TableHead className="w-[45%]">Product</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right">Alert</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {nearDepletedProducts.map((p) => (
                        <TableRow key={p.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <span className="size-2 shrink-0 rounded-full bg-chart-4" />
                                {p.name}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="font-mono text-sm tabular-nums">{p.quantity}</span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="font-mono text-sm tabular-nums text-muted-foreground">{p.quantity_alert}</span>
                            </TableCell>
                          </TableRow>
                        )
                      )}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4 text-chart-2" />
                  All products above alert threshold
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <ChartCard
          title="Transfers by Region"
          description="Stock movement per region"
          data={transfersByRegion}
          xKey="region"
          color="var(--color-chart-1)"
        />

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
                  paginatedProducts.map((p, i) => {
                    const stockPercent = maxStock > 0 ? Math.round((p.current / maxStock) * 100) : 0
                    const isLow = p.current <= 5
                    const isMedium = p.current > 5 && p.current <= 20
                    const dotClass = isLow ? 'bg-destructive' : isMedium ? 'bg-chart-4' : 'bg-chart-2'
                    const barClass = isLow ? '[&>div]:bg-destructive' : isMedium ? '[&>div]:bg-chart-4' : ''

                    return (
                      <TableRow key={i} className={isLow ? "bg-destructive/5" : ""}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2.5">
                            <span className={`size-2.5 shrink-0 rounded-full ${dotClass}`} />
                            {p.name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Progress
                              value={stockPercent}
                              className={`h-2 w-24 ${barClass}`}
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
          {totalProductPages > 1 && (
            <div className="border-t">
              <Pagination>
                <PaginationContent className="flex-wrap">
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      className={cn(productPage === 1 && 'pointer-events-none opacity-50')}
                      onClick={(e) => { e.preventDefault(); setProductPage((p) => Math.max(1, p - 1)) }}
                    />
                  </PaginationItem>
                  {pageNumbers.map((page, index) =>
                    page === '...' ? (
                      <PaginationItem key={`ellipsis-${index}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={page}>
                        <PaginationLink
                          href="#"
                          isActive={page === productPage}
                          onClick={(e) => { e.preventDefault(); setProductPage(page) }}
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    ),
                  )}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      className={cn(productPage === totalProductPages && 'pointer-events-none opacity-50')}
                      onClick={(e) => { e.preventDefault(); setProductPage((p) => Math.min(totalProductPages, p + 1)) }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
              <p className="pb-3 text-center text-xs text-muted-foreground">
                Showing {Math.min((productPage - 1) * PRODUCTS_PER_PAGE + 1, products.length)}–
                {Math.min(productPage * PRODUCTS_PER_PAGE, products.length)} of {products.length} products
              </p>
            </div>
          )}
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

function SummaryCard({ title, value, hint, icon, accent }: { title: string; value: number; hint: string; icon: React.ReactNode; accent: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div className="space-y-1">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <div className="text-2xl font-bold tracking-tight">{value.toLocaleString()}</div>
        </div>
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${accent}`}>{icon}</div>
      </CardHeader>
      <CardContent className="border-t pt-3">
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}

function ChartCard({ title, description, data, xKey, color }: { title: string; description?: string; data: any[]; xKey: string; color: string }) {
  const chartHeight = Math.max(240, data.length * 44 + 40)
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
      <CardContent className="overflow-hidden" style={{ height: chartHeight }}>
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            No data available
          </div>
        ) : (
          <ChartContainer config={{ total: { label: "Total", color } }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 8 }}>
                <defs>
                  <linearGradient id={`fill-${xKey}`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="5%" stopColor={color} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid horizontal={false} stroke="var(--border)" />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                />
                <YAxis
                  dataKey={xKey}
                  type="category"
                  width={140}
                  interval={0}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                  tickFormatter={(v) => (typeof v === 'string' && v.length > 22 ? `${v.slice(0, 21)}…` : v)}
                />
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Bar dataKey="total" fill={`url(#fill-${xKey})`} radius={[0, 8, 8, 0]} barSize={24}>
                  <LabelList
                    dataKey="total"
                    position="right"
                    className="fill-foreground text-xs"
                    fontWeight={600}
                    formatter={(v) => (typeof v === 'number' ? v.toLocaleString() : v)}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
