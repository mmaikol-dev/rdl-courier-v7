import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Deferred, Head, router, usePage } from '@inertiajs/react';
import { addDays } from 'date-fns';
import { AlertCircle, CalendarDays, Check, ChevronsUpDown, Filter, RotateCcw, Skull, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { type DateRange } from 'react-day-picker';

import { HoldToConfirm } from '@/components/hold-to-confirm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Pagination, PaginationContent, PaginationItem, PaginationLink } from '@/components/ui/pagination';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS = [
  'Scheduled',
  'Dispatched',
  'Followup',
  'Duplicate',
  'Cancelled',
  'Pending',
  'OutofStock',
  'Expired',
  'Returned',
  'WrongContact',
  'Delivered',
  'New Orders',
] as const;

const breadcrumbs: BreadcrumbItem[] = [
  { title: 'Dashboard', href: '/dashboard' },
  { title: 'Bulk Expire Orders', href: '/orders/bulk-expire' },
];

interface OrderPreview {
  id: number;
  order_no: string;
  client_name: string | null;
  product_name: string | null;
  merchant: string | null;
  status: string;
  delivery_date: string | null;
  amount: number | null;
  quantity: number | null;
}

interface PaginationLinkData {
  url: string | null;
  label: string;
  active: boolean;
}

