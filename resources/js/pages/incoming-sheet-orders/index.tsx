'use client';

import { Badge } from '@/components/ui/badge';
import type { BreadcrumbItem } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { Head, router, usePage } from '@inertiajs/react';
import { AlertTriangle, CheckCircle2, Clock3, Eye, LoaderCircle, Search, XCircle } from 'lucide-react';
import * as React from 'react';

type IncomingStatus = 'pending' | 'processing' | 'processed' | 'failed';

interface IncomingOrder {
    id: number;
    order_no: string | null;
    sheet_id: string | null;
    sheet_name: string | null;
    status: IncomingStatus;
    attempts: number;
    error_message: string | null;
    processed_at: string | null;
    available_at: string | null;
    created_at: string;
    updated_at: string;
    payload: Record<string, unknown>;
}

interface PaginationLink {
    url: string | null;
    label: string;
    active: boolean;
}

interface Paginated<T> {
    data: T[];
    links: PaginationLink[];
    from: number | null;
    to: number | null;
    total: number;
}

const BREADCRUMBS: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/dashboard' },
    { title: 'Incoming Orders', href: '/incoming-sheet-orders' },
];

const statusStyles: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
    processing: 'bg-sky-100 text-sky-800 hover:bg-sky-100',
    processed: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
    failed: 'bg-rose-100 text-rose-800 hover:bg-rose-100',
};

