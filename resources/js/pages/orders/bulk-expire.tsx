import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
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
}

export default function BulkExpirePage() {
  const { merchants, orders, filters, flash, errors } = usePage<BulkExpirePageProps>().props;

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
  const [hasPreviewed, setHasPreviewed] = React.useState(!!orders);

  const toggleStatus = (status: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );
  };

  const handlePreview = () => {
    if (!dateRange?.from || !dateRange?.to) return;

    router.get('/orders/bulk-expire', {
      from_date: dateRange.from.toISOString(),
      to_date: dateRange.to.toISOString(),
      merchant: selectedMerchant || '',
      statuses: selectedStatuses.length > 0 ? selectedStatuses : null,
    }, { preserveState: true, replace: true });
  };

  const handleExpire = () => {
    if (!dateRange?.from || !dateRange?.to) return;

    setProcessing(true);
    router.post('/orders/bulk-expire', {
      from_date: dateRange.from.toISOString(),
      to_date: dateRange.to.toISOString(),
      merchant: selectedMerchant || '',
      statuses: selectedStatuses.length > 0 ? selectedStatuses : null,
    }, {
      preserveScroll: true,
      onFinish: () => setProcessing(false),
    });
  };

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Bulk Expire Orders" />

      <div className="space-y-5 p-4">
        <Card className="border-border/60 bg-gradient-to-br from-background via-background to-muted/25">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Skull className="size-5 text-destructive" />
              <CardTitle className="text-2xl">Bulk Expire Orders</CardTitle>
            </div>
            <CardDescription>
              Step 1: Set filters and preview matching orders. Step 2: Confirm to mark them as Expired.
            </CardDescription>
          </CardHeader>
        </Card>

        {flash?.success && (
          <Card className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
            <CardContent className="flex items-center gap-2 p-4 text-sm text-green-700 dark:text-green-400">
              <AlertCircle className="size-4 shrink-0" />
              {flash.success}
            </CardContent>
          </Card>
        )}

        {errors?.no_results && (
          <Card className="border-red-500/50 bg-red-50 dark:bg-red-950/20">
            <CardContent className="flex items-center gap-2 p-4 text-sm text-red-700 dark:text-red-400">
              <AlertCircle className="size-4 shrink-0" />
              {errors.no_results}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Step 1: Set Filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Date Range</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
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

              <div className="space-y-2">
                <label className="text-sm font-medium">Merchant</label>
                <Popover open={merchantOpen} onOpenChange={setMerchantOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between">
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

              <div className="space-y-2">
                <label className="text-sm font-medium">Statuses</label>
                <Popover open={statusOpen} onOpenChange={setStatusOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between">
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

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={handlePreview} className="gap-2">
                <ChevronsUpDown className="size-4" />
                Preview Orders
              </Button>

              <Button
                variant="outline"
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

        {orders && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Step 2: Review & Confirm</CardTitle>
                <CardDescription>
                  {orders.total} order(s) match the filters above.
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
            <CardContent className="space-y-4">
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
                    {orders.data.map((order) => (
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
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
