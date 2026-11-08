import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { csrfHeaders } from '@/lib/csrf';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { Deferred, Head, router, usePage } from '@inertiajs/react';
import { Check, ChevronsUpDown, Loader2, Search } from 'lucide-react';
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
    order_date: string | null;
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

interface BulkMatchResponse extends Omit<MatchResponse, 'order'> {
    orders?: OrderMatchUpdate[];
    deductions?: DeductionResult[];
}

function firstValidationError(errors?: Record<string, string[]>): string | undefined {
    return errors ? Object.values(errors).flat()[0] : undefined;
}

function ProductPicker({
    products,
    value,
    onChange,
    placeholder,
    disabled = false,
    loading = false,
}: {
    products: ProductOption[];
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    disabled?: boolean;
    loading?: boolean;
}) {
    const [open, setOpen] = React.useState(false);
    const selected = products.find((product) => String(product.id) === value);
    const label = selected ? `${selected.name}${selected.merchant ? ` · ${selected.merchant}` : ''}` : placeholder;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled || loading}
                    className="w-full justify-between gap-2 font-normal"
                >
                    <span className={cn('truncate text-left', !selected && 'text-muted-foreground')}>{label}</span>
                    {loading ? (
                        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : (
                        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(28rem,calc(100vw-2rem))] p-0" align="start">
                <Command>
                    <CommandInput placeholder="Search inventory products..." />
                    <CommandList>
                        <CommandEmpty>No inventory products found.</CommandEmpty>
                        <CommandGroup>
                            <CommandItem
                                value="__no_match__"
                                onSelect={() => {
                                    onChange('');
                                    setOpen(false);
                                }}
                            >
                                <Check className={cn('mr-2 size-4', value === '' ? 'opacity-100' : 'opacity-0')} />
                                No product matched
                            </CommandItem>
                            {products.map((product) => {
                                const id = String(product.id);
                                const optionLabel = `${product.name}${product.merchant ? ` · ${product.merchant}` : ''}`;
                                return (
                                    <CommandItem
                                        key={product.id}
                                        value={`${optionLabel} ${product.merchant ?? ''} ${product.country ?? ''}`}
                                        onSelect={() => {
                                            onChange(id);
                                            setOpen(false);
                                        }}
                                    >
                                        <Check className={cn('mr-2 size-4', value === id ? 'opacity-100' : 'opacity-0')} />
                                        <span className="truncate">{optionLabel}</span>
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

function AgentPicker({
    agents,
    value,
    onChange,
    placeholder,
}: {
    agents: AgentOption[];
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
}) {
    const [open, setOpen] = React.useState(false);
    const selected = agents.find((agent) => String(agent.id) === value);
    const label = selected ? selected.name : placeholder;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between gap-2 font-normal">
                    <span className={cn('truncate text-left', !selected && 'text-muted-foreground')}>{label}</span>
                    <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(18rem,calc(100vw-2rem))] p-0" align="start">
                <Command>
                    <CommandInput placeholder="Search agents..." />
                    <CommandList>
                        <CommandEmpty>No agents found.</CommandEmpty>
                        <CommandGroup>
                            <CommandItem
                                value="__all_agents__"
                                onSelect={() => {
                                    onChange('');
                                    setOpen(false);
                                }}
                            >
                                <Check className={cn('mr-2 size-4', value === '' ? 'opacity-100' : 'opacity-0')} />
                                All agents
                            </CommandItem>
                            {agents.map((agent) => {
                                const id = String(agent.id);
                                return (
                                    <CommandItem
                                        key={agent.id}
                                        value={agent.name}
                                        onSelect={() => {
                                            onChange(id);
                                            setOpen(false);
                                        }}
                                    >
                                        <Check className={cn('mr-2 size-4', value === id ? 'opacity-100' : 'opacity-0')} />
                                        <span className="truncate">{agent.name}</span>
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
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
    filters,
}: {
    orders?: PaginatedOrders;
    products: ProductOption[];
    agents: AgentOption[];
    filters: { product_name: string; agent_id: number | null; per_page: number };
}) {
    const { flash } = usePage().props as { flash?: { success?: string; error?: string } };
    const [productName, setProductName] = React.useState(filters.product_name ?? '');
    const [agentId, setAgentId] = React.useState(filters.agent_id ? String(filters.agent_id) : '');
    const [selectedIds, setSelectedIds] = React.useState<number[]>([]);
    const [bulkProductId, setBulkProductId] = React.useState('');
    const [savingOrderId, setSavingOrderId] = React.useState<number | null>(null);
    const [bulkSaving, setBulkSaving] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(false);
    const [displayOrders, setDisplayOrders] = React.useState<OrderRow[]>(orders?.data ?? []);

    React.useEffect(() => {
        setProductName(filters.product_name ?? '');
        setAgentId(filters.agent_id ? String(filters.agent_id) : '');
        setSelectedIds([]);
    }, [filters.product_name, filters.agent_id, orders?.current_page]);

    React.useEffect(() => {
        setDisplayOrders(orders?.data ?? []);
    }, [orders?.data]);

    React.useEffect(() => {
        if (flash?.success) toast.success(flash.success);
        if (flash?.error) toast.error(flash.error);
    }, [flash?.success, flash?.error]);

    const breadcrumbs = [
        { title: 'Orders', href: '/sheetorders' },
        { title: 'Order Product Matching', href: '/order-product-matching' },
    ];

    const navigate = (params: Record<string, string | number | undefined>) => {
        router.get('/order-product-matching', params, {
            preserveState: true,
            preserveScroll: true,
            onStart: () => setIsLoading(true),
            onFinish: () => setIsLoading(false),
        });
    };

    const applyFilters = (overrides: { product_name?: string; agent_id?: string } = {}) => {
        const nextProductName = (overrides.product_name ?? productName).trim();
        const nextAgentId = overrides.agent_id ?? agentId;

        navigate({
            product_name: nextProductName || undefined,
            agent_id: nextAgentId || undefined,
            per_page: filters.per_page,
            page: 1,
        });
    };

    const search = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        applyFilters();
    };

    const toggleSelected = (orderId: number, checked: boolean) => {
        setBulkProductId('');
        setSelectedIds((previous) => (checked ? [...new Set([...previous, orderId])] : previous.filter((id) => id !== orderId)));
    };

    const pageOrderIds = displayOrders.map((order) => order.id);
    const allPageSelected = pageOrderIds.length > 0 && pageOrderIds.every((id) => selectedIds.includes(id));

    const togglePageSelection = (checked: boolean) => {
        setBulkProductId('');
        setSelectedIds((previous) => (checked ? [...new Set([...previous, ...pageOrderIds])] : previous.filter((id) => !pageOrderIds.includes(id))));
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

            const updates = new Map((result.orders ?? []).map((order) => [order.id, order]));
            setDisplayOrders((current) => current.map((order) => ({ ...order, ...(updates.get(order.id) ?? {}) })));
            setSelectedIds([]);
            setBulkProductId('');
            const deductions = result.deductions ?? [];
            const failed = deductions.filter((deduction) => deduction.status === 'failed' || deduction.status === 'missing_product');
            const deducted = deductions.filter((deduction) => deduction.status === 'deducted');
            if (failed.length > 0) {
                const failures = failed.map((deduction) => `${deduction.order_no ?? `#${deduction.order_id}`}: ${deduction.message ?? 'deduction failed'}`).join('; ');
                toast.warning(`${ids.length} orders were matched. ${failed.length} delivered order(s) were not deducted: ${failures}`);
            } else if (deducted.length > 0) {
                const agentCount = deducted.filter((deduction) => deduction.agent_transfer_deducted).length;
                toast.success(`${ids.length} orders matched; ${deducted.length} delivered order(s) deducted from warehouse${agentCount ? ` and ${agentCount} assigned agent transfer balance(s)` : ''}. Country WhatsApp messages were triggered.`);
            } else {
                toast.success(`${ids.length} orders matched to the selected inventory product.`);
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Could not match the selected orders.');
        } finally {
            setBulkSaving(false);
        }
    };

    const visitPage = (page: number) =>
        navigate({
            product_name: filters.product_name || undefined,
            agent_id: filters.agent_id || undefined,
            per_page: filters.per_page,
            page,
        });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Order Product Matching" />
            <main className="space-y-4 p-4 sm:p-6">
                <header className="flex flex-col gap-1">
                    <h1 className="text-xl font-semibold tracking-tight">Order Product Matching</h1>
                    <p className="text-sm text-muted-foreground">
                        Match order product names to inventory products. Matching does not change the order’s product name.
                    </p>
                </header>

                <section className="overflow-hidden rounded-xl border bg-card">
                    <form onSubmit={search} className="flex flex-col gap-3 border-b p-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <div className="relative w-full sm:max-w-sm">
                                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={productName}
                                    onChange={(event) => setProductName(event.target.value)}
                                    placeholder="Filter orders by product name..."
                                    aria-label="Filter orders by product name"
                                    className="pl-9"
                                />
                            </div>
                            <div className="w-full sm:w-56">
                                <AgentPicker
                                    agents={agents}
                                    value={agentId}
                                    onChange={(value) => {
                                        setAgentId(value);
                                        applyFilters({ agent_id: value });
                                    }}
                                    placeholder="All agents"
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button type="submit" size="sm" disabled={isLoading}>
                                {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
                                Search orders
                            </Button>
                            {(filters.product_name || filters.agent_id) && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    disabled={isLoading}
                                    onClick={() => {
                                        setProductName('');
                                        setAgentId('');
                                        navigate({});
                                    }}
                                >
                                    Clear
                                </Button>
                            )}
                        </div>
                    </form>

                    {selectedIds.length > 0 && (
                        <div className="flex flex-col gap-3 border-b bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm font-medium">
                                {selectedIds.length} order{selectedIds.length === 1 ? '' : 's'} selected
                            </p>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <div className="w-full sm:w-80">
                                    <ProductPicker
                                        products={products}
                                        value={bulkProductId}
                                        onChange={setBulkProductId}
                                        placeholder="Choose product for selected orders"
                                        loading={bulkSaving}
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
                                                            aria-label="Select all orders on this page"
                                                        />
                                                    </TableHead>
                                                    <TableHead>Order</TableHead>
                                                    <TableHead>Order date</TableHead>
                                                    <TableHead>Customer</TableHead>
                                                    <TableHead>Phone</TableHead>
                                                    <TableHead>Address</TableHead>
                                                    <TableHead>Qty</TableHead>
                                                    <TableHead>Amount</TableHead>
                                                    <TableHead>Status</TableHead>
                                                    <TableHead>Order product name</TableHead>
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
                                                                    disabled={Boolean(order.inventory_deducted_at)}
                                                                />
                                                            </TableCell>
                                                            <TableCell className="font-medium whitespace-nowrap">
                                                                {order.order_no ?? `#${order.id}`}
                                                            </TableCell>
                                                            <TableCell className="whitespace-nowrap">
                                                                {order.order_date?.slice(0, 10) || '—'}
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
                                                                <Badge variant="outline">{order.status || 'New Orders'}</Badge>
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
                                                                    <ProductPicker
                                                                        products={products}
                                                                        value={order.inventory_product_id ? String(order.inventory_product_id) : ''}
                                                                        onChange={(value) => matchOne(order, value)}
                                                                        placeholder="Select inventory product"
                                                                        loading={savingOrderId === order.id}
                                                                    />
                                                                )}
                                                                {order.linked_product && !order.inventory_deducted_at && (
                                                                    <p
                                                                        className="mt-1 truncate text-xs text-muted-foreground"
                                                                        title={order.linked_product.name}
                                                                    >
                                                                        Current: {order.linked_product.name} · #{order.linked_product.id}
                                                                    </p>
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