export default function IncomingSheetOrdersIndex() {
    const { props } = usePage();
    const { incomingOrders, filters, statusCounts } = props as unknown as {
        incomingOrders: Paginated<IncomingOrder>;
        filters: { search?: string; status?: string };
        statusCounts: Record<string, number>;
    };

    const [search, setSearch] = React.useState(filters.search ?? '');
    const [payloadOrder, setPayloadOrder] = React.useState<IncomingOrder | null>(null);

    const applyFilters = React.useCallback(
        (next: { search?: string; status?: string }) => {
            router.get(
                '/incoming-sheet-orders',
                {
                    search: next.search ?? search,
                    status: next.status ?? filters.status ?? 'all',
                },
                {
                    preserveScroll: true,
                    preserveState: true,
                    replace: true,
                },
            );
        },
        [filters.status, search],
    );

    const submitSearch = (event: React.FormEvent) => {
        event.preventDefault();
        applyFilters({ search });
    };

    const statCards = [
        { label: 'Pending', value: statusCounts.pending ?? 0, icon: Clock3, className: 'text-amber-700' },
        { label: 'Processing', value: statusCounts.processing ?? 0, icon: LoaderCircle, className: 'text-sky-700' },
        { label: 'Processed', value: statusCounts.processed ?? 0, icon: CheckCircle2, className: 'text-emerald-700' },
        { label: 'Failed', value: statusCounts.failed ?? 0, icon: XCircle, className: 'text-rose-700' },
    ];

    return (
        <AppLayout breadcrumbs={BREADCRUMBS}>
            <Head title="Incoming Orders" />

            <div className="space-y-4 p-4 sm:p-6">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {statCards.map((item) => {
                        const Icon = item.icon;

                        return (
                            <Card key={item.label}>
                                <CardContent className="flex items-center justify-between p-4">
                                    <div>
                                        <p className="text-sm text-muted-foreground">{item.label}</p>
                                        <p className="text-2xl font-semibold">{item.value}</p>
                                    </div>
                                    <Icon className={`h-5 w-5 ${item.className}`} />
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>

                <Card>
                    <CardHeader className="border-b">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <CardTitle>Incoming Sheet Orders</CardTitle>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {incomingOrders.from ?? 0}-{incomingOrders.to ?? 0} of {incomingOrders.total} buffered payloads
                                </p>
                            </div>

                            <div className="flex flex-col gap-2 sm:flex-row">
                                <form onSubmit={submitSearch} className="relative min-w-[260px]">
                                    <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        value={search}
                                        onChange={(event) => setSearch(event.target.value)}
                                        placeholder="Search order, sheet id, sheet name"
                                        className="h-10 pl-9"
                                    />
                                </form>

                                <Select value={filters.status ?? 'all'} onValueChange={(status) => applyFilters({ status })}>
                                    <SelectTrigger className="h-10 min-w-[160px]">
                                        <SelectValue placeholder="Status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All statuses</SelectItem>
                                        <SelectItem value="pending">Pending</SelectItem>
                                        <SelectItem value="processing">Processing</SelectItem>
                                        <SelectItem value="processed">Processed</SelectItem>
                                        <SelectItem value="failed">Failed</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="min-w-[110px]">Order</TableHead>
                                        <TableHead className="min-w-[220px]">Sheet</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Attempts</TableHead>
                                        <TableHead className="min-w-[180px]">Queued</TableHead>
                                        <TableHead className="min-w-[180px]">Processed</TableHead>
                                        <TableHead className="min-w-[260px]">Error</TableHead>
                                        <TableHead className="w-[120px] text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {incomingOrders.data.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={8} className="h-28 text-center text-muted-foreground">
                                                No buffered orders found
                                            </TableCell>
                                        </TableRow>
                                    )}

                                    {incomingOrders.data.map((order) => (
                                        <TableRow key={order.id}>
                                            <TableCell className="font-medium">{order.order_no || '-'}</TableCell>
                                            <TableCell>
                                                <div className="max-w-[320px]">
                                                    <p className="truncate font-medium">{order.sheet_name || '-'}</p>
                                                    <p className="truncate text-xs text-muted-foreground">{order.sheet_id || '-'}</p>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={statusStyles[order.status] ?? ''}>{order.status}</Badge>
                                            </TableCell>
                                            <TableCell>{order.attempts}</TableCell>
                                            <TableCell className="text-sm text-muted-foreground">{order.created_at}</TableCell>
                                            <TableCell className="text-sm text-muted-foreground">{order.processed_at || '-'}</TableCell>
                                            <TableCell>
                                                {order.error_message ? (
                                                    <div className="flex max-w-[360px] items-center gap-2 text-sm text-rose-700">
                                                        <AlertTriangle className="h-4 w-4 shrink-0" />
                                                        <span className="truncate" title={order.error_message}>
                                                            {order.error_message}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    {order.status === 'failed' && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() =>
                                                                router.post(`/incoming-sheet-orders/${order.id}/retry`, undefined, {
                                                                    preserveScroll: true,
                                                                })
                                                            }
                                                        >
                                                            Retry
                                                        </Button>
                                                    )}
                                                    <Button variant="ghost" size="icon" onClick={() => setPayloadOrder(order)}>
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>

                        {incomingOrders.links.length > 3 && (
                            <div className="flex flex-wrap items-center justify-end gap-2 border-t p-4">
                                {incomingOrders.links.map((link, index) => (
                                    <Button
                                        key={`${link.label}-${index}`}
                                        variant={link.active ? 'default' : 'outline'}
                                        size="sm"
                                        disabled={!link.url}
                                        onClick={() => link.url && router.visit(link.url, { preserveScroll: true })}
                                        dangerouslySetInnerHTML={{ __html: link.label }}
                                    />
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Dialog open={payloadOrder !== null} onOpenChange={(open) => !open && setPayloadOrder(null)}>
                <DialogContent className="max-h-[80vh] overflow-hidden sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Payload {payloadOrder?.order_no ? `for ${payloadOrder.order_no}` : ''}</DialogTitle>
                    </DialogHeader>
                    <pre className="max-h-[60vh] overflow-auto rounded-md bg-slate-950 p-4 text-xs whitespace-pre-wrap text-slate-50">
                        {payloadOrder ? JSON.stringify(payloadOrder.payload, null, 2) : ''}
                    </pre>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
