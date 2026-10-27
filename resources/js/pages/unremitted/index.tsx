"use client";

import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Deferred, Head, usePage, router } from '@inertiajs/react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FilterIcon, RefreshCwIcon, ChevronsUpDown, Check, LoaderCircle } from "lucide-react";
import * as React from 'react';
import { format } from "date-fns";
import { type DateRange } from 'react-day-picker';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Checkbox } from "@/components/ui/checkbox";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from "@/components/ui/pagination";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandInput,
} from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

const BASE_COLUMNS = [
  'order_no', 'client_name', 'product_name', 'amount', 'phone',
  'status', 'delivery_date', 'merchant', 'code', 'agent',
] as const;

const statusColors: Record<string, string> = {
  Delivered: "bg-success/10 text-success border-success/30",
  Pending: "bg-warning/10 text-warning-foreground border-warning/30",
  Scheduled: "bg-accent text-foreground border-border",
  Dispatched: "bg-accent text-foreground border-border",
  Cancelled: "bg-destructive/10 text-destructive border-destructive/30",
  Followup: "bg-accent text-foreground border-border",
  WrongContact: "bg-muted text-foreground border-border",
};

const BREADCRUMBS: BreadcrumbItem[] = [
  { title: 'Dashboard', href: '/dashboard' },
  { title: 'Unremitted Orders', href: '/unremitted' },
];

interface SheetOrder {
  id: number;
  order_no: string;
  client_name: string;
  product_name: string;
  address: string;
  phone: string;
  status: string;
  delivery_date: string;
  merchant: string;
  code: string;
  agent: string | null;
  updated_at: string;
}

interface PaginationLinkData {
  url: string | null;
  label: string;
  active: boolean;
}

const EMPTY_ORDERS = { data: [] as SheetOrder[], links: [] as PaginationLinkData[] };

