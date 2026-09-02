"use client";

import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { Calendar } from '@/components/ui/calendar';
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from '@/components/ui/pagination';
import { Check, ChevronsUpDown, FilterIcon, History, LoaderCircle, Pin, RefreshCwIcon, SearchX, X } from 'lucide-react';
import * as React from 'react';
import { format } from 'date-fns';
import { type DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';

const statusColors: Record<string, string> = {
    Delivered: "bg-emerald-100 text-emerald-700 border-emerald-200",
    Pending: "bg-amber-100 text-amber-700 border-amber-200",
    Scheduled: "bg-sky-100 text-sky-700 border-sky-200",
    Dispatched: "bg-blue-100 text-blue-700 border-blue-200",
    Cancelled: "bg-rose-100 text-rose-700 border-rose-200",
    Followup: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
    WrongContact: "bg-slate-100 text-slate-700 border-slate-200",
};

const BREADCRUMBS: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/dashboard' },
    { title: 'Clearance', href: '/clearance' },
];

interface ClearanceOrder {
    id: number;
    order_no: string;
    client_name: string;
    product_name: string;
    address: string;
    phone: string;
    amount: string | number | null;
    quantity: string | number | null;
    status: string;
    delivery_date: string;
    merchant: string;
    code: string;
    agent: string;
    clearance_status: string;
    updated_at: string;
}

interface PaginationLinkData {
    url: string | null;
    label: string;
    active: boolean;
}

interface AgentOption {
    id: number;
    name: string;
}

interface Filters {
    agent?: string;
    from_date?: string;
    to_date?: string;
}

interface OrderHistoryItem {
    id: number;
    attribute: string;
    old_value: string;
    new_value: string;
    created_at: string;
    user: { name: string } | null;
}

const attributeLabels: Record<string, string> = {
    agent: 'Agent',
    clearance_status: 'Clearance Status',
    status: 'Status',
    amount: 'Amount',
    quantity: 'Quantity',
    delivery_date: 'Delivery Date',
    cc_email: 'CC Email',
    merchant: 'Merchant',
    product_name: 'Product',
    order_no: 'Order No',
};

const COLUMNS: { key: keyof ClearanceOrder; label: string; align?: 'right' }[] = [
    { key: 'order_no', label: 'Order No' },
    { key: 'client_name', label: 'Client' },
    { key: 'product_name', label: 'Product' },
    { key: 'amount', label: 'Amount', align: 'right' },
    { key: 'quantity', label: 'Qty', align: 'right' },
    { key: 'status', label: 'Status' },
    { key: 'delivery_date', label: 'Delivery Date' },
    { key: 'agent', label: 'Agent' },
    { key: 'clearance_status', label: 'Clearance Status' },
    { key: 'phone', label: 'Phone' },
    { key: 'address', label: 'Address' },
];

