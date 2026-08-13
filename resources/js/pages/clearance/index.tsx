"use client";

import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
import { Check, ChevronsUpDown, FilterIcon, LoaderCircle, RefreshCwIcon, SearchX, X } from 'lucide-react';
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

const COLUMNS: { key: keyof ClearanceOrder; label: string; align?: 'right' }[] = [
    { key: 'order_no', label: 'Order No' },
    { key: 'client_name', label: 'Client' },
    { key: 'product_name', label: 'Product' },
    { key: 'amount', label: 'Amount', align: 'right' },
    { key: 'quantity', label: 'Qty', align: 'right' },
    { key: 'status', label: 'Status' },
    { key: 'delivery_date', label: 'Delivery Date' },
    { key: 'agent', label: 'Agent' },
    { key: 'phone', label: 'Phone' },
    { key: 'address', label: 'Address' },
];

const currency = new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 2,
});

export default function Index() {
    const isMobile = useIsMobile();
    const { props } = usePage();
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
    const [isApplyingFilters, setIsApplyingFilters] = React.useState(false);

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
        return String(order[col.key] ?? "");
    };

    return (
        <AppLayout breadcrumbs={BREADCRUMBS}>
            <Head title="Clearance" />

            <div className="space-y-4 px-4 pt-4">
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

                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className="rounded-lg border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Total Orders</p>
                            <p className="text-lg font-semibold">{orders.data.length}</p>
                        </div>
                        <div className="rounded-lg border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Total Amount</p>
                            <p className="text-lg font-semibold">{currency.format(totalAmount)}</p>
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

            <div className="mt-4 border rounded-xl shadow-sm">
                <div className="scrollbar-custom w-full overflow-x-auto">
                    <Table className="min-w-[1120px] border">
                        <TableHeader className="bg-muted/50">
                            <TableRow>
                                {COLUMNS.map((col) => (
                                    <TableHead
                                        key={col.key}
                                        className={cn(
                                            'min-w-[120px] whitespace-nowrap border text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                                            col.align === 'right' && 'text-right',
                                        )}
                                    >
                                        {col.label}
                                    </TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {orders.data.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={COLUMNS.length} className="h-40 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center gap-2">
                                            <SearchX className="h-8 w-8 text-muted-foreground/50" />
                                            <span>No clearance orders found.</span>
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
                                    <TableRow key={order.id} className="hover:bg-muted/50">
                                        {COLUMNS.map((col) => (
                                            <TableCell
                                                key={col.key}
                                                className={cn(
                                                    'max-w-[180px] truncate whitespace-nowrap border',
                                                    col.align === 'right' && 'text-right',
                                                )}
                                            >
                                                {renderCellValue(order, col)}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            <div className="mt-4 flex justify-center pb-4">
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
        </AppLayout>
    );
}
