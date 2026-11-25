import { Combobox, type ComboboxOption } from '@/components/combobox';
import { MultiSelect, type MultiOption } from '@/components/multi-select';
import { StatsBand } from '@/components/stats-band';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { csrfHeaders } from '@/lib/csrf';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { Deferred, Head, router, usePage } from '@inertiajs/react';
import { Loader2, Sparkles, X } from 'lucide-react';
import * as React from 'react';

interface ProductOption {
    id: number;
    name: string;
    code: string | null;
    merchant: string | null;
    country: string | null;
}

interface OrderRow {
    id: number;
    order_no: string | null;
    delivery_date: string | null;
    client_name: string | null;
    phone: string | null;
    address: string | null;
    product_name: string | null;
    quantity: number | null;
    amount: number | string | null;
    status: string | null;
    inventory_product_id: number | null;
    inventory_deducted_at: string | null;
    agent_id: number | null;
    merchant: string | null;
    country: string | null;
    linked_product: { id: number; name: string; code: string | null } | null;
    assigned_agent: { id: number; name: string } | null;
}

interface AgentOption {
    id: number;
    name: string;
}

interface PaginatedOrders {
    data: OrderRow[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

type OrderMatchUpdate = Pick<OrderRow, 'id' | 'inventory_product_id' | 'linked_product' | 'assigned_agent' | 'inventory_deducted_at' | 'status'>;

interface DeductionResult {
    order_id?: number;
    order_no?: string | null;
    status: 'deducted' | 'already_deducted' | 'not_delivered' | 'missing_product' | 'failed';
    message: string | null;
    warehouse_deducted: boolean;
    agent_transfer_deducted: boolean;
    whatsapp_notification: 'attempted' | 'already_processed' | 'not_applicable' | 'not_sent';
}

interface MatchResponse {
    message?: string;
    errors?: Record<string, string[]>;
    order?: OrderMatchUpdate;
    deduction?: DeductionResult;
}

interface SkippedOrder {
    id: number;
    order_no: string | null;
    reason: 'already_matched' | 'already_deducted';
}

interface BulkMatchResponse extends Omit<MatchResponse, 'order'> {
    orders?: OrderMatchUpdate[];
    deductions?: DeductionResult[];
    skipped?: SkippedOrder[];
}

const statusColors: Record<string, string> = {
    Scheduled: 'bg-status-scheduled text-status-scheduled-foreground border-status-scheduled/40',
    Dispatched: 'bg-status-dispatched text-status-dispatched-foreground border-status-dispatched',
    Followup: 'bg-status-followup text-status-followup-foreground border-status-followup/40',
    Duplicate: 'bg-accent text-foreground border-border',
    Cancelled: 'bg-destructive/10 text-destructive border-destructive/30',
    Pending: 'bg-warning/10 text-warning-foreground border-warning/30',
    OutofStock: 'bg-warning/10 text-warning-foreground border-warning/30',
    Expired: 'bg-warning/10 text-warning-foreground border-warning/30',
    Returned: 'bg-destructive/10 text-destructive border-destructive/30',
    WrongContact: 'bg-muted text-foreground border-border italic',
    Delivered: 'bg-success/10 text-success border-success/30',
    'New Orders': 'bg-muted text-muted-foreground border-border',
};

function firstValidationError(errors?: Record<string, string[]>): string | undefined {
    return errors ? Object.values(errors).flat()[0] : undefined;
}

function canBulkMatchOrder(order: OrderRow): boolean {
    return order.inventory_product_id === null && !order.inventory_deducted_at;
}

function option(value: string, label: string, description?: string, keywords: string[] = []): ComboboxOption {
    return { value, label, description, keywords };
}

function FilterColumn({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
    return (
        <div className={cn('flex min-w-0 flex-col', className)}>
            <span className="px-3 pb-1.5 text-[13px] font-medium text-foreground">{label}</span>
            {children}
        </div>
    );
}

function productOption(product: ProductOption): ComboboxOption {
    const description = [product.code ? `#${product.code}` : null, product.merchant, product.country].filter(Boolean).join(' · ');
    return option(String(product.id), product.name, description || 'Inventory product', [product.code ?? '', product.merchant ?? '', product.country ?? ''].filter(Boolean));
}

function normalizeMatchText(value: string | null | undefined) {
    return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function suggestProducts(order: OrderRow, products: ProductOption[]) {
    const phrase = normalizeMatchText(order.product_name);
    const words = phrase.split(' ').filter(Boolean);
    if (!words.length) return [];

    return products
        .map((product) => {
            const haystack = normalizeMatchText(product.name);
            const hits = words.filter((word) => haystack.includes(word)).length;
            return { product, score: hits / words.length + (haystack.includes(phrase) ? 1 : 0) };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 2);
}

function OrdersTableSkeleton() {
    return (
        <div className="min-w-[1180px] p-3" role="status" aria-label="Loading orders" aria-live="polite">
            <div className="flex gap-3 border-b pb-3">
                {Array.from({ length: 13 }).map((_, column) => (
                    <Skeleton key={column} className={cn('h-4 flex-1', column === 0 && 'max-w-8')} />
                ))}
            </div>
            {Array.from({ length: 8 }).map((_, row) => (
                <div key={row} className="flex gap-3 border-b py-3 last:border-0">
                    {Array.from({ length: 13 }).map((__, column) => (
                        <Skeleton key={column} className={cn('h-4 flex-1', column === 0 && 'max-w-8')} />
                    ))}
                </div>
            ))}
        </div>
    );
}

export default function OrderProductMatching({
    orders,
    products,
    agents,
    merchants,
    orderProductNames,
    statuses,
    filters,
}: {
    orders?: PaginatedOrders;
    products: ProductOption[];
    agents: AgentOption[];
    merchants: string[];
    orderProductNames: string[];
    statuses: string[];
    filters: { product_names: string[]; merchant: string; status: string; agent_id: number | null; per_page: number };
}) {
    const { flash } = usePage().props as { flash?: { success?: string; error?: string } };
    const [productNames, setProductNames] = React.useState<string[]>(filters.product_names ?? []);
    const [merchant, setMerchant] = React.useState(filters.merchant ?? '');
    const [orderStatus, setOrderStatus] = React.useState(filters.status ?? '');
    const [agentId, setAgentId] = React.useState(filters.agent_id ? String(filters.agent_id) : '');
    const [selectedIds, setSelectedIds] = React.useState<number[]>([]);
    const [bulkProductId, setBulkProductId] = React.useState('');
    const [savingOrderId, setSavingOrderId] = React.useState<number | null>(null);
    const [bulkSaving, setBulkSaving] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(false);
    const [displayOrders, setDisplayOrders] = React.useState<OrderRow[]>(orders?.data ?? []);

    React.useEffect(() => {
        setProductNames(filters.product_names ?? []);
        setMerchant(filters.merchant ?? '');
        setOrderStatus(filters.status ?? '');
        setAgentId(filters.agent_id ? String(filters.agent_id) : '');
        setSelectedIds([]);
    }, [filters.product_names, filters.merchant, filters.status, filters.agent_id, orders?.current_page]);

    React.useEffect(() => {
        setDisplayOrders(orders?.data ?? []);
    }, [orders?.data]);

    React.useEffect(() => {
        if (flash?.success) toast.success(flash.success);
        if (flash?.error) toast.error(flash.error);
    }, [flash?.success, flash?.error]);

    const productOptions = React.useMemo(() => products.map(productOption), [products]);
    const agentOptions = React.useMemo(() => agents.map((agent) => option(String(agent.id), agent.name)), [agents]);
    const merchantOptions = React.useMemo(() => merchants.map((item) => option(item, item)), [merchants]);
    const statusOptions = React.useMemo(() => statuses.map((item) => option(item, item, undefined, [item.toLowerCase()])), [statuses]);
    const orderProductNameOptions = React.useMemo<MultiOption[]>(() => orderProductNames.map((item) => ({ value: item, label: item })), [orderProductNames]);

    const suggestionsByOrder = React.useMemo(() => {
        const suggestions = new Map<number, ReturnType<typeof suggestProducts>>();
        displayOrders.forEach((order) => {
            if (canBulkMatchOrder(order)) suggestions.set(order.id, suggestProducts(order, products));
        });
        return suggestions;
    }, [displayOrders, products]);

    const breadcrumbs = [
        { title: 'Orders', href: '/sheetorders' },
        { title: 'Order Product Matching', href: '/order-product-matching' },
    ];

    const navigate = (params: Record<string, string | number | string[] | undefined>) => {
        router.get('/order-product-matching', params, {
            preserveState: true,
            preserveScroll: true,
            onStart: () => setIsLoading(true),
            onFinish: () => setIsLoading(false),
        });
    };

    const applyFilters = (overrides: { product_names?: string[]; merchant?: string; status?: string; agent_id?: string } = {}) => {
        const nextProductNames = overrides.product_names ?? productNames;
        const nextMerchant = overrides.merchant ?? merchant;
        const nextStatus = overrides.status ?? orderStatus;
        const nextAgentId = overrides.agent_id ?? agentId;

        navigate({
            product_names: nextProductNames.length > 0 ? nextProductNames : undefined,
            merchant: nextMerchant || undefined,
            status: nextStatus || undefined,
            agent_id: nextAgentId || undefined,
            per_page: filters.per_page,
            page: 1,
        });
    };

    const toggleSelected = (orderId: number, checked: boolean) => {
        setBulkProductId('');
        setSelectedIds((previous) => (checked ? [...new Set([...previous, orderId])] : previous.filter((id) => id !== orderId)));
    };

    const pageOrderIds = displayOrders.map((order) => order.id);
    const matchablePageOrderIds = displayOrders.filter(canBulkMatchOrder).map((order) => order.id);
    const allPageSelected = matchablePageOrderIds.length > 0 && matchablePageOrderIds.every((id) => selectedIds.includes(id));
    const matchedOnPage = displayOrders.filter((order) => order.inventory_product_id !== null).length;
    const unmatchedOnPage = displayOrders.length - matchedOnPage;

    const togglePageSelection = (checked: boolean) => {
        setBulkProductId('');
        setSelectedIds((previous) => (checked ? [...new Set([...previous, ...matchablePageOrderIds])] : previous.filter((id) => !pageOrderIds.includes(id))));
    };

    const matchOne = async (order: OrderRow, inventoryProductId: string) => {
        const productId = inventoryProductId ? Number(inventoryProductId) : null;
        setSavingOrderId(order.id);

        try {
            const response = await fetch('/order-product-matching/match', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    ...csrfHeaders(),
                },
                body: JSON.stringify({ order_id: order.id, inventory_product_id: productId }),
            });
            const result = (await response.json().catch(() => ({}))) as MatchResponse;

            if (!response.ok) {
                throw new Error(result.message ?? firstValidationError(result.errors) ?? 'Could not update the product match.');
            }

            const product = products.find((item) => item.id === productId);
            const nextProductId = result.order?.inventory_product_id ?? productId;
            const nextLinkedProduct = result.order
                ? (result.order.linked_product ?? null)
                : product
                  ? { id: product.id, name: product.name, code: product.code }
                  : null;

            setDisplayOrders((current) =>
                current.map((row) =>
                    row.id === order.id ? { ...row, inventory_product_id: nextProductId, linked_product: nextLinkedProduct } : row,
                ),
            );
            if (result.deduction?.status === 'deducted') {
                toast.success(result.deduction.agent_transfer_deducted
                    ? 'Matched. Warehouse stock and the assigned agent’s transfer balance were deducted; the country WhatsApp message was triggered.'
                    : 'Matched. Warehouse stock was deducted and the country WhatsApp message was triggered.');
            } else if (result.deduction?.status === 'failed' || result.deduction?.status === 'missing_product') {
                toast.warning(`Product match saved, but stock was not deducted: ${result.deduction.message ?? 'Check this order and retry.'}`);
            } else {
                toast.success('Order product match saved.');
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Could not update the product match.');
        } finally {
            setSavingOrderId(null);
        }
    };

    const matchSelected = async () => {
        if (!selectedIds.length || !bulkProductId || bulkSaving) return;

        const ids = [...selectedIds];
        setBulkSaving(true);

        try {
            const response = await fetch('/order-product-matching/bulk', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    ...csrfHeaders(),
                },
                body: JSON.stringify({ order_ids: ids, inventory_product_id: Number(bulkProductId) }),
            });
            const result = (await response.json().catch(() => ({}))) as BulkMatchResponse;

            if (!response.ok) {
                throw new Error(result.message ?? firstValidationError(result.errors) ?? 'Could not match the selected orders.');
            }

            const matchedCount = result.orders?.length ?? 0;
            const skippedCount = result.skipped?.length ?? 0;
            const skippedNote = skippedCount > 0 ? ` ${skippedCount} already matched order(s) were skipped.` : '';
            const updates = new Map((result.orders ?? []).map((order) => [order.id, order]));
            setDisplayOrders((current) => current.map((order) => ({ ...order, ...(updates.get(order.id) ?? {}) })));
            setSelectedIds([]);
            setBulkProductId('');
            const deductions = result.deductions ?? [];
            const failed = deductions.filter((deduction) => deduction.status === 'failed' || deduction.status === 'missing_product');
            const deducted = deductions.filter((deduction) => deduction.status === 'deducted');
            if (failed.length > 0) {
                const failures = failed.map((deduction) => `${deduction.order_no ?? `#${deduction.order_id}`}: ${deduction.message ?? 'deduction failed'}`).join('; ');
                toast.warning(`${matchedCount} orders were matched. ${failed.length} delivered order(s) were not deducted: ${failures}${skippedNote}`);
            } else if (deducted.length > 0) {
                const agentCount = deducted.filter((deduction) => deduction.agent_transfer_deducted).length;
                toast.success(`${matchedCount} orders matched; ${deducted.length} delivered order(s) deducted from warehouse${agentCount ? ` and ${agentCount} assigned agent transfer balance(s)` : ''}. Country WhatsApp messages were triggered.${skippedNote}`);
            } else {
                toast.success(`${matchedCount} orders matched to the selected inventory product.${skippedNote}`);
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Could not match the selected orders.');
        } finally {
            setBulkSaving(false);
        }
    };

    const visitPage = (page: number) =>
        navigate({
            product_names: filters.product_names?.length ? filters.product_names : undefined,
            merchant: filters.merchant || undefined,
            status: filters.status || undefined,
            agent_id: filters.agent_id || undefined,
            per_page: filters.per_page,
            page,
        });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Order Product Matching" />
            <main className="space-y-4 p-4 sm:p-6">
                <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div className="flex flex-col gap-1">
                        <h1 className="text-xl font-semibold tracking-tight">Order Product Matching</h1>
                        <p className="text-sm text-muted-foreground">
                            Link inventory products to orders without changing the original details.
                        </p>
                    </div>
                    <Badge variant="outline" className="w-fit rounded-full text-xs">Matching desk</Badge>
                </header>

                <section className="overflow-hidden rounded-xl border bg-card" aria-label="Live order stats">
                    <StatsBand
                        stats={[
                            { value: orders?.total ?? 0, label: 'Total orders' },
                            { value: matchedOnPage, label: 'Matched on page' },
                            { value: unmatchedOnPage, label: 'Unmatched on page' },
                            { value: selectedIds.length, label: 'Selected' },
                        ]}
                    />
                </section>

                <section className="overflow-hidden rounded-xl border bg-card">
                    <div className="overflow-x-auto border-b">
                        <div className="flex min-w-[900px] items-end gap-3 p-3">
                            <FilterColumn label="Merchant" className="min-w-0 flex-1">
                                <Combobox
                                    label="Merchant"
                                    placeholder="All merchants"
                                    options={merchantOptions}
                                    value={merchant ? option(merchant, merchant) : null}
                                    onValueChange={(value) => {
                                        const next = value?.value ?? '';
                                        setMerchant(next);
                                        applyFilters({ merchant: next });
                                    }}
                                    clearable
                                    emptyMessage={() => 'No merchants found.'}
                                />
                            </FilterColumn>
                            <FilterColumn label="Product names" className="min-w-0 flex-1">
                                <MultiSelect
                                    label="Product names"
                                    hideLabel
                                    placeholder="All product names"
                                    options={orderProductNameOptions}
                                    value={productNames}
                                    onValueChange={(values) => {
                                        setProductNames(values);
                                        applyFilters({ product_names: values });
                                    }}
                                    maxShown={2}
                                />
                            </FilterColumn>
                            <FilterColumn label="Status" className="min-w-0 flex-1">
                                <Combobox
                                    label="Status"
                                    placeholder="All statuses"
                                    options={statusOptions}
                                    value={orderStatus ? option(orderStatus, orderStatus) : null}
                                    onValueChange={(value) => {
                                        const next = value?.value ?? '';
                                        setOrderStatus(next);
                                        applyFilters({ status: next });
                                    }}
                                    clearable
                                    emptyMessage={() => 'No statuses found.'}
                                />
                            </FilterColumn>
                            <FilterColumn label="Agent" className="min-w-0 flex-1">
                                <Combobox
                                    label="Agent"
                                    placeholder="All agents"
                                    options={agentOptions}
                                    value={agentId ? agentOptions.find((item) => item.value === agentId) ?? option(agentId, `Agent #${agentId}`) : null}
                                    onValueChange={(value) => {
                                        const next = value?.value ?? '';
                                        setAgentId(next);
                                        applyFilters({ agent_id: next });
                                    }}
                                    clearable
                                    emptyMessage={() => 'No agents found.'}
                                />
                            </FilterColumn>
                            <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                aria-label="Clear filters"
                                title="Clear filters"
                                className="h-7 w-7 shrink-0"
                                disabled={isLoading || (!filters.product_names?.length && !filters.merchant && !filters.status && !filters.agent_id)}
                                onClick={() => {
                                    setProductNames([]);
                                    setMerchant('');
                                    setOrderStatus('');
                                    setAgentId('');
                                    navigate({});
                                }}
                            >
                                {isLoading ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                            </Button>
                        </div>
                    </div>

                    {selectedIds.length > 0 && (
                        <div className="flex flex-col gap-3 border-b bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm font-medium">
                                {selectedIds.length} order{selectedIds.length === 1 ? '' : 's'} selected
                            </p>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <div className="w-full sm:w-80">
                                    <Combobox
                                        label="Product for selected orders"
                                        placeholder={bulkSaving ? 'Matching...' : 'Choose product for selected orders'}
                                        options={productOptions}
                                        value={bulkProductId ? productOptions.find((item) => item.value === bulkProductId) ?? null : null}
                                        onValueChange={(value) => setBulkProductId(value?.value ?? '')}
                                        disabled={bulkSaving}
                                        clearable
                                        emptyMessage={() => 'No inventory products found.'}
                                    />
                                </div>
                                <Button type="button" size="sm" onClick={matchSelected} disabled={!bulkProductId || bulkSaving}>
                                    {bulkSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
                                    {bulkSaving ? 'Matching...' : 'Match selected'}
                                </Button>
                            </div>
                        </div>
                    )}

                    <Deferred data="orders" fallback={<OrdersTableSkeleton />}>
                        {() =>
                            orders ? (
                                <>
                                    <div className="overflow-x-auto">
                                        <Table className="min-w-[1180px] table-fixed">
                                            <colgroup>
                                                <col className="w-10" />
                                                <col className="w-32" />
                                                <col className="w-28" />
                                                <col className="w-36" />
                                                <col className="w-32" />
                                                <col className="w-40" />
                                                <col className="w-16" />
                                                <col className="w-24" />
                                                <col className="w-36" />
                                                <col className="w-40" />
                                                <col className="w-32" />
                                                <col className="w-64" />
                                                <col className="w-40" />
                                            </colgroup>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-10">
                                                        <Checkbox
                                                            checked={allPageSelected}
                                                            onCheckedChange={(checked) => togglePageSelection(checked === true)}
                                                            aria-label="Select all unmatched orders on this page"
                                                            disabled={matchablePageOrderIds.length === 0}
                                                        />
                                                    </TableHead>
                                                    <TableHead>Order</TableHead>
                                                    <TableHead>Delivery date</TableHead>
                                                    <TableHead>Customer</TableHead>
                                                    <TableHead>Phone</TableHead>
                                                    <TableHead>Address</TableHead>
                                                    <TableHead>Qty</TableHead>
                                                    <TableHead>Amount</TableHead>
                                                    <TableHead>Status</TableHead>
                                                    <TableHead>Product name</TableHead>
                                                    <TableHead>Merchant</TableHead>
                                                    <TableHead>Inventory product (ID)</TableHead>
                                                    <TableHead>Agent</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {displayOrders.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={13} className="h-28 text-center text-muted-foreground">
                                                            No orders match these filters.
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    displayOrders.map((order) => (
                                                        <TableRow key={order.id}>
                                                            <TableCell>
                                                                <Checkbox
                                                                    checked={selectedIds.includes(order.id)}
                                                                    onCheckedChange={(checked) => toggleSelected(order.id, checked === true)}
                                                                    aria-label={`Select order ${order.order_no ?? order.id}`}
                                                                    disabled={!canBulkMatchOrder(order)}
                                                                />
                                                            </TableCell>
                                                            <TableCell className="font-medium whitespace-nowrap">
                                                                {order.order_no ?? `#${order.id}`}
                                                            </TableCell>
                                                            <TableCell className="whitespace-nowrap">
                                                                {order.delivery_date?.slice(0, 10) || '—'}
                                                            </TableCell>
                                                            <TableCell>
                                                                <span className="block truncate" title={order.client_name ?? undefined}>
                                                                    {order.client_name || '—'}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell>
                                                                <span className="block truncate" title={order.phone ?? undefined}>
                                                                    {order.phone || '—'}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell>
                                                                <span className="block truncate" title={order.address ?? undefined}>
                                                                    {order.address || '—'}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell>{order.quantity ?? '—'}</TableCell>
                                                            <TableCell>{order.amount ?? '—'}</TableCell>
                                                            <TableCell>
                                                                <Badge
                                                                    variant="outline"
                                                                    className={cn(
                                                                        'rounded-full',
                                                                        statusColors[order.status?.trim() || 'New Orders'] || 'bg-muted text-foreground border-border',
                                                                    )}
                                                                >
                                                                    {order.status?.trim() || 'New Orders'}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell>
                                                                <span className="block truncate" title={order.product_name ?? undefined}>
                                                                    {order.product_name || '—'}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell>
                                                                <span className="block truncate" title={order.merchant ?? undefined}>
                                                                    {order.merchant || '—'}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell className="min-w-64">
                                                                {order.inventory_deducted_at ? (
                                                                    <div>
                                                                        <p
                                                                            className="truncate text-sm"
                                                                            title={order.linked_product?.name ?? undefined}
                                                                        >
                                                                            {order.linked_product
                                                                                ? `${order.linked_product.name} · #${order.linked_product.id}`
                                                                                : `Product #${order.inventory_product_id}`}
                                                                        </p>
                                                                        <p className="text-xs text-muted-foreground">
                                                                            Already deducted; matching locked
                                                                        </p>
                                                                    </div>
                                                                ) : (
                                                                    <div className="space-y-1">
                                                                        {(suggestionsByOrder.get(order.id) ?? []).slice(0, 1).map(({ product }) => (
                                                                            <button
                                                                                key={`suggestion-${order.id}-${product.id}`}
                                                                                type="button"
                                                                                disabled={savingOrderId === order.id}
                                                                                onClick={() => matchOne(order, String(product.id))}
                                                                                className="inline-flex max-w-full items-center gap-1 rounded-full border border-dashed border-primary/40 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
                                                                                title={`Apply suggested match: ${product.name}`}
                                                                            >
                                                                                <Sparkles className="size-3 shrink-0" />
                                                                                <span className="truncate">Best guess: {product.name}</span>
                                                                            </button>
                                                                        ))}
                                                                        <Combobox
                                                                            label={`Inventory product for order ${order.order_no ?? order.id}`}
                                                                            placeholder={savingOrderId === order.id ? 'Saving...' : 'Select inventory product'}
                                                                            options={productOptions}
                                                                            value={
                                                                                order.inventory_product_id
                                                                                    ? productOptions.find((item) => item.value === String(order.inventory_product_id)) ?? null
                                                                                    : null
                                                                            }
                                                                            onValueChange={(value) => matchOne(order, value?.value ?? '')}
                                                                            disabled={savingOrderId === order.id}
                                                                            clearable
                                                                            emptyMessage={() => 'No inventory products found.'}
                                                                            width={360}
                                                                        />
                                                                        {order.linked_product && (
                                                                            <p
                                                                                className="truncate text-xs text-muted-foreground"
                                                                                title={order.linked_product.name}
                                                                            >
                                                                                Current: {order.linked_product.name} · #{order.linked_product.id}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="min-w-36">
                                                                {order.agent_id ? (
                                                                    <div>
                                                                        <p className="truncate" title={order.assigned_agent?.name}>
                                                                            {order.assigned_agent?.name ?? 'Unknown agent'}
                                                                        </p>
                                                                        <p className="text-xs text-muted-foreground">ID: {order.agent_id}</p>
                                                                    </div>
                                                                ) : (
                                                                    '—'
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>

                                    <footer className="flex flex-col gap-3 border-t px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                                        <p className="text-xs text-muted-foreground">
                                            Showing {displayOrders.length ? (orders.current_page - 1) * orders.per_page + 1 : 0}–
                                            {Math.min(orders.current_page * orders.per_page, orders.total)} of {orders.total} orders
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                disabled={isLoading || orders.current_page <= 1}
                                                onClick={() => visitPage(orders.current_page - 1)}
                                            >
                                                Previous
                                            </Button>
                                            <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                                                {isLoading && <Loader2 className="size-3.5 animate-spin" />}
                                                Page {orders.current_page} of {orders.last_page}
                                            </span>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                disabled={isLoading || orders.current_page >= orders.last_page}
                                                onClick={() => visitPage(orders.current_page + 1)}
                                            >
                                                Next
                                            </Button>
                                        </div>
                                    </footer>
                                </>
                            ) : null
                        }
                    </Deferred>
                </section>
            </main>
        </AppLayout>
    );
}