export default function Index() {
    const isMobile = useIsMobile();
    const { props } = usePage();
    const currencyCode = (props.selectedCurrency as string) || 'KES';
    const currency = new Intl.NumberFormat('en-' + (currencyCode === 'KES' ? 'KE' : 'US'), {
        style: 'currency',
        currency: currencyCode,
        minimumFractionDigits: 2,
    });
    const { orders, agents, filters: initialFilters } = props as unknown as {
        orders: { data: ClearanceOrder[]; links: PaginationLinkData[] },
        agents: AgentOption[],
        filters: Filters,
    };

    const [filters, setFilters] = React.useState<Filters>({
        agent: initialFilters?.agent ?? undefined,
        from_date: initialFilters?.from_date ?? undefined,
        to_date: initialFilters?.to_date ?? undefined,
    });
    const [dateRange, setDateRange] = React.useState<DateRange | undefined>(() => {
        const from = initialFilters?.from_date ? new Date(`${initialFilters.from_date}T12:00:00`) : undefined;
        const to = initialFilters?.to_date ? new Date(`${initialFilters.to_date}T12:00:00`) : undefined;
        return from || to ? { from, to } : undefined;
    });
    const [filterDialogOpen, setFilterDialogOpen] = React.useState(false);
    const [agentOpen, setAgentOpen] = React.useState(false);
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [stickyFirstColumn, setStickyFirstColumn] = React.useState(true);
    const [isApplyingFilters, setIsApplyingFilters] = React.useState(false);
    const [updatingClearanceId, setUpdatingClearanceId] = React.useState<number | null>(null);
    const [historyOrderNo, setHistoryOrderNo] = React.useState<string | null>(null);
    const [historyLoading, setHistoryLoading] = React.useState(false);
    const [selectedHistories, setSelectedHistories] = React.useState<OrderHistoryItem[]>([]);

    const formatDate = (date: Date) => format(date, "yyyy-MM-dd");

    const hasActiveFilters = Boolean(filters.agent || filters.from_date || filters.to_date);

    const applyFilters = () => {
        setIsApplyingFilters(true);
        router.get('/clearance', {
            agent: filters.agent ?? undefined,
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

    const clearAllFilters = () => {
        setFilters({});
        setDateRange(undefined);
        setIsApplyingFilters(true);
        router.get('/clearance', {}, {
            preserveState: true,
            onSuccess: () => toast.success('Filters cleared'),
            onError: () => toast.error('Failed to clear filters'),
            onFinish: () => setIsApplyingFilters(false),
        });
    };

    const refreshOrders = () => {
        setIsRefreshing(true);
        router.get('/clearance', {}, {
            preserveState: true,
            onSuccess: () => toast.success('Orders refreshed'),
            onError: () => toast.error('Failed to refresh orders'),
            onFinish: () => setIsRefreshing(false),
        });
    };

    const toggleClearance = (order: ClearanceOrder) => {
        const next = order.clearance_status === 'cleared' ? 'not_cleared' : 'cleared';
        setUpdatingClearanceId(order.id);
        router.put(`/sheetorders/${order.id}`, { clearance_status: next }, {
            preserveState: true,
            preserveScroll: true,
            only: ['orders'],
            onSuccess: () => toast.success(next === 'cleared' ? 'Order marked as cleared' : 'Order marked as not cleared'),
            onError: () => toast.error('Failed to update clearance status'),
            onFinish: () => setUpdatingClearanceId(null),
        });
    };

    const openHistory = async (order: ClearanceOrder) => {
        setHistoryOrderNo(order.order_no);
        setHistoryLoading(true);
        setSelectedHistories([]);
        try {
            const res = await fetch(`/sheetorders/${order.id}/histories`);
            const data = await res.json();
            setSelectedHistories(data.histories || []);
        } catch (error) {
            toast.error('Failed to load edit history');
        } finally {
            setHistoryLoading(false);
        }
    };

    const removeAgentFilter = () => {
        setFilters((prev) => ({ ...prev, agent: undefined }));
        router.get('/clearance', {
            from_date: filters.from_date ?? undefined,
            to_date: filters.to_date ?? undefined,
        }, { preserveState: true });
    };

    const removeDateFilter = () => {
        setDateRange(undefined);
        setFilters((prev) => ({ ...prev, from_date: undefined, to_date: undefined }));
        router.get('/clearance', {
            agent: filters.agent ?? undefined,
        }, { preserveState: true });
    };

    const totalAmount = React.useMemo(
        () => orders.data.reduce((sum, order) => sum + Number(order.amount ?? 0), 0),
        [orders.data],
    );
    const agentCount = React.useMemo(
        () => new Set(orders.data.map((order) => order.agent).filter(Boolean)).size,
        [orders.data],
    );
    const merchantCount = React.useMemo(
        () => new Set(orders.data.map((order) => order.merchant).filter(Boolean)).size,
        [orders.data],
    );
    const clearedCount = React.useMemo(
        () => orders.data.filter((order) => order.clearance_status === 'cleared').length,
        [orders.data],
    );
    const pendingClearanceCount = orders.data.length - clearedCount;

    const getStatusPillClass = (status: string) => {
        const normalized = status?.trim() || "New Orders";
        return statusColors[normalized] || "bg-slate-100 text-slate-700 border-slate-200";
    };

    const renderCellValue = (order: ClearanceOrder, col: { key: keyof ClearanceOrder; label: string; align?: 'right' }) => {
        if (col.key === 'amount') {
            return Number(order.amount ?? 0) > 0 ? currency.format(Number(order.amount)) : '';
        }
        if (col.key === 'status') {
            const value = order.status?.trim() || "New Orders";
            return (
                <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-medium', getStatusPillClass(value))}>
                    {value}
                </span>
            );
        }
        if (col.key === 'agent') {
            return order.agent ? <Badge variant="secondary">{order.agent}</Badge> : '';
        }
        if (col.key === 'clearance_status') {
            const cleared = order.clearance_status === 'cleared';
            const updating = updatingClearanceId === order.id;
            return (
                <Button
                    variant={cleared ? 'default' : 'outline'}
                    size="sm"
                    className={cn('gap-2', cleared && 'bg-emerald-600 hover:bg-emerald-700')}
                    onClick={() => toggleClearance(order)}
                    disabled={updating}
                    title={cleared ? 'Click to mark as not cleared' : 'Click to mark as cleared'}
                >
                    {updating ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    ) : cleared ? (
                        <Check className="h-3.5 w-3.5" />
                    ) : (
                        <X className="h-3.5 w-3.5" />
                    )}
                    {cleared ? 'Cleared' : 'Not Cleared'}
                </Button>
            );
        }
        return String(order[col.key] ?? "");
    };

    return (
        <AppLayout breadcrumbs={BREADCRUMBS}>
            <Head title="Clearance" />

            <div className="flex flex-col gap-4 p-4 md:p-6">
                <div className="rounded-xl border bg-card p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Clearance</h1>
                            <p className="text-sm text-muted-foreground">
                                Orders assigned to agents, excluding remitted ones.
                            </p>
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

                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                        <div className="rounded-lg border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Total Orders</p>
                            <p className="text-lg font-semibold">{orders.data.length}</p>
                        </div>
                        <div className="rounded-lg border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Total Amount</p>
                            <p className="text-lg font-semibold">{currency.format(totalAmount)}</p>
                        </div>
                        <div className="rounded-lg border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Cleared</p>
                            <p className="text-lg font-semibold text-emerald-600">{clearedCount}</p>
                        </div>
                        <div className="rounded-lg border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Pending Clearance</p>
                            <p className="text-lg font-semibold text-amber-600">{pendingClearanceCount}</p>
                        </div>
                        <div className="rounded-lg border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Agents</p>
                            <p className="text-lg font-semibold">{agentCount}</p>
                        </div>
                        <div className="rounded-lg border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Merchants</p>
                            <p className="text-lg font-semibold">{merchantCount}</p>
                        </div>
                    </div>

                    {hasActiveFilters && (
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            <span className="text-xs font-medium text-muted-foreground">Active filters:</span>
                            {filters.agent && (
                                <Badge variant="secondary" className="gap-1.5 pr-1">
                                    Agent: {filters.agent}
                                    <button onClick={removeAgentFilter} aria-label="Remove agent filter" className="rounded-sm p-0.5 hover:bg-muted">
                                        <X className="h-3 w-3" />
                                    </button>
                                </Badge>
                            )}
                            {(filters.from_date || filters.to_date) && (
                                <Badge variant="secondary" className="gap-1.5 pr-1">
                                    {filters.from_date ?? '…'} – {filters.to_date ?? '…'}
                                    <button onClick={removeDateFilter} aria-label="Remove date filter" className="rounded-sm p-0.5 hover:bg-muted">
                                        <X className="h-3 w-3" />
                                    </button>
                                </Badge>
                            )}
                            <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs" onClick={clearAllFilters}>
                                Clear all
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            <div className="rounded-xl border bg-card shadow-sm">
                <div className="flex items-center justify-end border-b px-4 py-2">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Pin className="h-3 w-3" />
                        Lock order column
                        <Switch
                            checked={stickyFirstColumn}
                            onCheckedChange={setStickyFirstColumn}
                            className="scale-75"
                        />
                    </label>
                </div>
                <div className="scrollbar-custom w-full overflow-x-auto">
                    <Table className="min-w-[1040px]">
                        <TableHeader className="bg-muted/60">
                            <TableRow className="hover:bg-muted/60">
                                {COLUMNS.map((col, i) => (
                                    <TableHead
                                        key={col.key}
                                        className={cn(
                                            'h-11 whitespace-nowrap px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                                            col.align === 'right' && 'text-right',
                                            i === 0 && stickyFirstColumn && 'sticky left-0 z-20 bg-muted/60 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]',
                                        )}
                                    >
                                        {col.label}
                                    </TableHead>
                                ))}
                                <TableHead className="h-11 whitespace-nowrap px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    History
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {orders.data.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={COLUMNS.length + 1} className="h-40 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                                                <SearchX className="h-6 w-6 text-muted-foreground/60" />
                                            </div>
                                            <span className="font-medium">No clearance orders found</span>
                                            {hasActiveFilters && (
                                                <Button variant="outline" size="sm" onClick={clearAllFilters}>
                                                    Clear filters
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                orders.data.map((order) => (
                                    <TableRow key={order.id} className="transition-colors hover:bg-muted/50">
                                        {COLUMNS.map((col, i) => (
                                            <TableCell
                                                key={col.key}
                                                className={cn(
                                                    'max-w-[180px] truncate whitespace-nowrap px-3 py-2',
                                                    col.align === 'right' && 'text-right font-mono text-sm tabular-nums',
                                                    col.key === 'order_no' && 'font-medium',
                                                    col.key === 'product_name' && 'font-medium',
                                                    i === 0 && stickyFirstColumn && 'sticky left-0 z-20 bg-card shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]',
                                                )}
                                            >
                                                {renderCellValue(order, col)}
                                            </TableCell>
                                        ))}
                                        <TableCell className="whitespace-nowrap px-3 py-2 text-center">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                                onClick={() => openHistory(order)}
                                                title={`View edit history for ${order.order_no}`}
                                            >
                                                <History className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            <div className="flex justify-center pb-2">
                <Pagination>
                    <PaginationContent className="flex-wrap">
                        {orders.links.map((link, index) => {
                            const isFirst = index === 0;
                            const isLast = index === orders.links.length - 1;
                            const isEllipsis = link.label.trim() === '...';
                            const disabled = !link.url;

                            const go = (e: React.MouseEvent<HTMLAnchorElement>) => {
                                e.preventDefault();
                                if (link.url) {
                                    router.get(link.url, {}, { preserveState: true });
                                }
                            };

                            if (isFirst || isLast) {
                                const NavComponent = isFirst ? PaginationPrevious : PaginationNext;
                                return (
                                    <PaginationItem key={index}>
                                        <NavComponent
                                            href={link.url ?? undefined}
                                            aria-disabled={disabled}
                                            className={cn(disabled && 'pointer-events-none opacity-50')}
                                            onClick={go}
                                        />
                                    </PaginationItem>
                                );
                            }

                            if (isEllipsis) {
                                return (
                                    <PaginationItem key={index}>
                                        <PaginationEllipsis />
                                    </PaginationItem>
                                );
                            }

                            return (
                                <PaginationItem key={index}>
                                    <PaginationLink
                                        size="icon"
                                        isActive={link.active}
                                        href={link.url ?? undefined}
                                        aria-disabled={disabled}
                                        className={cn(disabled && 'pointer-events-none opacity-50')}
                                        onClick={go}
                                    >
                                        {link.label}
                                    </PaginationLink>
                                </PaginationItem>
                            );
                        })}
                    </PaginationContent>
                </Pagination>
            </div>

            <Dialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
                <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Filter Clearance Orders</DialogTitle>
                    </DialogHeader>

                    <div className="mt-4 space-y-4">
                        <div className="flex flex-col space-y-2">
                            <label className="text-sm font-medium">Agent</label>
                            <Popover open={agentOpen} onOpenChange={setAgentOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        className="w-full justify-between"
                                    >
                                        {filters.agent || "All agents"}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[calc(100vw-3rem)] p-0 sm:w-[280px]">
                                    <Command>
                                        <CommandInput placeholder="Search agent..." />
                                        <CommandList>
                                            <CommandEmpty>No agents found.</CommandEmpty>
                                            <CommandGroup>
                                                <CommandItem
                                                    value="__all__"
                                                    onSelect={() => {
                                                        setFilters((prev) => ({ ...prev, agent: undefined }));
                                                        setAgentOpen(false);
                                                    }}
                                                >
                                                    <Check
                                                        className={cn(
                                                            'mr-2 h-4 w-4',
                                                            !filters.agent ? 'opacity-100' : 'opacity-0',
                                                        )}
                                                    />
                                                    All agents
                                                </CommandItem>
                                                {agents.map((agent) => (
                                                    <CommandItem
                                                        key={agent.id}
                                                        value={agent.name}
                                                        onSelect={() => {
                                                            setFilters((prev) => ({ ...prev, agent: agent.name }));
                                                            setAgentOpen(false);
                                                        }}
                                                    >
                                                        <Check
                                                            className={cn(
                                                                'mr-2 h-4 w-4',
                                                                filters.agent === agent.name ? 'opacity-100' : 'opacity-0',
                                                            )}
                                                        />
                                                        {agent.name}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                            <p className="text-xs text-muted-foreground">Filter by the agent assigned to the orders.</p>
                        </div>

                        <div className="flex flex-col space-y-2">
                            <label className="text-sm font-medium">Delivery Date Range</label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className={cn(
                                            'w-full justify-start text-left font-normal',
                                            !dateRange?.from && 'text-muted-foreground',
                                        )}
                                    >
                                        {dateRange?.from ? (
                                            dateRange.to ? (
                                                <>
                                                    {format(dateRange.from, "yyyy-MM-dd")} –{' '}
                                                    {format(dateRange.to, "yyyy-MM-dd")}
                                                </>
                                            ) : (
                                                format(dateRange.from, "yyyy-MM-dd")
                                            )
                                        ) : (
                                            'Select date range'
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent
                                    className="w-[calc(100vw-3rem)] border bg-popover p-0 shadow-lg sm:w-auto"
                                    side="bottom"
                                    align="start"
                                >
                                    <Calendar
                                        mode="range"
                                        numberOfMonths={isMobile ? 1 : 2}
                                        selected={dateRange}
                                        onSelect={setDateRange}
                                    />
                                </PopoverContent>
                            </Popover>
                            <p className="text-xs text-muted-foreground">Filter orders by their scheduled delivery date.</p>
                        </div>
                    </div>

                    <div className="mt-6 flex justify-end gap-2">
                        <Button variant="outline" onClick={clearAllFilters} disabled={isApplyingFilters}>
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

            <Dialog open={historyOrderNo !== null} onOpenChange={(open) => !open && setHistoryOrderNo(null)}>
                <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Edit History for Order #{historyOrderNo}</DialogTitle>
                    </DialogHeader>

                    {historyLoading ? (
                        <div className="flex h-48 items-center justify-center">
                            <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : selectedHistories.length > 0 ? (
                        <div className="scrollbar-custom max-h-[55vh] space-y-3 overflow-y-auto pr-2">
                            {selectedHistories.map((history) => (
                                <div key={history.id} className="rounded-lg border p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-semibold">
                                            {attributeLabels[history.attribute] ?? history.attribute}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground">
                                            {new Date(history.created_at).toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-muted-foreground line-through">
                                            {history.old_value || '(empty)'}
                                        </span>
                                        <X className="h-3 w-3 text-muted-foreground" />
                                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-1 font-medium text-emerald-700">
                                            {history.new_value || '(empty)'}
                                        </span>
                                    </div>
                                    <p className="mt-2 text-[10px] text-muted-foreground">
                                        By {history.user?.name ?? 'System'} on {new Date(history.created_at).toLocaleDateString()}{' '}
                                        at {new Date(history.created_at).toLocaleTimeString()}
                                    </p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                            <History className="h-8 w-8 text-muted-foreground/50" />
                            <span className="text-sm">No edit history for this order.</span>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
