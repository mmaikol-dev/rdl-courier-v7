"use client";

import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Deferred, Head, router, usePage } from '@inertiajs/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ArrowRight, CalendarIcon, Check, CheckCircle2, ChevronsUpDown, Download, Eye, LoaderCircle, ReceiptText, WalletCards } from 'lucide-react';
import * as React from 'react';
import { type DateRange } from 'react-day-picker';

const breadcrumbs: BreadcrumbItem[] = [
  { title: 'Dashboard', href: '/dashboard' },
  { title: 'Finance Workflow', href: '/finance-workflow' },
];

interface MerchantWorkflowRow {
  merchant: string;
  orders_count: number;
  total_amount: number;
  earliest_delivery?: string | null;
  latest_delivery?: string | null;
  report_generated_at?: string | null;
  merchant_confirmed_at?: string | null;
  remitted_at?: string | null;
}

interface FinanceWorkflowReport {
  readyForDelivery: MerchantWorkflowRow[];
  awaitingConfirmation: MerchantWorkflowRow[];
  readyToRemit: MerchantWorkflowRow[];
  remittedHistory: MerchantWorkflowRow[];
  summary: {
    readyForDelivery: number;
    awaitingConfirmation: number;
    readyToRemit: number;
    remitted: number;
  };
}

interface FinanceWorkflowPageProps {
  workflowReport?: FinanceWorkflowReport;
  statusOptions: string[];
}

const EMPTY_WORKFLOW_REPORT: FinanceWorkflowReport = {
  readyForDelivery: [],
  awaitingConfirmation: [],
  readyToRemit: [],
  remittedHistory: [],
  summary: { readyForDelivery: 0, awaitingConfirmation: 0, readyToRemit: 0, remitted: 0 },
};

interface WorkflowOrder {
  id: number;
  order_no: string;
  client_name: string;
  product_name: string;
  amount: number | string | null;
  quantity: number | null;
  status: string | null;
  agent: string | null;
  code: string | null;
  delivery_date: string | null;
  phone: string | null;
  address: string | null;
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(amount);
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';

  return new Date(value).toLocaleString();
}

/**
 * Safely extracts the date-only part from a delivery date string.
 * This avoids timezone shifts that can cause off-by-one errors.
 * Expects inputs like "2025-10-17T..." or "2025-10-17 00:00:00".
 * Returns the raw "YYYY-MM-DD" part or "-" if the value is absent.
 */
function formatDateOnly(value?: string | null): string {
  if (!value) return '-';
  // Split on either 'T' (ISO) or a space (common database format)
  const datePart = value.split(/[T\s]/)[0];
  return datePart;
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex min-h-32 items-center justify-center text-muted-foreground">
        {message}
      </CardContent>
    </Card>
  );
}

function FinanceWorkflowSkeleton() {
  return (
    <div className="space-y-4 p-3 sm:p-4" role="status" aria-label="Loading finance workflow" aria-live="polite">
      <section className="space-y-4 rounded-2xl border bg-card p-4">
        <div className="space-y-3"><Skeleton className="h-4 w-36" /><Skeleton className="h-8 w-2/3" /><Skeleton className="h-4 w-full max-w-2xl" /></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-2xl" />)}</div>
      </section>
      <div className="flex gap-2">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-9 w-28" />)}</div>
      <div className="space-y-3 rounded-2xl border bg-card p-3 sm:p-4">
        <Skeleton className="h-5 w-48" />
        <div className="grid grid-cols-4 gap-3 border-b pb-3">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-4 w-full" />)}</div>
        {Array.from({ length: 6 }).map((_, row) => <div key={row} className="grid grid-cols-4 gap-3 border-b py-3 last:border-0">{Array.from({ length: 4 }).map((__, column) => <Skeleton key={column} className="h-5 w-full" />)}</div>)}
      </div>
    </div>
  );
}

function TruncatedCell({
  value,
  className = '',
}: {
  value: string | number | null | undefined;
  className?: string;
}) {
  const displayValue = value === null || value === undefined || value === '' ? '-' : String(value);

  return (
    <div className={`truncate whitespace-nowrap ${className}`} title={displayValue}>
      {displayValue}
    </div>
  );
}

