"use client";

import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, LinkIcon, Package, Search, Truck } from 'lucide-react';
import * as React from 'react';

const breadcrumbs: BreadcrumbItem[] = [
  { title: 'Dashboard', href: '/dashboard' },
  { title: 'Deducted Orders', href: '/deducted-orders' },
];

interface LinkedProduct {
  id: number;
  name: string;
  code: string;
  quantity: number;
  merchant: string | null;
  category: string | null;
}

interface DeductedOrder {
  id: number;
  order_no: string;
  client_name: string | null;
  product_name: string | null;
  code: string | null;
  quantity: number;
  amount: number;
  status: string | null;
  merchant: string;
  delivery_date: string | null;
  inventory_deducted_at: string | null;
  inventory_deducted_by: number | null;
  inventory_product_id: number | null;
  linked_product: LinkedProduct | null;
}

interface PaginationLink {
  url: string | null;
  label: string;
  active: boolean;
}

interface PaginatedOrders {
  data: DeductedOrder[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  links: PaginationLink[];
}

interface PageProps {
  merchantOptions: string[];
  selectedMerchant: string | null;
  search: string | null;
  summary: {
    totalOrders: number;
    totalQuantity: number;
    productsAffected: number;
    totalRevenue: number;
  };
  orders: PaginatedOrders;
}

function MerchantSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const selectedLabel = options.find((o) => o.value === value)?.label ?? '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn('h-10 w-full justify-between sm:w-[260px]', !selectedLabel && 'text-muted-foreground')}
        >
          <span className="truncate">{selectedLabel || 'All Merchants'}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search merchant..." />
          <CommandList className="max-h-64">
            <CommandEmpty>No merchant found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__all__"
                onSelect={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                <Check className={cn('mr-2 h-4 w-4', value === '' ? 'opacity-100' : 'opacity-0')} />
                All Merchants
              </CommandItem>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === option.value ? 'opacity-100' : 'opacity-0')} />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function DeductedOrdersPage() {
  const { merchantOptions, selectedMerchant, search: initialSearch, summary, orders } = usePage<PageProps>().props;
  const [merchant, setMerchant] = React.useState(selectedMerchant ?? '');
  const [search, setSearch] = React.useState(initialSearch ?? '');

  const merchantSelectOptions = React.useMemo(
    () => merchantOptions.map((m) => ({ value: m, label: m })),
    [merchantOptions],
  );

  const reload = React.useCallback(
    (opts: { merchant?: string; search?: string; page?: number } = {}) => {
      const params: Record<string, string> = {};
      const m = opts.merchant !== undefined ? opts.merchant : merchant;
      const s = opts.search !== undefined ? opts.search : search;
      const p = opts.page;

      if (m) params.merchant = m;
      if (s) params.search = s;
      if (p && p > 1) params.page = String(p);

      router.get('/deducted-orders', params, {
        preserveState: true,
        preserveScroll: true,
        replace: true,
      });
    },
    [merchant, search],
  );

  const handleMerchantChange = React.useCallback(
    (value: string) => {
      setMerchant(value);
      reload({ merchant: value, search: '' });
      setSearch('');
    },
    [reload],
  );

  const handleSearch = React.useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      reload({ search, page: 1 });
    },
    [search, reload],
  );

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Deducted Orders" />

      <div className="space-y-6 p-4">
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="size-5" />
              Deducted Orders &amp; Linked Products
            </CardTitle>
            <CardDescription>
              Orders that have been deducted from inventory, showing which product each order was linked to.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl border p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Total Deducted</div>
                <div className="mt-2 text-2xl font-semibold">{summary.totalOrders.toLocaleString()}</div>
              </div>
              <div className="rounded-xl border p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Total Quantity</div>
                <div className="mt-2 text-2xl font-semibold">{summary.totalQuantity.toLocaleString()}</div>
              </div>
              <div className="rounded-xl border p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Products Affected</div>
                <div className="mt-2 text-2xl font-semibold">{summary.productsAffected}</div>
              </div>
              <div className="rounded-xl border p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Total Revenue</div>
                <div className="mt-2 text-2xl font-semibold">{summary.totalRevenue.toLocaleString()}</div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <MerchantSelect
                value={merchant}
                options={merchantSelectOptions}
                onChange={handleMerchantChange}
              />
              <form onSubmit={handleSearch} className="flex gap-2 sm:max-w-sm">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search order no, client, product..."
                />
                <Button type="submit" variant="secondary" size="icon">
                  <Search className="size-4" />
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-0">
            {orders.data.length === 0 ? (
              <div className="py-14 text-center text-sm text-muted-foreground">
                No deducted orders found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order No</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Order Product</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Delivery Date</TableHead>
                      <TableHead>Deducted At</TableHead>
                      <TableHead>
                        <span className="flex items-center gap-1">
                          <LinkIcon className="size-3" />
                          Linked Product
                        </span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.data.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.order_no}</TableCell>
                        <TableCell className="max-w-[150px] truncate">{order.client_name ?? '-'}</TableCell>
                        <TableCell className="max-w-[150px] truncate">{order.product_name ?? '-'}</TableCell>
                        <TableCell className="text-center">{order.quantity}</TableCell>
                        <TableCell className="text-right">{order.amount.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{order.status ?? '-'}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {order.delivery_date ?? '-'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {order.inventory_deducted_at ?? '-'}
                        </TableCell>
                        <TableCell>
                          {order.linked_product ? (
                            <div className="space-y-0.5">
                              <div className="font-medium">{order.linked_product.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {order.linked_product.code} &middot; Stock: {order.linked_product.quantity}
                              </div>
                              {order.linked_product.category && (
                                <Badge variant="secondary" className="text-xs">
                                  {order.linked_product.category}
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <Badge variant="destructive" className="text-xs">No product linked</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {orders.last_page > 1 && (
              <div className="border-t px-4 py-3">
                <Pagination>
                  <PaginationContent>
                    {orders.links.map((link, i) => {
                      if (link.url === null) return null;
                      const page = new URL(link.url).searchParams.get('page');
                      return (
                        <PaginationItem key={i}>
                          <PaginationLink
                            href={link.url}
                            isActive={link.active}
                            onClick={(e) => {
                              e.preventDefault();
                              reload({ page: Number(page) });
                            }}
                          >
                            {link.label}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    })}
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