function OrdersTableSkeleton() {
  return (
    <div className="mt-4 space-y-3" role="status" aria-label="Loading orders" aria-live="polite">
      <div className="overflow-hidden rounded-xl border">
        <div className="grid grid-cols-4 gap-3 border-b bg-muted/30 p-3 sm:grid-cols-8">
          {Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-4 w-full" />)}
        </div>
        {Array.from({ length: 8 }).map((_, row) => (
          <div key={row} className="grid grid-cols-4 gap-3 border-b p-3 last:border-0 sm:grid-cols-8">
            {Array.from({ length: 8 }).map((__, column) => <Skeleton key={column} className="h-4 w-full" />)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Index() {
  const isMobile = useIsMobile();
  const { props } = usePage();
  const pageData = props as unknown as {
    orders: { data: SheetOrder[], links: PaginationLinkData[] },
    merchantUsers: string[],
    auth: { user: { id: number; name: string; roles: string } },
  };
  const orders = pageData.orders ?? EMPTY_ORDERS;
  const merchantUsers = pageData.merchantUsers ?? [];
  const auth = pageData.auth;

  const hiddenRoles = ["callcenter1", "merchant", "operations"];

  const COLUMNS = hiddenRoles.includes(auth.user.roles)
    ? BASE_COLUMNS
    : [...BASE_COLUMNS, "remit"];

  const [filters, setFilters] = React.useState<Record<string, string | string[]>>({});
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>();
  const [filterDialogOpen, setFilterDialogOpen] = React.useState(false);
  const [merchantOpen, setMerchantOpen] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isApplyingFilters, setIsApplyingFilters] = React.useState(false);
  const [remittingOrderId, setRemittingOrderId] = React.useState<number | null>(null);

  const normalizeDate = React.useCallback((date?: Date) => {
    if (!date) return undefined;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
  }, []);

  const normalizeDateRange = React.useCallback((range?: DateRange) => {
    if (!range) return undefined;

    return {
      from: normalizeDate(range.from),
      to: normalizeDate(range.to),
    };
  }, [normalizeDate]);

  const formatDate = (date: Date) => format(date, "yyyy-MM-dd");

  const applyFilters = () => {
    setIsApplyingFilters(true);
    router.get('/unremitted', {
      ...filters,
      from_date: dateRange?.from ? formatDate(dateRange.from) : undefined,
      to_date: dateRange?.to ? formatDate(dateRange.to) : undefined,
    }, {
      preserveState: true,
      onSuccess: () => toast.success('Filters applied'),
      onError: () => toast.error('Failed to apply filters'),
      onFinish: () => setIsApplyingFilters(false),
    });
    setFilterDialogOpen(false);
  };

  const clearFilters = () => {
    setFilters({});
    setDateRange(undefined);
    setIsApplyingFilters(true);
    router.get('/unremitted', {}, {
      preserveState: true,
      onSuccess: () => toast.success('Filters cleared'),
      onError: () => toast.error('Failed to clear filters'),
      onFinish: () => setIsApplyingFilters(false),
    });
  };

  const refreshOrders = () => {
    setIsRefreshing(true);
    router.get('/unremitted', {}, {
      preserveState: true,
      onSuccess: () => toast.success('Orders refreshed'),
      onError: () => toast.error('Failed to refresh orders'),
      onFinish: () => setIsRefreshing(false),
    });
  };

  // Remit Handler
  const handleRemit = (orderId: number, checked: boolean) => {
    setRemittingOrderId(orderId);
    router.put(`/sheetorders/${orderId}`, { agent: checked ? "Remitted" : "" }, {
      preserveState: true,
      preserveScroll: true,
      only: ['orders'],
      onSuccess: () => toast.success(checked ? 'Order marked as remitted' : 'Remittance removed'),
      onError: () => toast.error('Failed to update remittance'),
      onFinish: () => setRemittingOrderId(null),
    });
  };

  const dashboardMetrics = React.useMemo(() => {
    const total = orders.data.length;
    const remitted = orders.data.filter((order) => order.agent === "Remitted").length;
    const merchants = new Set(orders.data.map((order) => order.merchant).filter(Boolean)).size;

    return {
      total,
      remitted,
      pendingRemit: total - remitted,
      merchants,
    };
  }, [orders.data]);

  const getStatusPillClass = (status: string) => {
    const normalized = status?.trim() || "New Orders";
    return statusColors[normalized] || "bg-muted text-foreground border-border";
  };

  return (
    <AppLayout breadcrumbs={BREADCRUMBS}>
      <Head title="Unremitted Orders" />

      <div className="space-y-4 px-4 pt-4">
        <div className="rounded-xl border bg-gradient-to-r from-muted to-accent p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Unremitted Orders</h1>
              <p className="text-sm text-muted-foreground">Monitor remittance progress and mark payouts in one place.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="h-9 gap-2" onClick={() => setFilterDialogOpen(true)}>
                <FilterIcon className="h-4 w-4" />
                Filters
              </Button>
              <Button variant="outline" className="h-9 gap-2" onClick={refreshOrders} disabled={isRefreshing}>
                {isRefreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCwIcon className="h-4 w-4" />}
                Refresh
              </Button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border bg-background/80 p-3">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-lg font-semibold">{dashboardMetrics.total}</p>
            </div>
            <div className="rounded-lg border bg-background/80 p-3">
              <p className="text-xs text-muted-foreground">Pending Remit</p>
              <p className="text-lg font-semibold">{dashboardMetrics.pendingRemit}</p>
            </div>
            <div className="rounded-lg border bg-background/80 p-3">
              <p className="text-xs text-muted-foreground">Remitted</p>
              <p className="text-lg font-semibold">{dashboardMetrics.remitted}</p>
            </div>
            <div className="rounded-lg border bg-background/80 p-3">
              <p className="text-xs text-muted-foreground">Merchants</p>
              <p className="text-lg font-semibold">{dashboardMetrics.merchants}</p>
            </div>
          </div>
        </div>
      </div>

      <Deferred data="orders" fallback={<OrdersTableSkeleton />}>
      {() => <>
      <div className="mt-4 border rounded-xl shadow-sm">
        <div className="scrollbar-custom w-full overflow-x-auto">
          <Table className="min-w-[1120px] border border-border">
            <TableHeader className="sticky top-0 z-10 bg-muted backdrop-blur supports-[backdrop-filter]:bg-muted">
              <TableRow>
                {COLUMNS.map(col => (
                  <TableHead
                    key={col}
                    className="min-w-[120px] whitespace-nowrap border border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:text-sm"
                  >
                    {col === "remit" ? "Mark Remitted" : col}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>

            <TableBody>
              {orders.data.map(order => (
                <TableRow key={order.id} className="hover:bg-accent">
                  {COLUMNS.map(col => {
                    if (col === "remit") {
                      return (
                        <TableCell key={col} className="min-w-[120px] border border-border text-center">
                          <Checkbox
                            checked={order.agent === "Remitted"}
                            disabled={remittingOrderId === order.id}
                            onCheckedChange={checked => handleRemit(order.id, !!checked)}
                          />
                          {remittingOrderId === order.id ? <LoaderCircle className="mx-auto mt-2 h-4 w-4 animate-spin text-muted-foreground" /> : null}
                        </TableCell>
                      );
                    }

                    const value =
                      col === "status"
                        ? order.status?.trim() || "New Orders"
                        : String(order[col] || "");

                    return (
                      <TableCell
                        key={col}
                        className="min-w-[120px] max-w-[180px] truncate whitespace-nowrap border border-border"
                      >
                        {col === "status" ? (
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusPillClass(value)}`}>
                            {value}
                          </span>
                        ) : (
                          value
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="mt-4 flex justify-center">
        <Pagination>
          <PaginationContent className="flex-wrap">
            {orders.links.map((link, index) => (
              <PaginationItem key={index}>
                <PaginationLink
                  as="button"
                  isActive={link.active}
                  disabled={!link.url}
                  onClick={() => link.url && router.get(link.url, {}, { preserveState: true })}
                >
                  {link.label}
                </PaginationLink>
              </PaginationItem>
            ))}
          </PaginationContent>
        </Pagination>
      </div>

      </>}
      </Deferred>

      {/* Filter Dialog */}
      {filterDialogOpen && (
        <Dialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
          <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Filter Orders</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 mt-4">

              {/* Merchant Filter */}
              <div className="flex flex-col space-y-2">
                <label className="text-sm font-medium">Merchant</label>
                <Popover open={merchantOpen} onOpenChange={setMerchantOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between"
                    >
                      {typeof filters.merchant === 'string' && filters.merchant ? filters.merchant : "Select Merchant"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[calc(100vw-3rem)] sm:w-[250px]">
                    <Command>
                      <CommandInput placeholder="Search merchant..." />
                      <CommandList>
                        <CommandEmpty>No merchants found.</CommandEmpty>
                        <CommandGroup>
                          {merchantUsers.length > 0 ? (
                            merchantUsers.map((merchant: string, idx: number) => (
                              <CommandItem
                                key={idx}
                                value={merchant}
                                onSelect={() => {
                                  setFilters((prev) => ({
                                    ...prev,
                                    merchant,
                                  }));
                                  setMerchantOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    filters.merchant === merchant
                                      ? "opacity-100"
                                      : "opacity-0"
                                  )}
                                />
                                {merchant}
                              </CommandItem>
                            ))
                          ) : (
                            <div className="p-2 text-sm text-muted-foreground">
                              No merchants found
                            </div>
                          )}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Delivery Date Range Filter */}
              <div className="flex flex-col space-y-2">
                <label className="text-sm font-medium">Delivery Date Range</label>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dateRange?.from && "text-muted-foreground"
                      )}
                    >
                      {dateRange?.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, "yyyy-MM-dd")} –{" "}
                            {format(dateRange.to, "yyyy-MM-dd")}
                          </>
                        ) : (
                          format(dateRange.from, "yyyy-MM-dd")
                        )
                      ) : (
                        "Select date range"
                      )}
                    </Button>
                  </PopoverTrigger>

                  <PopoverContent
                    className="p-0 w-[calc(100vw-3rem)] sm:w-auto shadow-lg border bg-popover"
                    side="bottom"
                    align="start"
                  >
                    <Calendar
                      mode="range"
                      numberOfMonths={isMobile ? 1 : 2}
                      selected={dateRange}
                      onSelect={(range) => setDateRange(normalizeDateRange(range))}
                    />
                  </PopoverContent>
                </Popover>
              </div>

            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={clearFilters} disabled={isApplyingFilters}>
                {isApplyingFilters ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                Clear
              </Button>
              <Button onClick={applyFilters} disabled={isApplyingFilters}>
                {isApplyingFilters ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                Apply
              </Button>
            </div>

          </DialogContent>
        </Dialog>
      )}
    </AppLayout>
  );
}
