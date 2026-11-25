'use client';

import { Badge } from '@/components/ui/badge';
import type { BreadcrumbItem } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MultiSelect } from '@/components/multi-select';
import { Switch } from '@/components/switch';
import AppLayout from '@/layouts/app-layout';
import { EAST_AFRICAN_COUNTRIES } from '@/lib/east-african-countries';
import { Deferred, Head, router, usePage } from '@inertiajs/react';
import { CheckCircle2, Circle, Hash, Layers3, LoaderCircle, RefreshCcw, Search } from 'lucide-react';
import * as React from 'react';
import { toast } from '@/lib/toast';
import { Skeleton } from '@/components/ui/skeleton';

interface SheetOrder {
    id: number;
    order_no: string;
    sheet_id: string;
    sheet_name: string;
    merchant: string;
    status: string | null;
    delivery_date: string | null;
    instructions: string | null;
    edited_at: string;
    sheet_update_attempts: number;
    sheet_update_last_error: string | null;
    sheet_update_last_attempted_at: string | null;
}

const EMPTY_UPDATES: SheetOrder[] = [];

function UpdatesSkeleton() {
    return (
        <div className="overflow-x-auto" role="status" aria-label="Loading pending updates" aria-live="polite">
            <div className="min-w-[980px]">
                <div className="grid grid-cols-8 gap-4 border-b bg-muted/30 px-4 py-3">
                    {Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-4 w-full" />)}
                </div>
                {Array.from({ length: 7 }).map((_, row) => (
                    <div key={row} className="grid grid-cols-8 gap-4 border-b px-4 py-4 last:border-0">
                        {Array.from({ length: 8 }).map((__, column) => <Skeleton key={column} className="h-4 w-full" />)}
                    </div>
                ))}
            </div>
        </div>
    );
}

function isFilled(value: string | null | undefined) {
    return typeof value === 'string' ? value.trim() !== '' : value !== null && value !== undefined;
}

function FieldState({ label, filled }: { label: string; filled: boolean }) {
    const Icon = filled ? CheckCircle2 : Circle;
    return (
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${filled ? 'border-success/30 bg-success/10 text-success' : 'border-destructive/30 bg-destructive/10 text-destructive'}`}>
            <Icon className="size-3" />
            {label}
        </span>
    );
}

export default function PendingUpdates() {
    const { props } = usePage();
    const pageData = props as unknown as {
        updates: SheetOrder[];
        filters: { search?: string; country?: string };
    };
    const updates = pageData.updates ?? EMPTY_UPDATES;
    const isUpdatesLoaded = pageData.updates !== undefined;
    const filters = pageData.filters ?? {};
    const [rows, setRows] = React.useState<SheetOrder[]>(updates);

    React.useEffect(() => {
        setRows(updates);
    }, [updates]);

    const BREADCRUMBS: BreadcrumbItem[] = [
        { title: 'Dashboard', href: '/dashboard' },
        { title: 'Pending Sheet Updates', href: '/updates' },
    ];

    const [search, setSearch] = React.useState(filters?.search || '');
    const [selectedCountry, setSelectedCountry] = React.useState(filters?.country || 'all');
    const [isRunning, setIsRunning] = React.useState(false);
    const [clearingIds, setClearingIds] = React.useState<number[]>([]);
    const [merchantFilter, setMerchantFilter] = React.useState<string[]>([]);
    const [sheetFilter, setSheetFilter] = React.useState<string[]>([]);
    const [syncFilter, setSyncFilter] = React.useState<string[]>([]);
    const [fieldFilter, setFieldFilter] = React.useState<string[]>([]);
    const columnOptions = React.useMemo(() => [
        { value: 'order', label: 'Order' },
        { value: 'sheet', label: 'Destination sheet' },
        { value: 'merchant', label: 'Merchant' },
        { value: 'fields', label: 'Required fields' },
        { value: 'attempts', label: 'Attempts / reason' },
        { value: 'sync', label: 'Sync' },
        { value: 'edited_at', label: 'Edited at' },
        { value: 'clear', label: 'Clear edited_at' },
    ], []);
    const [visibleColumns, setVisibleColumns] = React.useState<string[]>(columnOptions.map((c) => c.value));
    const isColumnVisible = React.useCallback((key: string) => visibleColumns.includes(key), [visibleColumns]);

    const merchantOptions = React.useMemo(
        () => Array.from(new Set(rows.map((o) => o.merchant).filter(Boolean) as string[])).sort().map((m) => ({ value: m, label: m })),
        [rows],
    );
    const sheetOptions = React.useMemo(
        () => Array.from(new Set(rows.map((o) => o.sheet_name).filter(Boolean))).sort().map((s) => ({ value: s, label: s })),
        [rows],
    );
    const syncOptions = React.useMemo(() => [
        { value: 'ready', label: 'Ready' },
        { value: 'pending', label: 'Pending' },
    ], []);
    const fieldOptions = React.useMemo(() => [
        { value: 'missing_instructions', label: 'Missing instructions' },
        { value: 'missing_status', label: 'Missing status' },
        { value: 'missing_delivery', label: 'Missing delivery date' },
        { value: 'complete', label: 'All fields filled' },
    ], []);

    const filtered = React.useMemo(() => {
        const q = search.toLowerCase();
        return rows.filter((order) => {
            const matchesSearch =
                !q ||
                order.order_no.toLowerCase().includes(q) ||
                order.merchant?.toLowerCase().includes(q) ||
                order.sheet_name?.toLowerCase().includes(q);
            const matchesMerchant = merchantFilter.length === 0 || (order.merchant && merchantFilter.includes(order.merchant));
            const matchesSheet = sheetFilter.length === 0 || sheetFilter.includes(order.sheet_name);
            const statusFilled = isFilled(order.status);
            const instructionsFilled = isFilled(order.instructions);
            const deliveryFilled = isFilled(order.delivery_date);
            const allFilled = statusFilled && instructionsFilled && deliveryFilled;
            const matchesSync =
                syncFilter.length === 0 ||
                (syncFilter.includes('ready') && allFilled) ||
                (syncFilter.includes('pending') && !allFilled);
            const matchesField =
                fieldFilter.length === 0 ||
                (fieldFilter.includes('missing_instructions') && !instructionsFilled) ||
                (fieldFilter.includes('missing_status') && !statusFilled) ||
                (fieldFilter.includes('missing_delivery') && !deliveryFilled) ||
                (fieldFilter.includes('complete') && allFilled);
            return matchesSearch && matchesMerchant && matchesSheet && matchesSync && matchesField;
        });
    }, [search, rows, merchantFilter, sheetFilter, syncFilter, fieldFilter]);

    const sheetCount = React.useMemo(() => new Set(rows.map((order) => order.sheet_id)).size, [rows]);
    const merchantCount = React.useMemo(() => new Set(rows.map((order) => order.merchant).filter(Boolean)).size, [rows]);
    const oldestUpdate = rows[0]?.edited_at ?? '—';

    const runUpdateCommand = () => {
        setIsRunning(true);
        fetch('/sheet-updates/run', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-XSRF-TOKEN': decodeURIComponent(document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? ''),
                'X-Requested-With': 'XMLHttpRequest',
            },
            credentials: 'same-origin',
            body: JSON.stringify({}),
        })
            .then(async (response) => {
                if (!response.ok) throw new Error('Request failed');
                const data = await response.json().catch(() => null);
                toast.success(data?.message ?? 'Update command started');
            })
            .catch(() => toast.error('Failed to run update command'))
            .finally(() => setIsRunning(false));
    };

    const clearEditedAt = async (orderId: number) => {
        setClearingIds((ids) => [...ids, orderId]);
        try {
            const response = await fetch(`/updates/${orderId}/clear-edited-at`, {
                method: 'PATCH',
                headers: {
                    Accept: 'application/json',
                    'X-XSRF-TOKEN': decodeURIComponent(document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? ''),
                    'X-Requested-With': 'XMLHttpRequest',
                },
                credentials: 'same-origin',
            });
            if (!response.ok) throw new Error('Request failed');
            setRows((current) => current.filter((row) => row.id !== orderId));
            toast.success('Order removed from pending updates');
        } catch (error) {
            toast.error('Failed to clear edited_at');
            throw error;
        } finally {
            setClearingIds((ids) => ids.filter((id) => id !== orderId));
        }
    };

    return (
        <AppLayout breadcrumbs={BREADCRUMBS}>
            <Head title="Pending Sheet Updates" />

            <div className="p-3 sm:p-4">
                <Card className="overflow-hidden">
                    <CardHeader className="space-y-3 border-b p-3 sm:p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-start gap-2.5">
                                <Layers3 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                                <div>
                                    <CardTitle className="text-base">Pending sheet updates</CardTitle>
                                    <CardDescription className="text-xs">
                                        {isUpdatesLoaded ? `${rows.length} queued · ${sheetCount} sheets · ${merchantCount} merchants` : <Skeleton className="mt-1 h-3 w-48" />}
                                    </CardDescription>
                                </div>
                            </div>
                            <Button onClick={runUpdateCommand} disabled={isRunning} className="h-9 gap-2 self-start sm:self-auto">
                                {isRunning ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
                                Run update command
                            </Button>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px]">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    placeholder="Search order, merchant, or sheet"
                                    className="h-9 pl-9"
                                />
                            </div>
                            <Select
                                value={selectedCountry}
                                onValueChange={(value) => {
                                    setSelectedCountry(value);
                                    router.get('/updates', value === 'all' ? {} : { country: value }, {
                                        preserveState: true,
                                        preserveScroll: true,
                                        replace: true,
                                    });
                                }}
                            >
                                <SelectTrigger className="h-9">
                                    <SelectValue placeholder="All countries" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All countries</SelectItem>
                                    {EAST_AFRICAN_COUNTRIES.map((country) => (
                                        <SelectItem key={country} value={country}>{country}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                            <MultiSelect
                                label="Merchant"
                                placeholder="All merchants"
                                options={merchantOptions}
                                value={merchantFilter}
                                onValueChange={setMerchantFilter}
                            />
                            <MultiSelect
                                label="Sheet"
                                placeholder="All sheets"
                                options={sheetOptions}
                                value={sheetFilter}
                                onValueChange={setSheetFilter}
                            />
                            <MultiSelect
                                label="Sync status"
                                placeholder="All sync states"
                                searchable={false}
                                options={syncOptions}
                                value={syncFilter}
                                onValueChange={setSyncFilter}
                            />
                            <MultiSelect
                                label="Required fields"
                                placeholder="All field states"
                                searchable={false}
                                options={fieldOptions}
                                value={fieldFilter}
                                onValueChange={setFieldFilter}
                            />
                            <MultiSelect
                                label="Visible columns"
                                placeholder="Show columns"
                                searchable={false}
                                options={columnOptions}
                                value={visibleColumns}
                                onValueChange={(next) => setVisibleColumns(next.length ? next : ['order'])}
                            />
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span>{isUpdatesLoaded ? `${filtered.length} visible of ${rows.length} queued` : <Skeleton className="h-3 w-36" />}</span>
                            <span>{isUpdatesLoaded ? `Oldest edit: ${oldestUpdate}` : <Skeleton className="h-3 w-40" />}</span>
                        </div>
                    </CardHeader>

                    <Deferred data="updates" fallback={<UpdatesSkeleton />}>
                        {() => (
                            <CardContent className="p-0">
                                {filtered.length === 0 ? (
                                    <div className="m-3 rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
                                        No pending updates found.
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <Table className="min-w-[1060px]">
                                            <TableHeader>
                                                <TableRow className="bg-muted/30 hover:bg-muted/30">
                                                    {isColumnVisible('order') && <TableHead className="w-[160px]">Order</TableHead>}
                                                    {isColumnVisible('sheet') && <TableHead>Destination sheet</TableHead>}
                                                    {isColumnVisible('merchant') && <TableHead>Merchant</TableHead>}
                                                    {isColumnVisible('fields') && <TableHead className="w-[260px]">Required fields</TableHead>}
                                                    {isColumnVisible('attempts') && <TableHead className="w-[260px]">Attempts / reason</TableHead>}
                                                    {isColumnVisible('sync') && <TableHead className="w-[120px]">Sync</TableHead>}
                                                    {isColumnVisible('edited_at') && <TableHead className="w-[170px]">Edited at</TableHead>}
                                                    {isColumnVisible('clear') && <TableHead className="w-[150px] text-right">Clear edited_at</TableHead>}
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {filtered.map((order) => {
                                                    const statusFilled = isFilled(order.status);
                                                    const instructionsFilled = isFilled(order.instructions);
                                                    const deliveryFilled = isFilled(order.delivery_date);
                                                    const allFilled = statusFilled && instructionsFilled && deliveryFilled;
                                                    const clearing = clearingIds.includes(order.id);
                                                    return (
                                                        <TableRow key={order.id}>
                                                            {isColumnVisible('order') && (
                                                                <TableCell className="font-medium">
                                                                    <span className="flex items-center gap-2"><Hash className="size-3.5 text-muted-foreground" />{order.order_no}</span>
                                                                </TableCell>
                                                            )}
                                                            {isColumnVisible('sheet') && <TableCell className="max-w-[220px] truncate">{order.sheet_name}</TableCell>}
                                                            {isColumnVisible('merchant') && <TableCell className="max-w-[180px] truncate text-muted-foreground">{order.merchant}</TableCell>}
                                                            {isColumnVisible('fields') && (
                                                                <TableCell>
                                                                    <div className="flex flex-wrap gap-1.5">
                                                                        <FieldState label="Instructions" filled={instructionsFilled} />
                                                                        <FieldState label="Status" filled={statusFilled} />
                                                                        <FieldState label="Delivery" filled={deliveryFilled} />
                                                                    </div>
                                                                </TableCell>
                                                            )}
                                                            {isColumnVisible('attempts') && (
                                                                <TableCell>
                                                                    <div className="space-y-1">
                                                                        <div className="flex items-center gap-2 text-xs">
                                                                            <Badge variant="outline" className="border-border bg-muted/40 font-mono">
                                                                                {order.sheet_update_attempts ?? 0}
                                                                            </Badge>
                                                                            <span className="text-muted-foreground">attempt(s)</span>
                                                                        </div>
                                                                        {order.sheet_update_last_error ? (
                                                                            <p className="max-w-[240px] truncate text-xs text-destructive" title={order.sheet_update_last_error}>
                                                                                {order.sheet_update_last_error}
                                                                            </p>
                                                                        ) : (
                                                                            <p className="text-xs text-muted-foreground">No failure recorded</p>
                                                                        )}
                                                                    </div>
                                                                </TableCell>
                                                            )}
                                                            {isColumnVisible('sync') && (
                                                                <TableCell>
                                                                    <Badge variant="outline" className={allFilled ? 'border-success/30 bg-success/10 text-success' : 'border-warning/30 bg-warning/10 text-warning-foreground'}>
                                                                        {allFilled ? 'Ready' : 'Pending'}
                                                                    </Badge>
                                                                </TableCell>
                                                            )}
                                                            {isColumnVisible('edited_at') && <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{order.edited_at}</TableCell>}
                                                            {isColumnVisible('clear') && (
                                                                <TableCell>
                                                                    <div className="flex items-center justify-end gap-2">
                                                                        <span className="text-[11px] text-muted-foreground">{clearing ? 'Clearing...' : 'Set null'}</span>
                                                                        <Switch
                                                                            size="sm"
                                                                            checked={false}
                                                                            disabled={clearing}
                                                                            aria-label={`Set edited_at to null for order ${order.order_no}`}
                                                                            onCheckedChange={(checked) => {
                                                                                if (checked) return clearEditedAt(order.id);
                                                                            }}
                                                                        />
                                                                    </div>
                                                                </TableCell>
                                                            )}
                                                        </TableRow>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                            </CardContent>
                        )}
                    </Deferred>
                </Card>
            </div>
        </AppLayout>
    );
}
