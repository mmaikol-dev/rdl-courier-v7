"use client";

import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ControlStrip, DashboardHeader, Footnote, Panel } from '@/components/api-dashboard/blueprint';
import { NumberRoll } from '@/components/number-roll';
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
import { ArrowLeft, ArrowRight, Camera, Check, ChevronsUpDown, ClipboardCheck, Clock3, FilterIcon, History, ListChecks, LoaderCircle, Pin, RefreshCwIcon, ScanLine, SearchX, Store, Users, Wallet, X, XCircle } from 'lucide-react';
import * as React from 'react';
import { format } from 'date-fns';
import { type DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from '@/lib/toast';

const statusColors: Record<string, string> = {
    Delivered: "bg-success/10 text-success border-success/30",
    Pending: "bg-warning/10 text-warning-foreground border-warning/30",
    Scheduled: "bg-accent text-foreground border-border",
    Dispatched: "bg-accent text-foreground border-border",
    Cancelled: "bg-destructive/10 text-destructive border-destructive/30",
    Followup: "bg-accent text-foreground border-border",
    WrongContact: "bg-muted text-foreground border-border",
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
    agent_id: number | null;
    clearance_status: string;
    clearance_note: string | null;
    updated_at: string;
}

interface ClearanceDraft {
    code: string;
    clearance_note: string;
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
    clearance_note: 'Clearance Note',
    code: 'Code',
    status: 'Status',
    amount: 'Amount',
    quantity: 'Quantity',
    delivery_date: 'Delivery Date',
    cc_email: 'CC Email',
    merchant: 'Merchant',
    product_name: 'Product',
    order_no: 'Order No',
};

const STATUS_OPTIONS = [
    'New Orders',
    'Pending',
    'Scheduled',
    'Dispatched',
    'Delivered',
    'Cancelled',
    'Followup',
    'WrongContact',
];

const statusOptionsFor = (status?: string | null) => {
    const current = status?.trim() || 'New Orders';
    return STATUS_OPTIONS.includes(current) ? STATUS_OPTIONS : [current, ...STATUS_OPTIONS];
};

const COLUMNS: { key: keyof ClearanceOrder; label: string; align?: 'right' }[] = [
    { key: 'order_no', label: 'Order No' },
    { key: 'code', label: 'Code' },
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

function EditableCodeCell({ order }: { order: ClearanceOrder }) {
    const [value, setValue] = React.useState(order.code ?? '');
    const [saving, setSaving] = React.useState(false);
    const skipBlurRef = React.useRef(false);

    React.useEffect(() => {
        setValue(order.code ?? '');
    }, [order.code]);

    const save = () => {
        if (skipBlurRef.current) {
            skipBlurRef.current = false;
            return;
        }

        const nextValue = value.trim();
        if (nextValue === (order.code ?? '')) {
            return;
        }

        setSaving(true);
        router.put(`/sheetorders/${order.id}`, { code: nextValue }, {
            preserveState: true,
            preserveScroll: true,
            only: ['orders'],
            onSuccess: () => toast.success('Code updated'),
            onError: () => {
                toast.error('Failed to update code');
                setValue(order.code ?? '');
            },
            onFinish: () => setSaving(false),
        });
    };

    return (
        <div className="flex items-center gap-1.5">
            <Input
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onBlur={save}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        event.currentTarget.blur();
                    } else if (event.key === 'Escape') {
                        skipBlurRef.current = true;
                        setValue(order.code ?? '');
                        event.currentTarget.blur();
                    }
                }}
                disabled={saving}
                placeholder="Enter code"
                aria-label={`Code for order ${order.order_no}`}
                className="h-8 w-32 text-xs"
            />
            {saving && <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
        </div>
    );
}

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
    const [wizardOpen, setWizardOpen] = React.useState(false);
    const [wizardStep, setWizardStep] = React.useState<1 | 2 | 3>(1);
    const [wizardLoading, setWizardLoading] = React.useState(false);
    const [isSubmittingBatch, setIsSubmittingBatch] = React.useState(false);
    const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set());
    const [scannedInIds, setScannedInIds] = React.useState<Set<number>>(new Set());
    const [updatingStatusId, setUpdatingStatusId] = React.useState<number | null>(null);
    const [scannerOpen, setScannerOpen] = React.useState(false);
    const [scannerReady, setScannerReady] = React.useState(false);
    const [scannerError, setScannerError] = React.useState(false);
    const [lastScan, setLastScan] = React.useState<string | null>(null);
    const [drafts, setDrafts] = React.useState<Record<number, ClearanceDraft>>({});

    const scannerRef = React.useRef<{ stop: () => Promise<void> } | null>(null);
    const scanInFlightRef = React.useRef(false);
    const scannedOrderNosRef = React.useRef<Set<string>>(new Set());
    const ordersRef = React.useRef(orders.data);
    const agentsRef = React.useRef(agents);

    React.useEffect(() => {
        ordersRef.current = orders.data;
    }, [orders.data]);

    React.useEffect(() => {
        agentsRef.current = agents;
    }, [agents]);

    const formatDate = (date: Date) => format(date, "yyyy-MM-dd");

    const hasActiveFilters = Boolean(filters.agent || filters.from_date || filters.to_date);
    const selectedOrders = orders.data.filter((order) => selectedIds.has(order.id));
    const selectedAmount = selectedOrders.reduce((sum, order) => sum + Number(order.amount ?? 0), 0);
    const isReturnedOrder = (order: ClearanceOrder) =>
        scannedInIds.has(order.id) || order.status?.trim().toLowerCase() === 'returned';

    const openWizard = () => {
        setWizardStep(1);
        setSelectedIds(new Set());
        setScannedInIds(new Set());
        setDrafts({});
        setLastScan(null);
        scannedOrderNosRef.current = new Set();
        setWizardOpen(true);
    };

    const loadWizardOrders = () => {
        setWizardLoading(true);
        router.get('/clearance', {
            agent: filters.agent ?? undefined,
            from_date: dateRange?.from ? formatDate(dateRange.from) : undefined,
            to_date: dateRange?.to ? formatDate(dateRange.to) : undefined,
        }, {
            preserveState: true,
            preserveScroll: true,
            onSuccess: (page) => {
                const nextOrders = (page.props as unknown as { orders: { data: ClearanceOrder[] } }).orders.data;
                setDrafts(Object.fromEntries(nextOrders.map((order) => [
                    order.id,
                    { code: order.code ?? '', clearance_note: order.clearance_note ?? '' },
                ])));
                setSelectedIds(new Set(
                    nextOrders
                        .filter((order) => order.clearance_status !== 'cleared')
                        .map((order) => order.id),
                ));
                setScannedInIds(new Set());
                setLastScan(null);
                scannedOrderNosRef.current = new Set();
                setWizardStep(2);
            },
            onError: () => toast.error('Failed to load clearance orders'),
            onFinish: () => setWizardLoading(false),
        });
    };

    const toggleSelected = (orderId: number) => {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(orderId)) next.delete(orderId);
            else next.add(orderId);
            return next;
        });
    };

    const toggleAllSelected = () => {
        if (selectedIds.size === orders.data.length) {
            setSelectedIds(new Set());
            return;
        }

        setSelectedIds(new Set(orders.data.map((order) => order.id)));
    };

    const updateDraft = (orderId: number, field: keyof ClearanceDraft, value: string) => {
        setDrafts((current) => ({
            ...current,
            [orderId]: {
                code: current[orderId]?.code ?? '',
                clearance_note: current[orderId]?.clearance_note ?? '',
                [field]: value,
            },
        }));
    };

    const updateOrderStatus = (order: ClearanceOrder, status: string) => {
        if ((order.status?.trim() || 'New Orders') === status) {
            return;
        }

        setUpdatingStatusId(order.id);
        router.put(`/sheetorders/${order.id}`, { status }, {
            preserveScroll: true,
            preserveState: true,
            only: ['orders'],
            onSuccess: () => toast.success(`${order.order_no} status updated to ${status}`),
            onError: () => toast.error('Failed to update order status'),
            onFinish: () => setUpdatingStatusId(null),
        });
    };

    const markReturnedWithoutScan = (order: ClearanceOrder) => {
        if (isReturnedOrder(order) || updatingStatusId === order.id) return;

        setUpdatingStatusId(order.id);
        router.post(`/clearance/${order.id}/return`, {}, {
            preserveScroll: true,
            preserveState: true,
            only: ['orders'],
            onSuccess: () => {
                setSelectedIds((current) => new Set(current).add(order.id));
            },
            onError: () => toast.error(`Failed to mark ${order.order_no} returned`),
            onFinish: () => setUpdatingStatusId(null),
        });
    };

    const handleDecodedScan = React.useCallback((decodedText: string) => {
        if (scanInFlightRef.current) {
            return;
        }

        const orderNo = decodedText.split('|')[0]?.trim() || decodedText.trim();
        if (!orderNo) {
            return;
        }

        const order = ordersRef.current.find((item) => item.order_no === orderNo);
        if (!order) {
            toast.warning(`${orderNo} is not in this batch.`);
            return;
        }

        if (scannedOrderNosRef.current.has(orderNo) || order.status?.trim().toLowerCase() === 'returned') {
            return;
        }

        const agentId = order.agent_id ?? agentsRef.current.find((agent) => agent.name === order.agent)?.id;
        if (!agentId) {
            toast.error(`${orderNo} has no assigned agent to scan it in.`);
            return;
        }

        scanInFlightRef.current = true;
        scannedOrderNosRef.current.add(orderNo);
        router.post('/agent-order-scans', {
            order_no: orderNo,
            agent_id: agentId,
            scan_type: 'in',
        }, {
            preserveScroll: true,
            preserveState: true,
            only: ['orders'],
            onSuccess: () => {
                setScannedInIds((current) => new Set(current).add(order.id));
                setSelectedIds((current) => new Set(current).add(order.id));
                setLastScan(orderNo);
                toast.success(`${orderNo} marked returned`);
                setTimeout(() => setLastScan(null), 2500);
            },
            onError: (errors) => {
                scannedOrderNosRef.current.delete(orderNo);
                const message = Object.values(errors).find((value) => typeof value === 'string');
                toast.error(typeof message === 'string' ? message : 'Failed to scan in order');
            },
            onFinish: () => {
                scanInFlightRef.current = false;
            },
        });
    }, []);

    const startScanner = React.useCallback(async () => {
        if (scannerRef.current) {
            try { await scannerRef.current.stop(); } catch { /* scanner may already be stopped */ }
            scannerRef.current = null;
        }

        try {
            const { Html5Qrcode } = await import('html5-qrcode');
            const scanner = new Html5Qrcode('clearance-qr-scanner');
            scannerRef.current = scanner;
            await scanner.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 220, height: 220 } },
                (decodedText: string) => handleDecodedScan(decodedText),
                () => {},
            );
            setScannerReady(true);
            setScannerError(false);
        } catch {
            setScannerError(true);
            setScannerReady(false);
            toast.error('Camera unavailable. Allow camera access and try again.');
        }
    }, [handleDecodedScan]);

    const openScanner = React.useCallback(() => {
        setScannerOpen(true);
        setTimeout(() => { void startScanner(); }, 80);
    }, [startScanner]);

    const closeScanner = React.useCallback(() => {
        if (scannerRef.current) {
            try { void scannerRef.current.stop(); } catch { /* scanner may already be stopped */ }
            scannerRef.current = null;
        }
        setScannerOpen(false);
        setScannerReady(false);
        setScannerError(false);
    }, []);

    React.useEffect(() => {
        if (!wizardOpen || wizardStep !== 2) {
            closeScanner();
        }
    }, [wizardOpen, wizardStep, closeScanner]);

    React.useEffect(() => () => {
        if (scannerRef.current) {
            try { void scannerRef.current.stop(); } catch { /* scanner may already be stopped */ }
            scannerRef.current = null;
        }
    }, []);

    const submitBatch = () => {
        if (selectedOrders.length === 0) {
            toast.error('Select at least one order.');
            return;
        }

        setIsSubmittingBatch(true);
        router.post('/clearance/batch', {
            orders: selectedOrders.map((order) => ({
                id: order.id,
                code: drafts[order.id]?.code ?? order.code ?? '',
                clearance_note: drafts[order.id]?.clearance_note ?? order.clearance_note ?? '',
                clearance_status: 'cleared',
            })),
        }, {
            preserveScroll: true,
            onSuccess: () => {
                toast.success(`${selectedOrders.length} order${selectedOrders.length === 1 ? '' : 's'} processed`);
                setWizardOpen(false);
                setWizardStep(1);
                setSelectedIds(new Set());
                setScannedInIds(new Set());
                setDrafts({});
                setLastScan(null);
                scannedOrderNosRef.current = new Set();
            },
            onError: () => toast.error('Failed to process the clearance batch'),
            onFinish: () => setIsSubmittingBatch(false),
        });
    };

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
        } catch {
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
        return statusColors[normalized] || "bg-muted text-foreground border-border";
    };

    const renderCellValue = (order: ClearanceOrder, col: { key: keyof ClearanceOrder; label: string; align?: 'right' }) => {
        if (col.key === 'code') {
            return <EditableCodeCell order={order} />;
        }
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
                    className={cn('gap-2', cleared && 'bg-success hover:bg-success')}
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
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                    <DashboardHeader
                        title="Clearance"
                        summary="Orders assigned to agents, excluding remitted ones. Run the guided workflow to review, annotate, and clear orders in batches."
                    />
                    <div className="flex flex-wrap gap-2">
                        <Button className="h-9 gap-2" onClick={openWizard}>
                            <ListChecks className="h-4 w-4" />
                            Start clearance
                        </Button>
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

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <Panel className="flex items-center gap-3 p-4">
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><ClipboardCheck className="size-4" /></span>
                        <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">Total Orders</p>
                            <p className="font-mono text-lg font-semibold"><NumberRoll value={orders.data.length} /></p>
                        </div>
                    </Panel>
                    <Panel className="flex items-center gap-3 p-4">
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Wallet className="size-4" /></span>
                        <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">Total Amount</p>
                            <p className="font-mono text-lg font-semibold"><NumberRoll value={totalAmount} format={{ style: 'currency', currency: currencyCode }} /></p>
                        </div>
                    </Panel>
                    <Panel className="flex items-center gap-3 p-4">
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-success/10 text-success"><Check className="size-4" /></span>
                        <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">Cleared</p>
                            <p className="font-mono text-lg font-semibold text-success"><NumberRoll value={clearedCount} /></p>
                        </div>
                    </Panel>
                    <Panel className="flex items-center gap-3 p-4">
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-warning/10 text-warning-foreground"><Clock3 className="size-4" /></span>
                        <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">Pending Clearance</p>
                            <p className="font-mono text-lg font-semibold text-warning-foreground"><NumberRoll value={pendingClearanceCount} /></p>
                        </div>
                    </Panel>
                    <Panel className="flex items-center gap-3 p-4">
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Users className="size-4" /></span>
                        <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">Agents</p>
                            <p className="font-mono text-lg font-semibold"><NumberRoll value={agentCount} /></p>
                        </div>
                    </Panel>
                    <Panel className="flex items-center gap-3 p-4">
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Store className="size-4" /></span>
                        <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">Merchants</p>
                            <p className="font-mono text-lg font-semibold"><NumberRoll value={merchantCount} /></p>
                        </div>
                    </Panel>
                </div>

                {hasActiveFilters && (
                    <div className="flex flex-wrap items-center gap-2">
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

            <Panel className="overflow-hidden">
                <ControlStrip label="Clearance orders">
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                            {orders.data.length} order{orders.data.length === 1 ? '' : 's'}
                        </span>
                        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={openWizard}>
                            <ListChecks className="size-3.5" />
                            Workflow
                        </Button>
                    </div>
                </ControlStrip>
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
                <Footnote>
                    Clearance updates are recorded in order history. Returned orders can be scanned in from the guided workflow before the batch is applied.
                </Footnote>
            </Panel>

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
                                        <span className="inline-flex items-center gap-1 rounded-md bg-success/10 px-2 py-1 font-medium text-success">
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

            <Dialog open={scannerOpen} onOpenChange={(open) => { if (!open) closeScanner(); }}>
                <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
                    <DialogHeader>
                        <DialogTitle>Scan returned orders</DialogTitle>
                        <DialogDescription>
                            Point the camera at each order's waybill QR code. Every scanned order is marked returned automatically.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="relative aspect-square overflow-hidden rounded-xl bg-foreground">
                        <div id="clearance-qr-scanner" className="size-full" />
                        {scannerError && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background p-5 text-center">
                                <XCircle className="size-10 text-destructive" />
                                <p className="text-sm">Camera unavailable. Check browser camera permission.</p>
                                <Button variant="outline" onClick={() => void startScanner()}>Retry</Button>
                            </div>
                        )}
                        {!scannerReady && !scannerError && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-foreground">
                                <LoaderCircle className="size-8 animate-spin text-background" />
                                <p className="text-sm text-background">Starting camera...</p>
                            </div>
                        )}
                        {scannerReady && (
                            <Badge className="absolute left-3 top-3 bg-success text-success-foreground">IN · RETURNED</Badge>
                        )}
                        {lastScan && (
                            <div className="absolute inset-x-3 bottom-3 rounded-lg bg-background px-3 py-2 text-center text-sm font-semibold text-foreground">
                                <Check className="mr-2 inline size-4 text-success" />
                                {lastScan}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground">
                            {scannedInIds.size} order{scannedInIds.size === 1 ? '' : 's'} scanned in this session
                        </p>
                        <Button variant="outline" onClick={closeScanner}>Done</Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Sheet open={wizardOpen} onOpenChange={setWizardOpen}>
                <SheetContent side="right" className="w-full gap-0 overflow-hidden p-0 sm:max-w-5xl">
                    <SheetHeader className="border-b p-5 pr-14 text-left">
                        <SheetTitle>Clearance workflow</SheetTitle>
                        <SheetDescription>
                            Work through the queue in steps. Pick the scope, review each order, type the notes you want, and apply the batch at the end.
                        </SheetDescription>
                    </SheetHeader>

                    <div className="flex items-center gap-2 overflow-x-auto border-b px-5 py-3">
                        {[
                            { step: 1, label: 'Scope' },
                            { step: 2, label: 'Review' },
                            { step: 3, label: 'Apply' },
                        ].map((item, index) => (
                            <React.Fragment key={item.step}>
                                {index > 0 && <span className="h-px min-w-6 flex-1 bg-border" aria-hidden="true" />}
                                <div className={cn(
                                    'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium',
                                    wizardStep === item.step && 'border-foreground bg-foreground text-background',
                                    wizardStep > item.step && 'border-success/30 bg-success/10 text-success',
                                    wizardStep < item.step && 'border-border bg-background text-muted-foreground',
                                )}>
                                    <span className="grid size-5 place-items-center rounded-full border border-current text-[10px]">
                                        {wizardStep > item.step ? <Check className="size-3" /> : item.step}
                                    </span>
                                    {item.label}
                                </div>
                            </React.Fragment>
                        ))}
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-5">
                        {wizardStep === 1 && (
                            <div className="space-y-4">
                                <Panel className="p-5">
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Agent</label>
                                            <Select
                                                value={filters.agent ?? '__all__'}
                                                onValueChange={(value) => setFilters((prev) => ({ ...prev, agent: value === '__all__' ? undefined : value }))}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="All agents" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="__all__">All agents</SelectItem>
                                                    {agents.map((agent) => (
                                                        <SelectItem key={agent.id} value={agent.name}>{agent.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <p className="text-xs text-muted-foreground">Leave on all agents to review the full queue.</p>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Delivery date range</label>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        variant="outline"
                                                        className={cn('w-full justify-start text-left font-normal', !dateRange?.from && 'text-muted-foreground')}
                                                    >
                                                        {dateRange?.from ? (
                                                            dateRange.to ? (
                                                                <>{format(dateRange.from, 'yyyy-MM-dd')} – {format(dateRange.to, 'yyyy-MM-dd')}</>
                                                            ) : (
                                                                format(dateRange.from, 'yyyy-MM-dd')
                                                            )
                                                        ) : (
                                                            'Select date range'
                                                        )}
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-[calc(100vw-3rem)] border bg-popover p-0 shadow-lg sm:w-auto" side="bottom" align="start">
                                                    <Calendar
                                                        mode="range"
                                                        numberOfMonths={isMobile ? 1 : 2}
                                                        selected={dateRange}
                                                        onSelect={setDateRange}
                                                    />
                                                </PopoverContent>
                                            </Popover>
                                            <p className="text-xs text-muted-foreground">Only orders with a delivery date inside this range are loaded.</p>
                                        </div>
                                    </div>
                                </Panel>

                                <Panel className="flex items-center justify-between gap-3 p-4">
                                    <div>
                                        <p className="text-sm font-medium">Current queue</p>
                                        <p className="text-xs text-muted-foreground">The current page has {orders.data.length} order{orders.data.length === 1 ? '' : 's'} ready to review.</p>
                                    </div>
                                    <span className="font-mono text-xl font-semibold"><NumberRoll value={orders.data.length} /></span>
                                </Panel>
                            </div>
                        )}

                        {wizardStep === 2 && (
                            <Panel className="overflow-hidden">
                                <ControlStrip label="Review orders">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                                            {selectedOrders.length} of {orders.data.length} selected
                                        </span>
                                        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={openScanner}>
                                            <Camera className="size-3.5" />
                                            Scan returned
                                        </Button>
                                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={toggleAllSelected}>
                                            {selectedIds.size === orders.data.length ? 'Clear selection' : 'Select all'}
                                        </Button>
                                    </div>
                                </ControlStrip>
                                <div className="scrollbar-custom w-full overflow-x-auto">
                                            <Table className="min-w-[1080px]">
                                        <TableHeader className="bg-muted/60">
                                            <TableRow className="hover:bg-muted/60">
                                                <TableHead className="h-10 w-10 px-3">
                                                    <Checkbox
                                                        checked={selectedIds.size === 0 ? false : selectedIds.size === orders.data.length ? true : 'indeterminate'}
                                                        onCheckedChange={toggleAllSelected}
                                                        aria-label="Select all orders"
                                                    />
                                                </TableHead>
                                                <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Order</TableHead>
                                                <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client</TableHead>
                                                <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agent</TableHead>
                                                <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</TableHead>
                                                <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Return without QR</TableHead>
                                                <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Code</TableHead>
                                                <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Note / outcome</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {orders.data.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={8} className="h-40 text-center text-muted-foreground">
                                                        No orders match this scope. Go back and change the filters.
                                                    </TableCell>
                                                </TableRow>
                                            ) : orders.data.map((order) => (
                                                <TableRow key={order.id} className={cn(!selectedIds.has(order.id) && 'opacity-60')}>
                                                    <TableCell className="px-3 py-2">
                                                        <Checkbox
                                                            checked={selectedIds.has(order.id)}
                                                            onCheckedChange={() => toggleSelected(order.id)}
                                                            aria-label={`Select order ${order.order_no}`}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="px-3 py-2 text-sm font-medium">{order.order_no}</TableCell>
                                                    <TableCell className="max-w-[150px] truncate px-3 py-2 text-sm">{order.client_name}</TableCell>
                                                    <TableCell className="px-3 py-2 text-sm">{order.agent}</TableCell>
                                                    <TableCell className="px-3 py-2">
                                                        <Select
                                                            value={order.status?.trim() || 'New Orders'}
                                                            onValueChange={(value) => updateOrderStatus(order, value)}
                                                            disabled={updatingStatusId === order.id}
                                                        >
                                                            <SelectTrigger className={cn('h-8 w-[140px] text-xs', getStatusPillClass(order.status))}>
                                                                {updatingStatusId === order.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <SelectValue />}
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {statusOptionsFor(order.status).map((status) => (
                                                                    <SelectItem key={status} value={status} className="text-xs">
                                                                        {status}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </TableCell>
                                                    <TableCell className="px-3 py-2">
                                                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                                            <Switch
                                                                checked={isReturnedOrder(order)}
                                                                onCheckedChange={(checked) => checked && markReturnedWithoutScan(order)}
                                                                disabled={isReturnedOrder(order) || updatingStatusId === order.id}
                                                                aria-label={`Mark ${order.order_no} returned without QR scan`}
                                                                className="scale-75"
                                                            />
                                                            {isReturnedOrder(order) ? 'Returned' : 'Mark returned'}
                                                        </label>
                                                    </TableCell>
                                                    <TableCell className="px-3 py-2">
                                                        <Input
                                                            value={drafts[order.id]?.code ?? order.code ?? ''}
                                                            onChange={(event) => updateDraft(order.id, 'code', event.target.value)}
                                                            placeholder="Code"
                                                            className="h-8 w-32 text-xs"
                                                            aria-label={`Code for order ${order.order_no}`}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="px-3 py-2">
                                                        <Input
                                                            value={drafts[order.id]?.clearance_note ?? order.clearance_note ?? ''}
                                                            onChange={(event) => updateDraft(order.id, 'clearance_note', event.target.value)}
                                                            placeholder="Type what you want…"
                                                            className="h-8 w-56 text-xs"
                                                            aria-label={`Clearance note for order ${order.order_no}`}
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                                <Footnote>
                                    Use Scan returned for QR codes or switch Return without QR on a row when a code cannot be scanned. Apply clearance will clear every selected order, including returned ones.
                                </Footnote>
                            </Panel>
                        )}

                        {wizardStep === 3 && (
                            <div className="space-y-4">
                                <div className="grid gap-3 sm:grid-cols-3">
                                    <Panel className="flex items-center gap-3 p-4">
                                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><ClipboardCheck className="size-4" /></span>
                                        <div>
                                            <p className="text-xs text-muted-foreground">Selected orders</p>
                                            <p className="font-mono text-lg font-semibold"><NumberRoll value={selectedOrders.length} /></p>
                                        </div>
                                    </Panel>
                                    <Panel className="flex items-center gap-3 p-4">
                                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Wallet className="size-4" /></span>
                                        <div>
                                            <p className="text-xs text-muted-foreground">Selected amount</p>
                                            <p className="font-mono text-lg font-semibold"><NumberRoll value={selectedAmount} format={{ style: 'currency', currency: currencyCode }} /></p>
                                        </div>
                                    </Panel>
                                    <Panel className="flex items-center gap-3 p-4">
                                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-success/10 text-success"><ScanLine className="size-4" /></span>
                                        <div>
                                            <p className="text-xs text-muted-foreground">Marked returned</p>
                                            <p className="font-mono text-lg font-semibold"><NumberRoll value={selectedOrders.filter((order) => isReturnedOrder(order)).length} /></p>
                                        </div>
                                    </Panel>
                                </div>

                                <Panel className="overflow-hidden">
                                    <ControlStrip label="Batch preview">
                                        <span className="font-mono text-xs text-muted-foreground">{selectedOrders.length} orders</span>
                                    </ControlStrip>
                                    <div className="scrollbar-custom max-h-80 space-y-2 overflow-y-auto p-3">
                                        {selectedOrders.map((order) => (
                                            <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-xs">
                                                <div className="min-w-0">
                                                    <p className="font-medium">{order.order_no} · {order.client_name}</p>
                                                    <p className="mt-0.5 text-muted-foreground">{order.agent} · {currency.format(Number(order.amount ?? 0))}</p>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {drafts[order.id]?.code ? <Badge variant="outline">Code: {drafts[order.id].code}</Badge> : null}
                                                    {drafts[order.id]?.clearance_note ? <Badge variant="secondary" className="max-w-64 truncate">Note: {drafts[order.id].clearance_note}</Badge> : null}
                                                    <Badge variant={isReturnedOrder(order) ? 'outline' : 'default'} className={cn(!isReturnedOrder(order) && 'bg-success text-success-foreground')}>
                                                        {isReturnedOrder(order) ? 'Returned · will be cleared' : 'Will be cleared'}
                                                    </Badge>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <Footnote>
                                        Every selected order will be marked cleared, including returned orders. Code and note changes are saved to order history.
                                    </Footnote>
                                </Panel>
                            </div>
                        )}
                    </div>

                    <SheetFooter className="border-t p-5 sm:flex-row sm:items-center sm:justify-between">
                        {wizardStep === 1 && (
                            <>
                                <Button variant="outline" onClick={() => setWizardOpen(false)}>Cancel</Button>
                                <Button onClick={loadWizardOrders} disabled={wizardLoading}>
                                    {wizardLoading ? <LoaderCircle className="size-4 animate-spin" /> : null}
                                    Load orders
                                    <ArrowRight className="size-4" />
                                </Button>
                            </>
                        )}
                        {wizardStep === 2 && (
                            <>
                                <Button variant="outline" onClick={() => setWizardStep(1)}>
                                    <ArrowLeft className="size-4" />
                                    Back
                                </Button>
                                <Button onClick={() => setWizardStep(3)} disabled={selectedOrders.length === 0}>
                                    Review {selectedOrders.length}
                                    <ArrowRight className="size-4" />
                                </Button>
                            </>
                        )}
                        {wizardStep === 3 && (
                            <>
                                <Button variant="outline" onClick={() => setWizardStep(2)}>
                                    <ArrowLeft className="size-4" />
                                    Back
                                </Button>
                                <Button onClick={submitBatch} disabled={isSubmittingBatch || selectedOrders.length === 0}>
                                    {isSubmittingBatch ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}
                                    Apply clearance
                                </Button>
                            </>
                        )}
                    </SheetFooter>
                </SheetContent>
            </Sheet>
        </AppLayout>
    );
}