interface PaginatedOrders {
  data: OrderPreview[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  links: PaginationLinkData[];
}

interface BulkExpirePageProps {
  [key: string]: unknown;
  merchants: string[];
  orders: PaginatedOrders | null;
  filters: {
    from_date: string | null;
    to_date: string | null;
    merchant: string | null;
    statuses: string[] | null;
  };
  flash?: { success?: string; error?: string };
  errors?: Record<string, string>;
  hasPreviewed?: boolean;
}

function BulkExpireTableSkeleton() {
  return (
    <div className="space-y-2 rounded-lg border p-3" role="status" aria-label="Loading matching orders" aria-live="polite">
      <div className="grid grid-cols-4 gap-3 border-b pb-3 sm:grid-cols-8">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-4 w-full" />
        ))}
      </div>
      {Array.from({ length: 6 }).map((_, row) => (
        <div key={row} className="grid grid-cols-4 gap-3 border-b py-3 last:border-0 sm:grid-cols-8">
          {Array.from({ length: 8 }).map((__, column) => (
            <Skeleton key={column} className="h-4 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

function formatDateForRequest(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function BulkExpirePage() {
  const { merchants, orders, filters, flash, errors, hasPreviewed = false } = usePage<BulkExpirePageProps>().props;

  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(
    filters.from_date && filters.to_date
      ? { from: new Date(filters.from_date), to: new Date(filters.to_date) }
      : { from: new Date(), to: addDays(new Date(), 30) },
  );
  const [selectedMerchant, setSelectedMerchant] = React.useState(filters.merchant ?? '');
  const [selectedStatuses, setSelectedStatuses] = React.useState<string[]>(filters.statuses ?? []);
  const [processing, setProcessing] = React.useState(false);
  const [merchantOpen, setMerchantOpen] = React.useState(false);
  const [statusOpen, setStatusOpen] = React.useState(false);

  const toggleStatus = (status: string) => {
    setSelectedStatuses((prev) => (prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]));
  };

  const handlePreview = () => {
    if (!dateRange?.from || !dateRange?.to) {
      toast.error('Choose both a start date and an end date to preview orders.');
      return;
    }

    router.get(
      '/orders/bulk-expire',
      {
        from_date: formatDateForRequest(dateRange.from),
        to_date: formatDateForRequest(dateRange.to),
        merchant: selectedMerchant || '',
        statuses: selectedStatuses.length > 0 ? selectedStatuses : null,
      },
      {
        preserveState: true,
        replace: true,
        onError: (responseErrors) => {
          const firstError = Object.values(responseErrors).find((message) => typeof message === 'string');
          toast.error(firstError ?? 'Could not preview orders. Check the filters and try again.');
        },
      },
    );
  };

  const handleExpire = () => {
    if (!dateRange?.from || !dateRange?.to) {
      toast.error('Choose both a start date and an end date before expiring orders.');
      return;
    }

    setProcessing(true);
    return new Promise<void>((resolve, reject) => {
      router.post(
        '/orders/bulk-expire',
        {
          from_date: formatDateForRequest(dateRange.from!),
          to_date: formatDateForRequest(dateRange.to!),
          merchant: selectedMerchant || '',
          statuses: selectedStatuses.length > 0 ? selectedStatuses : null,
        },
        {
          preserveScroll: true,
          onSuccess: () => resolve(),
          onError: (responseErrors) => {
            const firstError = Object.values(responseErrors).find((message) => typeof message === 'string');
            toast.error(firstError ?? 'Could not expire orders. Check the filters and try again.');
            reject(new Error(firstError ?? 'Could not expire orders.'));
          },
          onFinish: () => setProcessing(false),
        },
      );
    });
  };

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Bulk Expire Orders" />

      <div className="w-full space-y-6 p-4 sm:p-6 lg:p-8">
        <header className="space-y-2 border-b pb-5">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Skull className="size-4 text-destructive" /> Order management <span aria-hidden="true">/</span> Bulk expire
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Bulk expire orders</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Find orders by delivery date, merchant, and status. Review the matches before changing their status to Expired.
          </p>
        </header>

        {flash?.success && (
          <Card className="border-success/30 bg-success/10 dark:bg-success">
            <CardContent className="flex items-center gap-2 p-3 text-sm text-success dark:text-success">
              <AlertCircle className="size-4 shrink-0" />
              {flash.success}
            </CardContent>
          </Card>
        )}

        {flash?.error && (
          <Card className="border-destructive/30 bg-destructive/10">
            <CardContent className="flex items-center gap-2 p-3 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              {flash.error}
            </CardContent>
          </Card>
        )}

        {errors && Object.keys(errors).length > 0 && (
          <Card className="border-destructive/30 bg-destructive/10 dark:bg-destructive">
            <CardContent className="flex items-start gap-2 p-3 text-sm text-destructive dark:text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <div className="space-y-1">
                {Object.entries(errors).map(([field, message]) => (
                  <p key={field}>{message}</p>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/20 px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                1
              </span>
              <div>
                <CardTitle className="text-base">Choose which orders to include</CardTitle>
                <CardDescription className="mt-1">Leave a filter broad to include all matching values.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-5">
            <div className="grid gap-5 md:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Delivery date range</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-10 w-full justify-start gap-2 text-left font-normal">
                      <CalendarDays className="size-4 text-muted-foreground" />
                      {dateRange?.from ? (
                        dateRange.to ? (
                          <>
                            {dateRange.from.toLocaleDateString()} &ndash; {dateRange.to.toLocaleDateString()}
                          </>
                        ) : (
                          dateRange.from.toLocaleDateString()
                        )
                      ) : (
                        <span className="text-muted-foreground">Pick a date range</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto max-w-[calc(100vw-2rem)] p-2" align="start">
                    <Calendar
                      mode="range"
                      defaultMonth={dateRange?.from}
                      selected={dateRange}
                      onSelect={setDateRange}
                      numberOfMonths={2}
                      className="rounded-lg border"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Merchant</label>
                <Popover open={merchantOpen} onOpenChange={setMerchantOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="h-10 w-full justify-between">
                      {selectedMerchant || <span className="text-muted-foreground">All merchants</span>}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search merchant..." />
                      <CommandList className="max-h-64 overflow-y-auto">
                        <CommandEmpty>No merchant found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            onSelect={() => {
                              setSelectedMerchant('');
                              setMerchantOpen(false);
                            }}
                          >
                            <Check className={cn('mr-2 h-4 w-4', !selectedMerchant ? 'opacity-100' : 'opacity-0')} />
                            All merchants
                          </CommandItem>
                          {merchants.map((name) => (
                            <CommandItem
                              key={name}
                              value={name}
                              onSelect={() => {
                                setSelectedMerchant(selectedMerchant === name ? '' : name);
                                setMerchantOpen(false);
                              }}
                            >
                              <Check className={cn('mr-2 h-4 w-4', selectedMerchant === name ? 'opacity-100' : 'opacity-0')} />
                              {name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Current status</label>
                <Popover open={statusOpen} onOpenChange={setStatusOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="h-10 w-full justify-between">
                      {selectedStatuses.length > 0 ? (
                        <span className="truncate">
                          {selectedStatuses.length} status{selectedStatuses.length === 1 ? '' : 'es'} selected
                        </span>
                      ) : (
                        <span className="text-muted-foreground">All statuses</span>
                      )}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search status..." />
                      <CommandList className="max-h-64 overflow-y-auto">
                        <CommandEmpty>No status found.</CommandEmpty>
                        <CommandGroup>
                          {STATUS_OPTIONS.map((status) => (
                            <CommandItem key={status} value={status} onSelect={() => toggleStatus(status)}>
                              <Checkbox checked={selectedStatuses.includes(status)} className="mr-2" />
                              {status}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">Orders are matched by their delivery date.</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  className="h-10 gap-2"
                  onClick={() => {
                    setDateRange({ from: new Date(), to: addDays(new Date(), 30) });
                    setSelectedMerchant('');
                    setSelectedStatuses([]);
                  }}
                >
                  <RotateCcw className="size-4" /> Reset
                </Button>
                <Button onClick={handlePreview} className="h-10 gap-2">
                  <Filter className="size-4" /> Preview matching orders
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {hasPreviewed && (
          <Deferred data="orders" fallback={<BulkExpireTableSkeleton />}>
            {() =>
              orders && (
                <Card className="overflow-hidden">
                  <CardHeader className="border-b px-5 py-4">
                    <div className="flex items-start gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        2
                      </span>
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base">Review matching orders</CardTitle>
                        <CardDescription className="mt-1">
                          Check the scope and sample rows below. The action applies to every match across all pages.
                        </CardDescription>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-col gap-4 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-background text-lg font-semibold tabular-nums">
                          {orders.total}
                        </div>
                        <div>
                          <p className="font-medium">{orders.total === 1 ? '1 order matches' : `${orders.total} orders match`}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {orders.total > 0
                              ? `Delivery ${filters.from_date ? new Date(`${filters.from_date}T00:00:00`).toLocaleDateString() : ''} – ${filters.to_date ? new Date(`${filters.to_date}T00:00:00`).toLocaleDateString() : ''}${filters.merchant ? ` · ${filters.merchant}` : ' · All merchants'}${filters.statuses?.length ? ` · ${filters.statuses.join(', ')}` : ' · All statuses'}`
                              : 'Adjust your filters and preview again.'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-3 sm:max-w-sm">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">This change affects all {orders.total} matching orders</p>
                          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                            Each order’s status will become Expired. Hold the button to confirm.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <HoldToConfirm
                        disabled={processing || orders.total === 0}
                        onConfirm={handleExpire}
                        duration={1400}
                        labels={{
                          idle: `Hold to expire ${orders.total} orders`,
                          holding: 'Keep holding to expire',
                          pending: 'Expiring orders…',
                          success: 'Orders expired',
                          error: 'Hold to retry',
                        }}
                        icon={<Skull />}
                        className="rounded-md border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 p-3 pt-0">
                    <div className="overflow-x-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Order number</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead>Product</TableHead>
                            <TableHead>Merchant</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Delivery date</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Quantity</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orders.data.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                                No matching orders found for this filter selection.
                              </TableCell>
                            </TableRow>
                          ) : (
                            orders.data.map((order) => (
                              <TableRow key={order.id}>
                                <TableCell className="font-medium">{order.order_no}</TableCell>
                                <TableCell>{order.client_name || '-'}</TableCell>
                                <TableCell className="max-w-[200px] truncate">{order.product_name || '-'}</TableCell>
                                <TableCell>{order.merchant || '-'}</TableCell>
                                <TableCell>
                                  <Badge variant="secondary">{order.status}</Badge>
                                </TableCell>
                                <TableCell>{order.delivery_date ? new Date(order.delivery_date).toLocaleDateString() : '-'}</TableCell>
                                <TableCell className="text-right">{order.amount ?? '-'}</TableCell>
                                <TableCell className="text-right">{order.quantity ?? '-'}</TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    {orders.last_page > 1 && (
                      <Pagination>
                        <PaginationContent>
                          {orders.links.map((link, i) => {
                            if (link.url === null) return null;
                            const url = new URL(link.url);
                            const page = url.searchParams.get('page');
                            return (
                              <PaginationItem key={i}>
                                <PaginationLink
                                  href={link.url}
                                  isActive={link.active}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    router.get(
                                      '/orders/bulk-expire',
                                      {
                                        from_date: filters.from_date,
                                        to_date: filters.to_date,
                                        merchant: filters.merchant || '',
                                        statuses: filters.statuses && filters.statuses.length > 0 ? filters.statuses : null,
                                        page: Number(page),
                                      },
                                      { preserveState: true, replace: true },
                                    );
                                  }}
                                  dangerouslySetInnerHTML={{ __html: link.label }}
                                />
                              </PaginationItem>
                            );
                          })}
                        </PaginationContent>
                      </Pagination>
                    )}
                  </CardContent>
                </Card>
              )
            }
          </Deferred>
        )}
      </div>
    </AppLayout>
  );
}
