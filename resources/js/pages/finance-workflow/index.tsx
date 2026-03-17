"use client";

import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { ArrowRight, CheckCircle2, Download, Eye, LoaderCircle, ReceiptText, WalletCards } from 'lucide-react';
import * as React from 'react';

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

interface FinanceWorkflowPageProps {
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
  statusOptions: string[];
}

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

function EmptyState({ message }: { message: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex min-h-40 items-center justify-center text-muted-foreground">
        {message}
      </CardContent>
    </Card>
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
  const { readyForDelivery, awaitingConfirmation, readyToRemit, remittedHistory, summary } =
    usePage<FinanceWorkflowPageProps>().props;
  const [pendingKey, setPendingKey] = React.useState<string | null>(null);
  const [drawerMerchant, setDrawerMerchant] = React.useState<string | null>(null);
  const [drawerStage, setDrawerStage] = React.useState<'delivery' | 'confirmation' | 'remit' | 'history' | null>(null);
  const [drawerOrders, setDrawerOrders] = React.useState<WorkflowOrder[]>([]);
  const [drawerLoading, setDrawerLoading] = React.useState(false);
  const { statusOptions } = usePage<FinanceWorkflowPageProps>().props;
  const [reportMerchant, setReportMerchant] = React.useState<string | null>(null);
  const [selectedStatuses, setSelectedStatuses] = React.useState<string[]>([]);

  const visitWorkflow = React.useCallback(() => {
    router.reload({ only: ['readyForDelivery', 'awaitingConfirmation', 'readyToRemit', 'remittedHistory', 'summary'] });
  }, []);

  const postAction = React.useCallback(
    (url: string, merchant: string, successMessage: string) => {
      const actionKey = `${url}:${merchant}`;
      setPendingKey(actionKey);

      router.post(
        url,
        { merchant },
        {
          preserveScroll: true,
          onSuccess: () => {
            toast.success(successMessage);
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

  const openReportDialog = React.useCallback((merchant: string) => {
    setReportMerchant(merchant);
    setSelectedStatuses(statusOptions.includes('Delivered') ? ['Delivered'] : statusOptions.slice(0, 1));
  }, [statusOptions]);

  const downloadReport = React.useCallback(() => {
    if (!reportMerchant) return;
    if (selectedStatuses.length === 0) {
      toast.error('Select at least one status for the report');
      return;
    }

    const actionKey = `download:${reportMerchant}`;
    setPendingKey(actionKey);

    const params = new URLSearchParams({ merchant: reportMerchant });
    selectedStatuses.forEach((status) => params.append('statuses[]', status));
    window.location.href = `/finance-workflow/download-report?${params.toString()}`;
    toast.success('Merchant report download started');

    window.setTimeout(() => {
      setPendingKey(null);
      setReportMerchant(null);
      visitWorkflow();
    }, 900);
  }, [reportMerchant, selectedStatuses, visitWorkflow]);

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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load merchant orders');
    } finally {
      setDrawerLoading(false);
    }
  }, []);

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Finance Workflow" />

      <div className="space-y-6 p-4">
        <Card className="overflow-hidden border-border/60 bg-gradient-to-r from-slate-950 via-slate-900 to-emerald-950 text-white shadow-xl">
          <CardContent className="flex flex-col gap-6 p-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-sm uppercase tracking-[0.25em] text-emerald-200">Finance Operations</p>
              <h1 className="text-2xl font-semibold">Merchant payment to remittance workflow</h1>
              <p className="max-w-2xl text-sm text-slate-200/85">
                Move merchants through payment confirmation, report generation, confirmation, and final remittance without mixing up countries or teams.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Ready</p>
                <p className="mt-1 text-xl font-semibold">{summary.readyForDelivery}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Awaiting</p>
                <p className="mt-1 text-xl font-semibold">{summary.awaitingConfirmation}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-300">To Remit</p>
                <p className="mt-1 text-xl font-semibold">{summary.readyToRemit}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Remitted</p>
                <p className="mt-1 text-xl font-semibold">{summary.remitted}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="delivery" className="space-y-4">
          <TabsList className="h-auto flex-wrap gap-2 bg-transparent p-0">
            <TabsTrigger value="delivery">1. Confirm Payment</TabsTrigger>
            <TabsTrigger value="confirmation">2. Await Confirmation</TabsTrigger>
            <TabsTrigger value="remit">3. Remit</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="delivery" className="space-y-4">
            <Card className="border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ReceiptText className="size-5" />
                  Scheduled orders with payment codes
                </CardTitle>
                <CardDescription>
                  These merchants have scheduled orders with a populated code. Finance can confirm payment and move them to delivered.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {readyForDelivery.length === 0 ? (
                  <EmptyState message="No merchants are waiting for payment confirmation right now." />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
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
                        {readyForDelivery.map((row) => (
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
                                {renderActionButton(
                                  `/finance-workflow/mark-delivered:${row.merchant}`,
                                  'Mark Delivered',
                                  () => postAction('/finance-workflow/mark-delivered', row.merchant, `${row.merchant} moved to delivered`),
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

          <TabsContent value="confirmation" className="space-y-4">
            <Card className="border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle>Delivered and waiting for merchant confirmation</CardTitle>
                <CardDescription>
                  Generate the report for the merchant, then mark confirmation when they approve the statement.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {awaitingConfirmation.length === 0 ? (
                  <EmptyState message="No merchants are currently waiting for report confirmation." />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
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
                        {awaitingConfirmation.map((row) => (
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
                                {renderActionButton(
                                  `download:${row.merchant}`,
                                  'Download Report',
                                  () => openReportDialog(row.merchant),
                                  <Download className="size-4" />,
                                  'outline',
                                )}
                                {renderActionButton(
                                  `/finance-workflow/mark-confirmed:${row.merchant}`,
                                  'Mark Confirmed',
                                  () => postAction('/finance-workflow/mark-confirmed', row.merchant, `${row.merchant} confirmed`),
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

          <TabsContent value="remit" className="space-y-4">
            <Card className="border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <WalletCards className="size-5" />
                  Merchant confirmed and ready to remit
                </CardTitle>
                <CardDescription>
                  These orders are delivered, merchant-confirmed, and ready to be marked as remitted. This action keeps using the `agent` field as `Remitted`.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {readyToRemit.length === 0 ? (
                  <EmptyState message="No merchants are waiting for remittance." />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
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
                        {readyToRemit.map((row) => (
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

          <TabsContent value="history" className="space-y-4">
            <Card className="border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle>Recent remittance history</CardTitle>
                <CardDescription>
                  A quick reference of merchants already marked as remitted in your country.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {remittedHistory.length === 0 ? (
                  <EmptyState message="No remitted merchants found yet." />
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {remittedHistory.map((row) => (
                      <Card key={row.merchant} className="border-border/60 bg-muted/20">
                        <CardContent className="space-y-3 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-medium">{row.merchant}</div>
                            <Badge variant="secondary">Remitted</Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <div>Orders: {row.orders_count}</div>
                            <div>Total: {formatMoney(row.total_amount)}</div>
                            <div>Remitted at: {formatDateTime(row.remitted_at)}</div>
                          </div>
                          <Button
                            variant="outline"
                            className="w-full gap-2"
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
      </div>

      <Drawer open={drawerMerchant !== null} onOpenChange={(open) => (!open ? setDrawerMerchant(null) : undefined)}>
        <DrawerContent className="max-h-[88vh]">
          <DrawerHeader className="mx-auto w-full max-w-6xl">
            <DrawerTitle>{drawerMerchant ?? 'Merchant orders'}</DrawerTitle>
            <DrawerDescription>
              Review the orders in the {drawerStage ?? 'selected'} stage before you continue with the workflow.
            </DrawerDescription>
          </DrawerHeader>

          <div className="mx-auto w-full max-w-6xl overflow-y-auto px-4 pb-6">
            {drawerLoading ? (
              <div className="flex min-h-48 items-center justify-center">
                <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : drawerOrders.length === 0 ? (
              <EmptyState message="No orders found for this merchant and stage." />
            ) : (
              <>
                <div className="space-y-3 sm:hidden">
                  {drawerOrders.map((order) => (
                    <Card key={order.id} className="border-border/60 shadow-none">
                      <CardContent className="space-y-3 p-4 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">Order No</div>
                            <div className="truncate font-medium" title={order.order_no}>{order.order_no}</div>
                          </div>
                          <Badge variant="outline" className="max-w-[45%] truncate" title={order.status ?? '-'}>
                            {order.status ?? '-'}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
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
                            <div className="truncate" title={order.delivery_date ?? '-'}>{order.delivery_date ?? '-'}</div>
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
                        <TableHead className="w-[12%]">Order No</TableHead>
                        <TableHead className="w-[16%]">Client</TableHead>
                        <TableHead className="w-[22%]">Product</TableHead>
                        <TableHead className="w-[10%]">Amount</TableHead>
                        <TableHead className="w-[10%]">Status</TableHead>
                        <TableHead className="w-[10%]">Agent</TableHead>
                        <TableHead className="w-[10%]">Code</TableHead>
                        <TableHead className="w-[10%]">Delivery Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {drawerOrders.map((order) => (
                        <TableRow key={order.id}>
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
                            <TruncatedCell value={order.delivery_date} />
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

      <Dialog open={reportMerchant !== null} onOpenChange={(open) => (!open ? setReportMerchant(null) : undefined)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Select statuses for {reportMerchant ?? 'merchant'}</DialogTitle>
            <DialogDescription>
              The report will include these statuses, and those same reported orders will move through confirmation and remittance later.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-2 sm:grid-cols-2">
            {statusOptions.map((status) => {
              const checked = selectedStatuses.includes(status);

              return (
                <label key={status} className="flex items-center gap-3 rounded-xl border p-3">
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

          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setReportMerchant(null)}>
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
