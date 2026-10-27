import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Deferred, Head, router, usePage } from '@inertiajs/react';
import { addDays } from 'date-fns';
import { AlertCircle, Check, ChevronsUpDown, Loader2, Skull } from 'lucide-react';
import * as React from 'react';
import { type DateRange } from 'react-day-picker';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from '@/components/ui/pagination';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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
  return <div className="space-y-2 rounded-lg border p-3" role="status" aria-label="Loading matching orders" aria-live="polite">
    <div className="grid grid-cols-4 gap-3 border-b pb-3 sm:grid-cols-8">{Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-4 w-full" />)}</div>
    {Array.from({ length: 6 }).map((_, row) => <div key={row} className="grid grid-cols-4 gap-3 border-b py-3 last:border-0 sm:grid-cols-8">{Array.from({ length: 8 }).map((__, column) => <Skeleton key={column} className="h-4 w-full" />)}</div>)}
  </div>;
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
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );
  };

  const handlePreview = () => {
    if (!dateRange?.from || !dateRange?.to) {
      toast.error('Choose both a start date and an end date to preview orders.');
      return;
    }

    router.get('/orders/bulk-expire', {
      from_date: dateRange.from.toISOString(),
      to_date: dateRange.to.toISOString(),
      merchant: selectedMerchant || '',
      statuses: selectedStatuses.length > 0 ? selectedStatuses : null,
    }, {
      preserveState: true,
      replace: true,
      onError: (responseErrors) => {
        const firstError = Object.values(responseErrors).find((message) => typeof message === 'string');
        toast.error(firstError ?? 'Could not preview orders. Check the filters and try again.');
      },
    });
  };

  const handleExpire = () => {
    if (!dateRange?.from || !dateRange?.to) {
      toast.error('Choose both a start date and an end date before expiring orders.');
      return;
    }

    setProcessing(true);
    router.post('/orders/bulk-expire', {
      from_date: dateRange.from.toISOString(),
      to_date: dateRange.to.toISOString(),
      merchant: selectedMerchant || '',
      statuses: selectedStatuses.length > 0 ? selectedStatuses : null,
    }, {
      preserveScroll: true,
      onSuccess: () => toast.success('Matching orders were marked as expired.'),
      onError: (responseErrors) => {
        const firstError = Object.values(responseErrors).find((message) => typeof message === 'string');
        toast.error(firstError ?? 'Could not expire orders. Check the filters and try again.');
      },
      onFinish: () => setProcessing(false),
    });
  };

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Bulk Expire Orders" />

      <div className="space-y-3 p-3 sm:p-4">
        <Card className="border-border/60 bg-gradient-to-r from-background to-muted/25">
          <CardHeader className="flex flex-col items-start gap-1 p-4 sm:flex-row sm:items-center sm:gap-3 sm:p-5">
            <div className="flex items-center gap-2">
              <Skull className="size-5 text-destructive" />
              <CardTitle className="text-xl">Bulk Expire Orders</CardTitle>
            </div>
            <CardDescription className="text-xs sm:text-sm">
              Choose a date range and filters, preview matching orders, then confirm expiration.
            </CardDescription>
          </CardHeader>
        </Card>

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

        <Card>
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-base">1. Filter orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-4 pb-4 pt-0">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Date Range</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-9 w-full justify-start text-left font-normal"
                    >
                      {dateRange?.from ? (
                        dateRange.to ? (
                          <>{dateRange.from.toLocaleDateString()} &ndash; {dateRange.to.toLocaleDateString()}</>
                        ) : (
                          dateRange.from.toLocaleDateString()
                        )
                      ) : (
                        <span className="text-muted-foreground">Pick a date range</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2" align="start">
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
                    <Button variant="outline" role="combobox" className="h-9 w-full justify-between">
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
                <label className="text-sm font-medium">Statuses</label>
                <Popover open={statusOpen} onOpenChange={setStatusOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="h-9 w-full justify-between">
                      {selectedStatuses.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {selectedStatuses.map((s) => (
                            <Badge key={s} variant="secondary" className="text-xs">
                              {s}
                            </Badge>
                          ))}
                        </div>
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
                            <CommandItem
                              key={status}
                              value={status}
                              onSelect={() => toggleStatus(status)}
                            >
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

            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <Button onClick={handlePreview} className="h-9 gap-2">
                <ChevronsUpDown className="size-4" />
                Preview Orders
              </Button>

              <Button
                variant="outline"
                className="h-9"
                onClick={() => {
                  setDateRange({ from: new Date(), to: addDays(new Date(), 30) });
                  setSelectedMerchant('');
                  setSelectedStatuses([]);
                }}
              >
                Reset Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {hasPreviewed && (
          <Deferred data="orders" fallback={<BulkExpireTableSkeleton />}>
          {() => orders && <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 px-4 py-3">
              <div>
                <CardTitle className="text-base">2. Review matches</CardTitle>
                <CardDescription>
                  {orders.total > 0
                    ? `${orders.total} order(s) match the filters above.`
                    : 'No orders match these filters. Adjust the dates, merchant, or statuses and preview again.'}
                </CardDescription>
              </div>
              <Button
                onClick={handleExpire}
                disabled={processing || orders.total === 0}
                variant="destructive"
                className="gap-2"
              >
                {processing ? <Loader2 className="size-4 animate-spin" /> : <Skull className="size-4" />}
                {processing ? 'Expiring...' : `Expire All ${orders.total}`}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 p-3 pt-0">
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order No</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Merchant</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Delivery Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.data.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                          No matching orders found for this filter selection.
                        </TableCell>
                      </TableRow>
                    ) : orders.data.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.order_no}</TableCell>
                        <TableCell>{order.client_name || '-'}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{order.product_name || '-'}</TableCell>
                        <TableCell>{order.merchant || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{order.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {order.delivery_date ? new Date(order.delivery_date).toLocaleDateString() : '-'}
                        </TableCell>
                        <TableCell className="text-right">{order.amount ?? '-'}</TableCell>
                        <TableCell className="text-right">{order.quantity ?? '-'}</TableCell>
                      </TableRow>
                    ))}
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
                              router.get('/orders/bulk-expire', {
                                from_date: filters.from_date,
                                to_date: filters.to_date,
                                merchant: filters.merchant || '',
                                statuses: filters.statuses && filters.statuses.length > 0 ? filters.statuses : null,
                                page: Number(page),
                              }, { preserveState: true, replace: true });
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
          </Card>}
          </Deferred>
        )}
      </div>
    </AppLayout>
  );
}
