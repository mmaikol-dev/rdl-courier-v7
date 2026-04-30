"use client";

import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, LoaderCircle, PackageSearch, Warehouse } from 'lucide-react';
import { toast } from 'sonner';
import * as React from 'react';

const breadcrumbs: BreadcrumbItem[] = [
  { title: 'Dashboard', href: '/dashboard' },
  { title: 'Inventory Deductions', href: '/inventory-deductions' },
];

interface MerchantProduct {
  id: number;
  name: string;
  code: string;
  quantity: number;
  merchant: string | null;
  country: string | null;
}

interface DeliveredOrder {
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
  inventory_product_id: number | null;
}

interface PageProps {
  merchantOptions: string[];
  selectedMerchant: string | null;
  orders: DeliveredOrder[];
  products: MerchantProduct[];
  errors?: Record<string, string>;
}

function SearchableSelect({
  value,
  placeholder,
  emptyMessage,
  options,
  onChange,
  allowClear = false,
  clearLabel = 'Clear selection',
}: {
  value: string;
  placeholder: string;
  emptyMessage: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  allowClear?: boolean;
  clearLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selectedLabel = options.find((option) => option.value === value)?.label ?? '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn('h-11 w-full justify-between', !selectedLabel && 'text-muted-foreground')}
        >
          <span className="truncate">{selectedLabel || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandList className="max-h-64">
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {allowClear ? (
                <CommandItem
                  value={clearLabel}
                  onSelect={() => {
                    onChange('');
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === '' ? 'opacity-100' : 'opacity-0')} />
                  {clearLabel}
                </CommandItem>
              ) : null}
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

export default function InventoryDeductionsPage() {
  const { merchantOptions, selectedMerchant, orders, products, errors } = usePage<PageProps>().props;
  const [merchant, setMerchant] = React.useState(selectedMerchant ?? '');
  const [selectedOrderIds, setSelectedOrderIds] = React.useState<number[]>([]);
  const [productSelections, setProductSelections] = React.useState<Record<number, string>>({});
  const [dismissedOrderIds, setDismissedOrderIds] = React.useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isMerchantLoading, setIsMerchantLoading] = React.useState(false);
  const [orderFilter, setOrderFilter] = React.useState('');

  React.useEffect(() => {
    const nextSelections: Record<number, string> = {};

    orders.forEach((order) => {
      const matched = products.find((product) => (
        order.inventory_product_id === product.id
        || product.code.trim().toLowerCase() === (order.code ?? '').trim().toLowerCase()
        || product.name.trim().toLowerCase() === (order.product_name ?? '').trim().toLowerCase()
      ));

      nextSelections[order.id] = matched ? String(matched.id) : '';
    });

    setProductSelections(nextSelections);
    setSelectedOrderIds([]);
    setDismissedOrderIds([]);
  }, [orders, products]);

  React.useEffect(() => {
    if (errors?.deductions) {
      toast.error(errors.deductions);
    }
  }, [errors]);

  const merchantSelectOptions = React.useMemo(
    () => merchantOptions.map((item) => ({ value: item, label: item })),
    [merchantOptions],
  );

  const productOptions = React.useMemo(
    () => products.map((product) => ({
      value: String(product.id),
      label: `${product.name} (${product.code}) • Stock ${product.quantity}`,
    })),
    [products],
  );

  const filteredOrders = React.useMemo(() => {
    const keyword = orderFilter.trim().toLowerCase();

    const visibleOrders = orders.filter((order) => !dismissedOrderIds.includes(order.id));

    if (keyword === '') return visibleOrders;

    return visibleOrders.filter((order) =>
      [order.order_no, order.client_name, order.product_name, order.code, order.status]
        .some((value) => (value ?? '').toLowerCase().includes(keyword)),
    );
  }, [dismissedOrderIds, orderFilter, orders]);

  const productById = React.useMemo(
    () => Object.fromEntries(products.map((product) => [String(product.id), product])),
    [products],
  );

  const allVisibleSelected = filteredOrders.length > 0 && filteredOrders.every((order) => selectedOrderIds.includes(order.id));

  const reloadMerchant = React.useCallback((nextMerchant: string) => {
    setMerchant(nextMerchant);
    setSelectedOrderIds([]);
    setIsMerchantLoading(true);

    router.get('/inventory-deductions', nextMerchant ? { merchant: nextMerchant } : {}, {
      preserveState: true,
      preserveScroll: true,
      replace: true,
      onFinish: () => setIsMerchantLoading(false),
    });
  }, []);

  const toggleOrder = React.useCallback((orderId: number, checked: boolean) => {
    setSelectedOrderIds((current) => (
      checked ? [...current, orderId] : current.filter((id) => id !== orderId)
    ));
  }, []);

  const toggleAllVisible = React.useCallback((checked: boolean) => {
    setSelectedOrderIds(checked ? filteredOrders.map((order) => order.id) : []);
  }, [filteredOrders]);

  const assignProductToOrder = React.useCallback((orderId: number, productId: string) => {
    setProductSelections((current) => ({ ...current, [orderId]: productId }));

    setSelectedOrderIds((current) => {
      if (!productId) {
        return current.filter((id) => id !== orderId);
      }

      return current.includes(orderId) ? current : [...current, orderId];
    });
  }, []);

  const submitDeductions = React.useCallback(() => {
    if (!merchant) {
      toast.error('Select a merchant first.');
      return;
    }

    if (selectedOrderIds.length === 0) {
      toast.error('Select at least one delivered order.');
      return;
    }

    const deductions = selectedOrderIds.map((orderId) => ({
      order_id: orderId,
      product_id: Number(productSelections[orderId] || 0),
    }));

    const missingProduct = deductions.find((item) => !item.product_id);

    if (missingProduct) {
      toast.error('Choose a product for every selected order.');
      return;
    }

    setIsSubmitting(true);

    router.post('/inventory-deductions', {
      merchant,
      deductions,
    }, {
      preserveScroll: true,
      onSuccess: () => {
        setDismissedOrderIds((current) => [...new Set([...current, ...selectedOrderIds])]);
        toast.success(`${deductions.length} order(s) deducted successfully.`);
        setSelectedOrderIds([]);
        router.reload({ only: ['orders', 'products'] });
      },
      onError: (formErrors) => {
        const firstError = Object.values(formErrors)[0];
        toast.error(typeof firstError === 'string' ? firstError : 'Failed to deduct inventory.');
      },
      onFinish: () => setIsSubmitting(false),
    });
  }, [merchant, productSelections, selectedOrderIds]);

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Inventory Deductions" />

      <div className="space-y-6 p-4">
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Warehouse className="size-5" />
              Manual Inventory Deduction Queue
            </CardTitle>
            <CardDescription>
              Pick a merchant, review delivered orders that have not been deducted yet, match each order to a product, and deduct stock manually.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
            <div className="space-y-2">
              <div className="text-sm font-medium">Merchant</div>
              <SearchableSelect
                value={merchant}
                placeholder="Select merchant"
                emptyMessage="No merchant found."
                options={merchantSelectOptions}
                onChange={reloadMerchant}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Delivered Orders</div>
                <div className="mt-2 text-2xl font-semibold">{orders.length}</div>
              </div>
              <div className="rounded-xl border p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Merchant Products</div>
                <div className="mt-2 text-2xl font-semibold">{products.length}</div>
              </div>
              <div className="rounded-xl border p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Selected</div>
                <div className="mt-2 text-2xl font-semibold">{selectedOrderIds.length}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {merchant ? (
          isMerchantLoading ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,0.9fr)]">
              <Card className="border-border/60 shadow-sm">
                <CardHeader>
                  <Skeleton className="h-6 w-72" />
                  <Skeleton className="h-4 w-full max-w-xl" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Skeleton className="h-10 w-full sm:max-w-sm" />
                    <Skeleton className="h-10 w-36" />
                  </div>

                  <div className="rounded-xl border p-4">
                    <div className="space-y-4">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <div key={index} className="grid gap-3 border-b pb-4 last:border-b-0 last:pb-0 md:grid-cols-[40px_1fr_1fr_1.2fr_120px_80px_100px_280px]">
                          <Skeleton className="h-5 w-5" />
                          <Skeleton className="h-10 w-full" />
                          <Skeleton className="h-10 w-full" />
                          <Skeleton className="h-10 w-full" />
                          <Skeleton className="h-10 w-full" />
                          <Skeleton className="h-10 w-full" />
                          <Skeleton className="h-10 w-full" />
                          <Skeleton className="h-10 w-full" />
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60 shadow-sm">
                <CardHeader>
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-full max-w-sm" />
                </CardHeader>
                <CardContent className="space-y-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="rounded-xl border p-4">
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="mt-2 h-4 w-28" />
                      <div className="mt-4 flex items-center justify-between">
                        <Skeleton className="h-4 w-12" />
                        <Skeleton className="h-6 w-16 rounded-full" />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,0.9fr)]">
            <Card className="border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle>Delivered Orders Waiting for Deduction</CardTitle>
                <CardDescription>
                  Only delivered orders for {merchant} that have not yet been deducted appear here.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Input
                    value={orderFilter}
                    onChange={(event) => setOrderFilter(event.target.value)}
                    placeholder="Filter by order no, client, product, code, or status"
                    className="sm:max-w-sm"
                  />
                  <Button onClick={submitDeductions} disabled={isSubmitting || selectedOrderIds.length === 0} className="gap-2">
                    {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
                    Deduct Selected
                  </Button>
                </div>

                {filteredOrders.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    No delivered undeducted orders found for this merchant.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border">
                    <Table className="table-fixed">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">
                            <Checkbox
                              checked={allVisibleSelected}
                              onCheckedChange={(checked) => toggleAllVisible(Boolean(checked))}
                            />
                          </TableHead>
                          <TableHead className="w-[150px]">Order</TableHead>
                          <TableHead className="w-[160px]">Client</TableHead>
                          <TableHead className="w-[180px]">Order Product</TableHead>
                          <TableHead className="w-[140px]">Code</TableHead>
                          <TableHead className="w-[70px]">Qty</TableHead>
                          <TableHead className="w-[110px]">Amount</TableHead>
                          <TableHead className="w-[300px]">Match Product</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredOrders.map((order) => {
                          const selectedProduct = productById[productSelections[order.id] || ''];

                          return (
                            <TableRow key={order.id}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedOrderIds.includes(order.id)}
                                  onCheckedChange={(checked) => toggleOrder(order.id, Boolean(checked))}
                                />
                              </TableCell>
                              <TableCell className="align-top">
                                <div className="truncate font-medium" title={order.order_no}>
                                  {order.order_no}
                                </div>
                                <div className="truncate text-xs text-muted-foreground" title={order.delivery_date ?? '-'}>
                                  {order.delivery_date ?? '-'}
                                </div>
                              </TableCell>
                              <TableCell className="align-top">
                                <div className="truncate" title={order.client_name ?? '-'}>
                                  {order.client_name ?? '-'}
                                </div>
                              </TableCell>
                              <TableCell className="align-top">
                                <div className="truncate" title={order.product_name ?? '-'}>
                                  {order.product_name ?? '-'}
                                </div>
                                <Badge variant="outline" className="mt-1">{order.status ?? '-'}</Badge>
                              </TableCell>
                              <TableCell className="align-top">
                                <Badge variant={order.code ? 'secondary' : 'outline'} className="max-w-full truncate" title={order.code ?? '-'}>
                                  {order.code ?? '-'}
                                </Badge>
                              </TableCell>
                              <TableCell className="align-top">{order.quantity}</TableCell>
                              <TableCell className="align-top">{order.amount.toLocaleString()}</TableCell>
                              <TableCell className="align-top">
                                <SearchableSelect
                                  value={productSelections[order.id] || ''}
                                  placeholder="Choose product"
                                  emptyMessage="No product found."
                                  options={productOptions}
                                  allowClear
                                  clearLabel="Clear product"
                                  onChange={(value) => assignProductToOrder(order.id, value)}
                                />
                                {selectedProduct ? (
                                  <div className="mt-2 text-xs text-muted-foreground">
                                    Stock after deduction: {selectedProduct.quantity - order.quantity}
                                  </div>
                                ) : null}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PackageSearch className="size-5" />
                  Merchant Products
                </CardTitle>
                <CardDescription>
                  Current stock for products linked to {merchant}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {products.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    No products linked to this merchant yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {products.map((product) => (
                      <div key={product.id} className="rounded-xl border p-4">
                        <div className="font-medium">{product.name}</div>
                        <div className="mt-1 text-sm text-muted-foreground">Code: {product.code}</div>
                        <div className="mt-2 flex items-center justify-between text-sm">
                          <span>Stock</span>
                          <Badge variant={product.quantity > 0 ? 'secondary' : 'destructive'}>
                            {product.quantity}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          )
        ) : (
          <Card className="border-border/60 shadow-sm">
            <CardContent className="py-14 text-center text-muted-foreground">
              Select a merchant to load products and delivered orders for manual deduction.
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
