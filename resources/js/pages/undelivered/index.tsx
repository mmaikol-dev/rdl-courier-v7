"use client";

import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, usePage, router } from '@inertiajs/react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FilterIcon, RefreshCwIcon, ChevronsUpDown, Check, LoaderCircle } from "lucide-react";
import * as React from 'react';
import { Calendar } from '@/components/ui/calendar';
import { format } from "date-fns";
import { type DateRange } from 'react-day-picker';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Checkbox } from "@/components/ui/checkbox";
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from "@/components/ui/pagination";

const COLUMNS = [
  'order_no', 'client_name', 'product_name', 'amount','phone',
  'status', 'delivery_date', 'merchant', 'code',
] as const;

const STATUS_OPTIONS = [
  'Scheduled',
  'Delivered',
] as const;

const BREADCRUMBS: BreadcrumbItem[] = [
  { title: 'Dashboard', href: '/dashboard' },
  { title: 'Undelivered Orders', href: '/undelivered' },
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
  updated_at: string;
}

interface PaginationLinkData {
  url: string | null;
  label: string;
  active: boolean;
}

export default function Index() {
  const isMobile = useIsMobile();
  const { props } = usePage();
  const { orders, merchantUsers } = props as unknown as {
    orders: { data: SheetOrder[], links: PaginationLinkData[] },
    merchantUsers: string[],
  };

  const [filters, setFilters] = React.useState<Record<string, string | string[]>>({});
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>();
  const [editing, setEditing] = React.useState<{ order: SheetOrder; field: keyof SheetOrder } | null>(null);
  const [editValue, setEditValue] = React.useState('');
  const [filterDialogOpen, setFilterDialogOpen] = React.useState(false);
  const [merchantOpen, setMerchantOpen] = React.useState(false);
  const [statusOpen, setStatusOpen] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isApplyingFilters, setIsApplyingFilters] = React.useState(false);
  const [isSavingStatus, setIsSavingStatus] = React.useState(false);

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

  const updateMultiSelectFilter = React.useCallback((key: string, value: string, checked: boolean) => {
    setFilters(prev => {
      const current = (prev[key] as string[]) || [];
      if (checked) {
        return { ...prev, [key]: [...current, value] };
      } else {
        return { ...prev, [key]: current.filter(item => item !== value) };
      }
    });
  }, []);

  const formatDate = React.useCallback((date: Date) => {
    return format(date, "yyyy-MM-dd");
  }, []);

  const applyFilters = React.useCallback(() => {
    setIsApplyingFilters(true);
    router.get('/undelivered', {
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
  }, [filters, dateRange, formatDate]);

  const clearFilters = React.useCallback(() => {
    setFilters({});
    setDateRange(undefined);
    setIsApplyingFilters(true);
    router.get('/undelivered', {}, {
      preserveState: true,
      onSuccess: () => toast.success('Filters cleared'),
      onError: () => toast.error('Failed to clear filters'),
      onFinish: () => setIsApplyingFilters(false),
    });
  }, []);

  const refreshOrders = React.useCallback(() => {
    setIsRefreshing(true);
    router.get('/undelivered', {}, {
      preserveState: true,
      onSuccess: () => toast.success('Orders refreshed'),
      onError: () => toast.error('Failed to refresh orders'),
      onFinish: () => setIsRefreshing(false),
    });
  }, []);

  const handleEdit = (order: SheetOrder, field: keyof SheetOrder) => {
    if (field !== 'status') return;
    setEditing({ order, field });
    setEditValue(String(order[field] || ''));
  };

  const handleCloseEditModal = React.useCallback(() => {
    if (editing && editValue !== String(editing.order[editing.field] || '')) {
      setIsSavingStatus(true);
      router.put(`/sheetorders/${editing.order.id}`, { [editing.field]: editValue }, {
        preserveState: true,
        preserveScroll: true,
        only: ['orders'],
        onSuccess: () => toast.success('Order status updated'),
        onError: () => toast.error('Failed to update order status'),
        onFinish: () => setIsSavingStatus(false),
      });
    }
    setEditing(null);
    setEditValue('');
    setStatusOpen(false);
  }, [editing, editValue]);

  const dashboardMetrics = React.useMemo(() => {
    const total = orders.data.length;
    const delivered = orders.data.filter((order) => order.status?.trim() === 'Delivered').length;
    const scheduled = orders.data.filter((order) => order.status?.trim() === 'Scheduled').length;
    const merchants = new Set(orders.data.map((order) => order.merchant).filter(Boolean)).size;

    return {
      total,
      delivered,
      scheduled,
      outstanding: total - delivered,
      merchants,
    };
  }, [orders.data]);

  const statusPillClass = (status: string) => {
    const normalized = status?.trim() || "New Orders";
    if (normalized === 'Delivered') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (normalized === 'Scheduled') return 'bg-sky-100 text-sky-700 border-sky-200';
    if (normalized === 'Pending') return 'bg-amber-100 text-amber-700 border-amber-200';
    if (normalized === 'Cancelled') return 'bg-rose-100 text-rose-700 border-rose-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  return (
    <AppLayout breadcrumbs={BREADCRUMBS}>
      <Head title="Undelivered Orders" />

      <div className="space-y-4 px-4 pt-4">
        <div className="rounded-xl border bg-gradient-to-r from-slate-50 to-amber-50 p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Undelivered Orders</h1>
              <p className="text-sm text-muted-foreground">Track pending deliveries and update statuses quickly.</p>
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
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p className="text-lg font-semibold">{dashboardMetrics.outstanding}</p>
            </div>
            <div className="rounded-lg border bg-background/80 p-3">
              <p className="text-xs text-muted-foreground">Scheduled</p>
              <p className="text-lg font-semibold">{dashboardMetrics.scheduled}</p>
            </div>
            <div className="rounded-lg border bg-background/80 p-3">
              <p className="text-xs text-muted-foreground">Merchants</p>
              <p className="text-lg font-semibold">{dashboardMetrics.merchants}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 border rounded-xl shadow-sm">
        <div className="scrollbar-custom w-full overflow-x-auto">
        <Table className="min-w-[980px] border border-slate-200">
  <TableHeader className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur supports-[backdrop-filter]:bg-slate-50/80">
    <TableRow>
      {COLUMNS.map(col => (
        <TableHead
          key={col}
          className="min-w-[120px] whitespace-nowrap border border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-600 sm:text-sm"
        >
          {col}
        </TableHead>
      ))}
    </TableRow>
  </TableHeader>

  <TableBody>
    {orders.data.map(order => (
      <TableRow key={order.id} className="hover:bg-amber-50/40">
        {COLUMNS.map(col => {
          const value =
            col === "status"
              ? order.status?.trim() || "New Orders"
              : String(order[col] || "");
          return (
            <TableCell
              key={col}
              className={`min-w-[120px] max-w-[180px] truncate whitespace-nowrap border border-slate-100 ${
                col === "status" ? "cursor-pointer" : ""
              }`}
              onClick={col === 'status' ? () => handleEdit(order, col) : undefined}
            >
              {col === 'status' ? (
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusPillClass(value)}`}>
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

      {/* Filter Dialog */}
      {filterDialogOpen && (
        <Dialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
          <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Filter Orders</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 mt-2">
              {/* Merchant filter */}
              <Popover open={merchantOpen} onOpenChange={setMerchantOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between text-left">
                    {filters.merchant && (filters.merchant as string[]).length > 0
                      ? (filters.merchant as string[]).join(', ')
                      : 'Merchant(s)'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[calc(100vw-3rem)] p-0 sm:w-72">
                  <Command>
                    <CommandInput placeholder="Search merchants..." />
                    <CommandList>
                      <CommandEmpty>No merchants found.</CommandEmpty>
                      <CommandGroup>
                        {merchantUsers.map((name: string) => {
                          const selected = ((filters.merchant as string[]) || []).includes(name);
                          return (
                            <CommandItem
                              key={name}
                              value={name}
                              onSelect={() => updateMultiSelectFilter('merchant', name, !selected)}
                            >
                              <Check className={cn("mr-2 h-4 w-4", selected ? "opacity-100" : "opacity-0")} />
                              <span className="truncate">{name}</span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Delivery Date filter */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    {dateRange?.from && dateRange?.to
                      ? `${dateRange.from.toLocaleDateString()} - ${dateRange.to.toLocaleDateString()}`
                      : 'Delivery date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[calc(100vw-3rem)] sm:w-auto p-2">
                  <Calendar
                    mode="range"
                    selected={dateRange}
                    onSelect={(range) => setDateRange(normalizeDateRange(range))}
                    numberOfMonths={isMobile ? 1 : 2}
                    className="rounded-lg border shadow-sm"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex justify-end gap-2 mt-4">
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

      {/* Edit Modal */}
      {editing && (
        <Dialog open={!!editing} onOpenChange={handleCloseEditModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Status for Order #{editing.order.order_no}</DialogTitle>
            </DialogHeader>
            <Popover open={statusOpen} onOpenChange={setStatusOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between">
                  {editValue || 'Select status'}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput placeholder="Search status..." />
                  <CommandList>
                    <CommandEmpty>No status found.</CommandEmpty>
                    <CommandGroup>
                      {STATUS_OPTIONS.map((status) => (
                        <CommandItem
                          key={status}
                          value={status}
                          onSelect={() => {
                            setEditValue(status);
                            setStatusOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", editValue === status ? "opacity-100" : "opacity-0")} />
                          {status}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <div className="flex justify-end">
              <Button onClick={handleCloseEditModal} disabled={isSavingStatus}>
                {isSavingStatus ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </AppLayout>
  );
}