export default function FinanceWorkflowPage() {
  const { workflowReport, statusOptions } = usePage<FinanceWorkflowPageProps>().props;
  const { readyForDelivery, awaitingConfirmation, readyToRemit, remittedHistory, summary } =
    workflowReport ?? EMPTY_WORKFLOW_REPORT;
  const [pendingKey, setPendingKey] = React.useState<string | null>(null);
  const [drawerMerchant, setDrawerMerchant] = React.useState<string | null>(null);
  const [drawerStage, setDrawerStage] = React.useState<'delivery' | 'confirmation' | 'remit' | 'history' | null>(null);
  const [drawerOrders, setDrawerOrders] = React.useState<WorkflowOrder[]>([]);
  const [drawerLoading, setDrawerLoading] = React.useState(false);
  const [selectedDeliveryOrderIds, setSelectedDeliveryOrderIds] = React.useState<number[]>([]);
  const [selectedConfirmationOrderIds, setSelectedConfirmationOrderIds] = React.useState<number[]>([]);
  const [reportMerchant, setReportMerchant] = React.useState<string | null>(null);
  const [reportOrderIds, setReportOrderIds] = React.useState<number[]>([]);
  const [selectedStatuses, setSelectedStatuses] = React.useState<string[]>([]);
  const [reportDateRange, setReportDateRange] = React.useState<DateRange | undefined>();
  const [reportDatePickerOpen, setReportDatePickerOpen] = React.useState(false);
  const [merchantSearch, setMerchantSearch] = React.useState('');
  const [merchantPickerOpen, setMerchantPickerOpen] = React.useState(false);
  const isDeliveryDrawer = drawerStage === 'delivery';
  const isConfirmationDrawer = drawerStage === 'confirmation';
  const allDeliverySelected = isDeliveryDrawer
    && drawerOrders.length > 0
    && selectedDeliveryOrderIds.length === drawerOrders.length;
  const allConfirmationSelected = isConfirmationDrawer
    && drawerOrders.length > 0
    && selectedConfirmationOrderIds.length === drawerOrders.length;
  const normalizedMerchantSearch = merchantSearch.trim().toLowerCase();
  const filterMerchants = React.useCallback(
    (rows: MerchantWorkflowRow[]) =>
      normalizedMerchantSearch === ''
        ? rows
        : rows.filter((row) => row.merchant.toLowerCase().includes(normalizedMerchantSearch)),
    [normalizedMerchantSearch],
  );
  const filteredReadyForDelivery = filterMerchants(readyForDelivery);
  const filteredAwaitingConfirmation = filterMerchants(awaitingConfirmation);
  const filteredReadyToRemit = filterMerchants(readyToRemit);
  const filteredRemittedHistory = filterMerchants(remittedHistory);
  const merchantOptions = React.useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...readyForDelivery,
            ...awaitingConfirmation,
            ...readyToRemit,
            ...remittedHistory,
          ].map((row) => row.merchant),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [awaitingConfirmation, readyForDelivery, readyToRemit, remittedHistory],
  );
  const extraStatusOptions = React.useMemo(
    () => statusOptions.filter((status) => status.trim().toLowerCase() !== 'delivered'),
    [statusOptions],
  );

  const visitWorkflow = React.useCallback(() => {
    router.reload({ only: ['workflowReport'] });
  }, []);

  const postAction = React.useCallback(
    (
      url: string,
      merchant: string,
      successMessage: string,
      orderIds?: number[],
      onSuccessCallback?: () => void,
    ) => {
      const actionKey = `${url}:${merchant}`;
      setPendingKey(actionKey);

      router.post(
        url,
        {
          merchant,
          ...(orderIds && orderIds.length > 0 ? { order_ids: orderIds } : {}),
        },
        {
          preserveScroll: true,
          onSuccess: () => {
            toast.success(successMessage);
            onSuccessCallback?.();
            visitWorkflow();
          },
          onError: (errors) => {
            const firstError = Object.values(errors)[0];
            toast.error(typeof firstError === 'string' ? firstError : 'Action failed');
          },
          onFinish: () => setPendingKey(null),
        },
      );
    },
    [visitWorkflow],
  );

  const openReportDialog = React.useCallback((merchant: string, orderIds: number[]) => {
    setReportMerchant(merchant);
    setReportOrderIds(orderIds);
    setSelectedStatuses([]);
    setReportDateRange(undefined);
    setReportDatePickerOpen(false);
  }, []);

  const downloadReport = React.useCallback(() => {
    if (!reportMerchant) return;
    if (reportOrderIds.length === 0) {
      toast.error('Select at least one delivered order to continue');
      return;
    }
    if (selectedStatuses.length > 0 && (!reportDateRange?.from || !reportDateRange?.to)) {
      toast.error('Select a date range for the additional statuses');
      return;
    }

    const actionKey = `download:${reportMerchant}`;
    setPendingKey(actionKey);

    const params = new URLSearchParams({ merchant: reportMerchant });
    reportOrderIds.forEach((orderId) => params.append('order_ids[]', String(orderId)));
    selectedStatuses.forEach((status) => params.append('extra_statuses[]', status));
    if (reportDateRange?.from) params.append('from', format(reportDateRange.from, 'yyyy-MM-dd'));
    if (reportDateRange?.to) params.append('to', format(reportDateRange.to, 'yyyy-MM-dd'));
    window.location.href = `/finance-workflow/download-report?${params.toString()}`;
    toast.success(
      selectedStatuses.length > 0
        ? 'Custom merchant report download started'
        : 'Delivered-only report download started',
    );

    window.setTimeout(() => {
      setPendingKey(null);
      setReportMerchant(null);
      setReportOrderIds([]);
      setSelectedStatuses([]);
      setReportDateRange(undefined);
      setReportDatePickerOpen(false);
      visitWorkflow();
    }, 900);
  }, [reportDateRange, reportMerchant, reportOrderIds, selectedStatuses, visitWorkflow]);

  const renderActionButton = (
    actionKey: string,
    label: string,
    onClick: () => void,
    icon?: React.ReactNode,
    variant: 'default' | 'outline' = 'default',
  ) => (
    <Button variant={variant} onClick={onClick} disabled={pendingKey === actionKey} className="gap-2">
      {pendingKey === actionKey ? <LoaderCircle className="size-4 animate-spin" /> : icon}
      {label}
    </Button>
  );

  const openOrdersDrawer = React.useCallback(async (
    merchant: string,
    stage: 'delivery' | 'confirmation' | 'remit' | 'history',
  ) => {
    setDrawerMerchant(merchant);
    setDrawerStage(stage);
    setDrawerOrders([]);
    setDrawerLoading(true);

    try {
      const params = new URLSearchParams({ merchant, stage });
      const response = await fetch(`/finance-workflow/orders?${params.toString()}`, {
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load orders');
      }

      const data = (await response.json()) as { orders: WorkflowOrder[] };
      setDrawerOrders(data.orders ?? []);
      setSelectedDeliveryOrderIds(stage === 'delivery' ? (data.orders ?? []).map((order) => order.id) : []);
      setSelectedConfirmationOrderIds(stage === 'confirmation' ? (data.orders ?? []).map((order) => order.id) : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load merchant orders');
    } finally {
      setDrawerLoading(false);
    }
  }, []);

  const toggleDeliveryOrder = React.useCallback((orderId: number, checked: boolean) => {
    setSelectedDeliveryOrderIds((current) =>
      checked ? [...current, orderId] : current.filter((id) => id !== orderId),
    );
  }, []);

  const toggleAllDeliveryOrders = React.useCallback((checked: boolean) => {
    setSelectedDeliveryOrderIds(checked ? drawerOrders.map((order) => order.id) : []);
  }, [drawerOrders]);

  const toggleConfirmationOrder = React.useCallback((orderId: number, checked: boolean) => {
    setSelectedConfirmationOrderIds((current) =>
      checked ? [...current, orderId] : current.filter((id) => id !== orderId),
    );
  }, []);

  const toggleAllConfirmationOrders = React.useCallback((checked: boolean) => {
    setSelectedConfirmationOrderIds(checked ? drawerOrders.map((order) => order.id) : []);
  }, [drawerOrders]);

  const closeDrawer = React.useCallback(() => {
    setDrawerMerchant(null);
    setDrawerStage(null);
    setDrawerOrders([]);
    setSelectedDeliveryOrderIds([]);
    setSelectedConfirmationOrderIds([]);
  }, []);

  const confirmSelectedDeliveryOrders = React.useCallback(() => {
    if (!drawerMerchant) return;
    if (selectedDeliveryOrderIds.length === 0) {
      toast.error('Select at least one order to confirm payment right now');
      return;
    }

    const actionKey = `/finance-workflow/mark-delivered:${drawerMerchant}:selected`;
    setPendingKey(actionKey);

    router.post(
      '/finance-workflow/mark-delivered',
      {
        merchant: drawerMerchant,
        order_ids: selectedDeliveryOrderIds,
      },
      {
        preserveScroll: true,
        onSuccess: () => {
          toast.success(`${selectedDeliveryOrderIds.length} order(s) moved to delivered`);
          closeDrawer();
          visitWorkflow();
        },
        onError: (errors) => {
          const firstError = Object.values(errors)[0];
          toast.error(typeof firstError === 'string' ? firstError : 'Action failed');
        },
        onFinish: () => setPendingKey(null),
      },
    );
  }, [closeDrawer, drawerMerchant, selectedDeliveryOrderIds, visitWorkflow]);

  const openConfirmationReportDialog = React.useCallback(() => {
    if (!drawerMerchant) return;
    if (selectedConfirmationOrderIds.length === 0) {
      toast.error('Select at least one delivered order to continue');
      return;
    }

    openReportDialog(drawerMerchant, selectedConfirmationOrderIds);
  }, [drawerMerchant, openReportDialog, selectedConfirmationOrderIds]);

  const confirmSelectedMerchantOrders = React.useCallback(() => {
    if (!drawerMerchant) return;
    if (selectedConfirmationOrderIds.length === 0) {
      toast.error('Select at least one delivered order to continue');
      return;
    }

    postAction(
      '/finance-workflow/mark-confirmed',
      drawerMerchant,
      `${selectedConfirmationOrderIds.length} order(s) confirmed`,
      selectedConfirmationOrderIds,
      closeDrawer,
    );
  }, [closeDrawer, drawerMerchant, postAction, selectedConfirmationOrderIds]);

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Finance Workflow" />

      <Deferred data="workflowReport" fallback={<FinanceWorkflowSkeleton />}>
      {() => <div className="space-y-4 p-3 sm:p-4">
        <Card className="gap-0 overflow-hidden border-border/60 bg-gradient-to-r from-primary via-primary to-success py-0 text-primary-foreground shadow-xl">
          <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-sm uppercase tracking-[0.25em] text-primary-foreground/75">Finance Operations</p>
              <h1 className="text-2xl font-semibold">Merchant payment to remittance workflow</h1>
              <p className="max-w-2xl text-sm text-primary-foreground/75">
                Move merchants through payment confirmation, report generation, confirmation, and final remittance without mixing up countries or teams.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-primary-foreground/10 bg-background/10 p-2.5 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.18em] text-primary-foreground/75">Ready</p>
                <p className="mt-1 text-xl font-semibold">{summary.readyForDelivery}</p>
              </div>
              <div className="rounded-xl border border-primary-foreground/10 bg-background/10 p-2.5 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.18em] text-primary-foreground/75">Awaiting</p>
                <p className="mt-1 text-xl font-semibold">{summary.awaitingConfirmation}</p>
              </div>
              <div className="rounded-xl border border-primary-foreground/10 bg-background/10 p-2.5 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.18em] text-primary-foreground/75">To Remit</p>
                <p className="mt-1 text-xl font-semibold">{summary.readyToRemit}</p>
              </div>
              <div className="rounded-xl border border-primary-foreground/10 bg-background/10 p-2.5 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.18em] text-primary-foreground/75">Remitted</p>
                <p className="mt-1 text-xl font-semibold">{summary.remitted}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="delivery" className="space-y-3">
          <Card className="gap-0 border-border/60 py-0 shadow-sm">
            <CardContent className="p-2">
              <div className="space-y-1.5">
                <div className="text-xs font-medium">Merchant</div>
                <Popover open={merchantPickerOpen} onOpenChange={setMerchantPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="h-auto min-h-9 w-full justify-between py-1.5"
                    >
                      <span className={cn("truncate", !merchantSearch && "text-muted-foreground")}>
                        {merchantSearch || "Search merchant in 1, 2, 3, and history"}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[min(28rem,calc(100vw-2rem))] p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search merchant..."
                        value={merchantSearch}
                        onValueChange={setMerchantSearch}
                      />
                      <CommandList>
                        <CommandEmpty>No merchant found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value=""
                            onSelect={() => {
                              setMerchantSearch('');
                              setMerchantPickerOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", merchantSearch === '' ? "opacity-100" : "opacity-0")} />
                            All merchants
                          </CommandItem>
                          {merchantOptions.map((merchant) => (
                            <CommandItem
                              key={merchant}
                              value={merchant}
                              onSelect={() => {
                                setMerchantSearch(merchant === merchantSearch ? '' : merchant);
                                setMerchantPickerOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", merchantSearch === merchant ? "opacity-100" : "opacity-0")} />
                              {merchant}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </CardContent>
          </Card>

          <TabsList className="h-auto flex-wrap gap-2 bg-transparent p-0">
            <TabsTrigger value="delivery">1. Confirm Payment</TabsTrigger>
            <TabsTrigger value="confirmation">2. Await Confirmation</TabsTrigger>
            <TabsTrigger value="remit">3. Remit</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="delivery" className="space-y-3">
            <Card className="gap-3 border-border/60 py-0 shadow-sm">
              <CardHeader className="px-4 pt-4 pb-0">
                <CardTitle className="flex items-center gap-2">
                  <ReceiptText className="size-5" />
                  Scheduled or dispatched orders with payment codes
                </CardTitle>
                <CardDescription>
                  These merchants have scheduled or dispatched orders with a populated code. Finance can confirm payment and move them to delivered.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {filteredReadyForDelivery.length === 0 ? (
                  <EmptyState message="No merchants are waiting for payment confirmation right now." />
                ) : (
                  <div className="overflow-x-auto">
                    <Table className="[&_th]:h-9 [&_td]:py-1.5">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Merchant</TableHead>
                          <TableHead>Orders</TableHead>
                          <TableHead>Total Amount</TableHead>
                          <TableHead>Date Window</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredReadyForDelivery.map((row) => (
                          <TableRow key={row.merchant}>
                            <TableCell className="font-medium">{row.merchant}</TableCell>
                            <TableCell>{row.orders_count}</TableCell>
                            <TableCell>{formatMoney(row.total_amount)}</TableCell>
                            <TableCell>
                              {row.earliest_delivery || '-'} <ArrowRight className="mx-1 inline size-3" /> {row.latest_delivery || '-'}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                {renderActionButton(
                                  `preview:delivery:${row.merchant}`,
                                  'View Orders',
                                  () => openOrdersDrawer(row.merchant, 'delivery'),
                                  <Eye className="size-4" />,
                                  'outline',
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="confirmation" className="space-y-3">
            <Card className="gap-3 border-border/60 py-0 shadow-sm">
              <CardHeader className="px-4 pt-4 pb-0">
                <CardTitle>Delivered and waiting for merchant confirmation</CardTitle>
                <CardDescription>
                  Open a merchant to choose the delivered orders you want to continue with, generate the report for those, then mark only those as confirmed.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {filteredAwaitingConfirmation.length === 0 ? (
                  <EmptyState message="No merchants are currently waiting for report confirmation." />
                ) : (
                  <div className="overflow-x-auto">
                    <Table className="[&_th]:h-9 [&_td]:py-1.5">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Merchant</TableHead>
                          <TableHead>Orders</TableHead>
                          <TableHead>Total Amount</TableHead>
                          <TableHead>Last Report</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAwaitingConfirmation.map((row) => (
                          <TableRow key={row.merchant}>
                            <TableCell className="font-medium">{row.merchant}</TableCell>
                            <TableCell>{row.orders_count}</TableCell>
                            <TableCell>{formatMoney(row.total_amount)}</TableCell>
                            <TableCell>{formatDateTime(row.report_generated_at)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                {renderActionButton(
                                  `preview:confirmation:${row.merchant}`,
                                  'View Orders',
                                  () => openOrdersDrawer(row.merchant, 'confirmation'),
                                  <Eye className="size-4" />,
                                  'outline',
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="remit" className="space-y-3">
            <Card className="gap-3 border-border/60 py-0 shadow-sm">
              <CardHeader className="px-4 pt-4 pb-0">
                <CardTitle className="flex items-center gap-2">
                  <WalletCards className="size-5" />
                  Merchant confirmed and ready to remit
                </CardTitle>
                <CardDescription>
                  These orders are delivered, merchant-confirmed, and ready to be marked as remitted. This action keeps using the `agent` field as `Remitted`.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {filteredReadyToRemit.length === 0 ? (
                  <EmptyState message="No merchants are waiting for remittance." />
                ) : (
                  <div className="overflow-x-auto">
                    <Table className="[&_th]:h-9 [&_td]:py-1.5">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Merchant</TableHead>
                          <TableHead>Orders</TableHead>
                          <TableHead>Total Amount</TableHead>
                          <TableHead>Confirmed At</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredReadyToRemit.map((row) => (
                          <TableRow key={row.merchant}>
                            <TableCell className="font-medium">{row.merchant}</TableCell>
                            <TableCell>{row.orders_count}</TableCell>
                            <TableCell>{formatMoney(row.total_amount)}</TableCell>
                            <TableCell>{formatDateTime(row.merchant_confirmed_at)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                {renderActionButton(
                                  `preview:remit:${row.merchant}`,
                                  'View Orders',
                                  () => openOrdersDrawer(row.merchant, 'remit'),
                                  <Eye className="size-4" />,
                                  'outline',
                                )}
                                {renderActionButton(
                                  `/finance-workflow/mark-remitted:${row.merchant}`,
                                  'Mark Remitted',
                                  () => postAction('/finance-workflow/mark-remitted', row.merchant, `${row.merchant} remitted`),
                                  <CheckCircle2 className="size-4" />,
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-3">
            <Card className="gap-3 border-border/60 py-0 shadow-sm">
              <CardHeader className="px-4 pt-4 pb-0">
                <CardTitle>Recent remittance history</CardTitle>
                <CardDescription>
                  A quick reference of merchants already marked as remitted in your country.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {filteredRemittedHistory.length === 0 ? (
                  <EmptyState message="No remitted merchants found yet." />
                ) : (
                  <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
                    {filteredRemittedHistory.map((row) => (
                      <Card key={row.merchant} className="gap-1 border-border/60 bg-muted/20 py-1">
                        <CardContent className="space-y-1 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="truncate text-sm font-medium" title={row.merchant}>{row.merchant}</div>
                            <Badge variant="secondary">Remitted</Badge>
                          </div>
                          <div className="space-y-0.5 text-xs text-muted-foreground">
                            <div>Orders: {row.orders_count}</div>
                            <div>Total: {formatMoney(row.total_amount)}</div>
                            <div>Remitted at: {formatDateTime(row.remitted_at)}</div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-full gap-2"
                            onClick={() => openOrdersDrawer(row.merchant, 'history')}
                          >
                            <Eye className="size-4" />
                            View Orders
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>}
      </Deferred>

      <Drawer open={drawerMerchant !== null} onOpenChange={(open) => (!open ? closeDrawer() : undefined)}>
        <DrawerContent className="max-h-[88vh]">
          <DrawerHeader className="mx-auto w-full max-w-6xl py-3">
            <DrawerTitle>{drawerMerchant ?? 'Merchant orders'}</DrawerTitle>
            <DrawerDescription>
              Review the orders in the {drawerStage ?? 'selected'} stage before you continue with the workflow.
            </DrawerDescription>
          </DrawerHeader>

          <div className="mx-auto w-full max-w-6xl overflow-y-auto px-3 pb-4 sm:px-4">
            {drawerLoading ? (
              <div className="flex min-h-48 items-center justify-center">
                <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : drawerOrders.length === 0 ? (
              <EmptyState message="No orders found for this merchant and stage." />
            ) : (
              <>
                {isDeliveryDrawer ? (
                  <div className="mb-3 flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={allDeliverySelected}
                        onCheckedChange={(checked) => toggleAllDeliveryOrders(Boolean(checked))}
                      />
                      <div className="text-sm">
                        <div className="font-medium">Confirm payment for selected orders</div>
                        <div className="text-muted-foreground">
                          {selectedDeliveryOrderIds.length} of {drawerOrders.length} selected
                        </div>
                      </div>
                    </div>
                    <Button
                      onClick={confirmSelectedDeliveryOrders}
                      disabled={pendingKey === `/finance-workflow/mark-delivered:${drawerMerchant}:selected`}
                      className="gap-2"
                    >
                      {pendingKey === `/finance-workflow/mark-delivered:${drawerMerchant}:selected`
                        ? <LoaderCircle className="size-4 animate-spin" />
                        : <CheckCircle2 className="size-4" />}
                      Mark Selected Delivered
                    </Button>
                  </div>
                ) : null}

                {isConfirmationDrawer ? (
                  <div className="mb-3 flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/20 p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={allConfirmationSelected}
                          onCheckedChange={(checked) => toggleAllConfirmationOrders(Boolean(checked))}
                        />
                        <div className="text-sm">
                          <div className="font-medium">Choose which delivered orders continue now</div>
                          <div className="text-muted-foreground">
                            {selectedConfirmationOrderIds.length} of {drawerOrders.length} selected
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                      <Button
                        variant="outline"
                        onClick={openConfirmationReportDialog}
                        disabled={pendingKey === `download:${drawerMerchant}`}
                        className="gap-2"
                      >
                        {pendingKey === `download:${drawerMerchant}`
                          ? <LoaderCircle className="size-4 animate-spin" />
                          : <Download className="size-4" />}
                        Report For Selected
                      </Button>
                      <Button
                        onClick={confirmSelectedMerchantOrders}
                        disabled={pendingKey === `/finance-workflow/mark-confirmed:${drawerMerchant}`}
                        className="gap-2"
                      >
                        {pendingKey === `/finance-workflow/mark-confirmed:${drawerMerchant}`
                          ? <LoaderCircle className="size-4 animate-spin" />
                          : <CheckCircle2 className="size-4" />}
                        Mark Selected Confirmed
                      </Button>
                    </div>
                  </div>
                ) : null}

                  <div className="space-y-2 sm:hidden">
                  {drawerOrders.map((order) => (
                    <Card key={order.id} className="border-border/60 shadow-none">
                      <CardContent className="space-y-2 p-3 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            {isDeliveryDrawer || isConfirmationDrawer ? (
                              <Checkbox
                                checked={isDeliveryDrawer
                                  ? selectedDeliveryOrderIds.includes(order.id)
                                  : selectedConfirmationOrderIds.includes(order.id)}
                                onCheckedChange={(checked) => (isDeliveryDrawer
                                  ? toggleDeliveryOrder(order.id, Boolean(checked))
                                  : toggleConfirmationOrder(order.id, Boolean(checked)))}
                              />
                            ) : null}
                            <div className="min-w-0">
                              <div className="text-xs uppercase tracking-wide text-muted-foreground">Order No</div>
                              <div className="truncate font-medium" title={order.order_no}>{order.order_no}</div>
                            </div>
                          </div>
                          <Badge variant="outline" className="max-w-[45%] truncate" title={order.status ?? '-'}>
                            {order.status ?? '-'}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="min-w-0">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">Client</div>
                            <div className="truncate" title={order.client_name ?? '-'}>{order.client_name ?? '-'}</div>
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">Amount</div>
                            <div className="truncate" title={formatMoney(Number(order.amount ?? 0))}>
                              {formatMoney(Number(order.amount ?? 0))}
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">Quantity</div>
                            <div className="truncate" title={order.quantity?.toString() ?? '-'}>
                              {order.quantity ?? '-'}
                            </div>
                          </div>
                          <div className="col-span-2 min-w-0">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">Product</div>
                            <div className="truncate" title={order.product_name ?? '-'}>{order.product_name ?? '-'}</div>
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">Agent</div>
                            <div className="truncate" title={order.agent ?? '-'}>{order.agent ?? '-'}</div>
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">Code</div>
                            <div className="truncate" title={order.code ?? '-'}>{order.code ?? '-'}</div>
                          </div>
                          <div className="col-span-2 min-w-0">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">Delivery Date</div>
                            {/* FIX: Use formatDateOnly to avoid timezone off-by-one */}
                            <div className="truncate" title={formatDateOnly(order.delivery_date)}>{formatDateOnly(order.delivery_date)}</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

	                <div className="hidden overflow-x-auto rounded-xl border sm:block">
	                  <Table className="table-fixed">
	                      <TableHeader>
	                      <TableRow>
	                        {isDeliveryDrawer || isConfirmationDrawer ? <TableHead className="w-[6%]">Pick</TableHead> : null}
	                        <TableHead className="w-[12%]">Order No</TableHead>
	                        <TableHead className="w-[14%]">Client</TableHead>
	                        <TableHead className="w-[18%]">Product</TableHead>
                        <TableHead className="w-[9%]">Qty</TableHead>
                        <TableHead className="w-[9%]">Amount</TableHead>
                        <TableHead className="w-[9%]">Status</TableHead>
                        <TableHead className="w-[9%]">Agent</TableHead>
                        <TableHead className="w-[9%]">Code</TableHead>
                        <TableHead className="w-[12%]">Delivery Date</TableHead>
                      </TableRow>
                    </TableHeader>
	                    <TableBody>
	                      {drawerOrders.map((order) => (
	                        <TableRow key={order.id}>
                          {isDeliveryDrawer || isConfirmationDrawer ? (
                            <TableCell>
                              <Checkbox
                                checked={isDeliveryDrawer
                                  ? selectedDeliveryOrderIds.includes(order.id)
                                  : selectedConfirmationOrderIds.includes(order.id)}
                                onCheckedChange={(checked) => (isDeliveryDrawer
                                  ? toggleDeliveryOrder(order.id, Boolean(checked))
                                  : toggleConfirmationOrder(order.id, Boolean(checked)))}
                              />
                            </TableCell>
                          ) : null}
	                          <TableCell className="font-medium">
	                            <TruncatedCell value={order.order_no} />
	                          </TableCell>
                          <TableCell>
                            <TruncatedCell value={order.client_name} />
                          </TableCell>
                          <TableCell>
                            <TruncatedCell value={order.product_name} />
                          </TableCell>
                          <TableCell>
                            <TruncatedCell value={order.quantity} />
                          </TableCell>
                          <TableCell>
                            <TruncatedCell value={formatMoney(Number(order.amount ?? 0))} />
                          </TableCell>
                          <TableCell>
                            <TruncatedCell value={order.status} />
                          </TableCell>
                          <TableCell>
                            <TruncatedCell value={order.agent} />
                          </TableCell>
                          <TableCell>
                            <TruncatedCell value={order.code} />
                          </TableCell>
                          <TableCell>
                            {/* FIX: Use formatDateOnly to avoid timezone off-by-one */}
                            <TruncatedCell value={formatDateOnly(order.delivery_date)} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      <Dialog
        open={reportMerchant !== null}
        onOpenChange={(open) => {
          if (!open) {
            setReportMerchant(null);
            setReportOrderIds([]);
            setSelectedStatuses([]);
            setReportDateRange(undefined);
            setReportDatePickerOpen(false);
          }
        }}
      >
        <DialogContent className="flex max-h-[80vh] max-w-lg flex-col gap-3 overflow-hidden p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle>Configure report for {reportMerchant ?? 'merchant'}</DialogTitle>
            <DialogDescription>
              Delivered orders from this workflow are always included. Add any extra statuses only when you need more context, and limit those extras with a date range.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            <div className="rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-success">
              Included automatically: the selected delivered orders for this merchant that you chose to continue with right now.
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Date range for optional extra statuses</div>
              <Popover open={reportDatePickerOpen} onOpenChange={setReportDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'h-11 w-full justify-start text-left font-normal',
                      !reportDateRange?.from && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {reportDateRange?.from ? (
                      reportDateRange.to ? (
                        <>
                          {format(reportDateRange.from, 'LLL dd, y')} - {format(reportDateRange.to, 'LLL dd, y')}
                        </>
                      ) : (
                        format(reportDateRange.from, 'LLL dd, y')
                      )
                    ) : (
                      <span>Pick a date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    numberOfMonths={2}
                    defaultMonth={reportDateRange?.from}
                    selected={reportDateRange}
                    onSelect={(range) => setReportDateRange(range)}
                  />
                </PopoverContent>
              </Popover>
              <p className="text-sm text-muted-foreground">
                Only applies when you add extra statuses below. Delivered workflow orders stay included automatically.
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Optional extra statuses</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {extraStatusOptions.map((status) => {
                  const checked = selectedStatuses.includes(status);

                  return (
                    <label key={status} className="flex items-center gap-3 rounded-xl border p-2.5">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(nextChecked) => {
                          setSelectedStatuses((current) =>
                            nextChecked
                              ? [...current, status]
                              : current.filter((item) => item !== status),
                          );
                        }}
                      />
                      <span className="text-sm font-medium">{status}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t px-4 py-3 gap-2 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setReportMerchant(null);
                setReportOrderIds([]);
                setSelectedStatuses([]);
                setReportDateRange(undefined);
                setReportDatePickerOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button onClick={downloadReport} disabled={reportMerchant ? pendingKey === `download:${reportMerchant}` : false}>
              {reportMerchant && pendingKey === `download:${reportMerchant}` ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
              Generate Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
