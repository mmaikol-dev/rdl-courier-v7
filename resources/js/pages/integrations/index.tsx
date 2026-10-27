'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Deferred, Head, router, useForm } from '@inertiajs/react';
import { Activity, AlertTriangle, ChevronDown, ChevronRight, Globe2, Loader2, PlugZap, Plus, RefreshCw, Store, Trash2, Unplug } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/dashboard' },
    { title: 'Integrations', href: '/integrations' },
];

interface Integration {
    id: number;
    store_name: string;
    merchant: string;
    sheets_id: number;
    country: string;
    allowed_countries: string[];
    order_no_prefix: string;
    is_enabled: boolean;
    last_synced_at: string | null;
    orders_synced: number;
    last_error: string | null;
    last_error_at: string | null;
    token_hint: string;
}

interface SheetOption {
    id: number;
    sheet_name: string;
    country: string;
}

interface PageProps extends Record<string, unknown> {
    integrations: Integration[];
    sheets: SheetOption[];
    /** ISO alpha-2 code => country name, for markets a merchant can open. */
    /**
     * ISO alpha-2 code => country name.
     *
     * Deliberately not `countries`: Inertia shares a `countries` array on every
     * page for the sidebar country filter, and a page prop of the same name
     * shadows it, which crashes CountryFilter.
     */
    countryNames: Record<string, string>;
    prefixSuggestions: Record<string, string[]>;
    auth: { user: { roles: string } };
    flash?: { success?: string; error?: string };
}

interface IntegrationForm {
    id?: number;
    store_name: string;
    access_token: string;
    sheets_id: string;
    country: string;
    allowed_countries: string[];
    order_no_prefix: string;
}

interface IntegrationOrder {
    id: number;
    order_no: string;
    client_name: string | null;
    country: string | null;
    product_name: string | null;
    quantity: number | null;
    amount: number | null;
    status: string | null;
    created_at: string | null;
    import_state: string;
    error_message: string | null;
}

const IMPORT_STATE_LABELS: Record<string, string> = {
    processed: 'Inserted',
    pending: 'Pending',
    processing: 'Processing',
    failed: 'Failed',
    skipped: 'Skipped',
};

const EMPTY_INTEGRATIONS: Integration[] = [];

function IntegrationsTableSkeleton() {
    return <div className="space-y-3 rounded-xl border p-4" role="status" aria-label="Loading integrations" aria-live="polite"><div className="grid grid-cols-3 gap-3 border-b pb-3 sm:grid-cols-7">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}</div>{Array.from({ length: 5 }).map((_, row) => <div key={row} className="grid grid-cols-3 gap-3 border-b py-4 last:border-0 sm:grid-cols-7">{Array.from({ length: 7 }).map((__, col) => <Skeleton key={col} className="h-4 w-full" />)}</div>)}</div>;
}

const emptyForm: IntegrationForm = {
    store_name: '',
    access_token: '',
    sheets_id: '',
    country: '',
    allowed_countries: [],
    order_no_prefix: '',
};

export default function IntegrationsIndex({ integrations = EMPTY_INTEGRATIONS, sheets, countryNames, prefixSuggestions, auth }: PageProps) {
    const { data, setData, post, put, reset } = useForm<IntegrationForm>(emptyForm);
    const [isDialogOpen, setIsDialogOpen] = React.useState(false);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [pendingDelete, setPendingDelete] = React.useState<Integration | null>(null);
    const [busyId, setBusyId] = React.useState<number | null>(null);
    const [expandedId, setExpandedId] = React.useState<number | null>(null);
    const [ordersByIntegration, setOrdersByIntegration] = React.useState<Record<number, IntegrationOrder[]>>({});
    const [ordersLoadingId, setOrdersLoadingId] = React.useState<number | null>(null);
    const [countrySearch, setCountrySearch] = React.useState('');

    const isEditing = Boolean(data.id);
    const isMerchant = auth.user.roles === 'merchant';
    const enabledCount = integrations.filter((integration) => integration.is_enabled && !integration.last_error).length;
    const stagedOrderCount = integrations.reduce((total, integration) => total + integration.orders_synced, 0);
    const countryCount = new Set(integrations.flatMap((integration) => integration.allowed_countries ?? [integration.country])).size;
    const errorCount = integrations.filter((integration) => Boolean(integration.last_error)).length;

    // A merchant only ever sees their own sheet, so the country follows it
    // rather than being a free choice. Staff pick per store.
    const selectedSheet = sheets.find((sheet) => String(sheet.id) === data.sheets_id);
    const canonicalCountryName = React.useCallback((country: string) => {
        const normalized = country.trim().toLocaleLowerCase();
        return Object.values(countryNames).find((name) => name.trim().toLocaleLowerCase() === normalized) ?? country.trim();
    }, [countryNames]);

    React.useEffect(() => {
        if (isMerchant && selectedSheet && !data.country) {
            setData('country', selectedSheet.country);
        }
    }, [data.country, isMerchant, selectedSheet, setData]);

    const openCreate = () => {
        reset();
        setCountrySearch('');
        setIsDialogOpen(true);
    };

    const openEdit = (integration: Integration) => {
        setCountrySearch('');
        setData({
            id: integration.id,
            store_name: integration.store_name,
            // Never prefill the token; leaving it blank keeps the stored one.
            access_token: '',
            sheets_id: String(integration.sheets_id),
            country: integration.country,
            allowed_countries: (integration.allowed_countries ?? [integration.country]).map(canonicalCountryName),
            order_no_prefix: integration.order_no_prefix,
        });
        setIsDialogOpen(true);
    };

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        setIsSubmitting(true);

        const submitOptions = {
            onSuccess: () => {
                toast.success(isEditing ? 'Storeep integration updated.' : 'Storeep store connected.');
                setIsDialogOpen(false);
            },
            onError: (errors: Record<string, string>) => {
                const firstError = Object.values(errors).find((message) => typeof message === 'string');
                toast.error(firstError ?? 'Could not save the Storeep integration. Check the form and try again.');
            },
            onFinish: () => setIsSubmitting(false),
        };

        if (isEditing) {
            put(`/integrations/${data.id}`, submitOptions);
        } else {
            post('/integrations', submitOptions);
        }
    };

    const runAction = (integration: Integration, action: 'test' | 'sync') => {
        setBusyId(integration.id);

        router.post(
            `/integrations/${integration.id}/${action}`,
            {},
            {
                onFinish: () => setBusyId(null),
                onSuccess: () => toast.success(action === 'test' ? 'Connection tested.' : 'Sync finished.'),
                onError: (errors) => toast.error(Object.values(errors)[0] ?? 'Something went wrong.'),
            },
        );
    };

    const destroy = (integration: Integration) => {
        setBusyId(integration.id);

        router.delete(`/integrations/${integration.id}`, {
            onFinish: () => {
                setBusyId(null);
                setPendingDelete(null);
            },
        });
    };

    const toggleOrders = async (integration: Integration) => {
        if (expandedId === integration.id) {
            setExpandedId(null);
            return;
        }

        setExpandedId(integration.id);
        if (ordersByIntegration[integration.id]) return;

        setOrdersLoadingId(integration.id);
        try {
            const response = await fetch(`/integrations/${integration.id}/orders`, {
                headers: { Accept: 'application/json' },
                credentials: 'same-origin',
            });
            if (!response.ok) throw new Error('Could not load the latest orders.');
            const result = await response.json();
            setOrdersByIntegration((current) => ({ ...current, [integration.id]: result.orders ?? [] }));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Could not load the latest orders.');
            setExpandedId(null);
        } finally {
            setOrdersLoadingId(null);
        }
    };

    // The prefix comes from the merchant's sheet name, and the backend sends
    // the exact candidate list it would allocate from. Show those so the chip
    // a user clicks is the prefix the server would actually choose.
    const suggestions = React.useMemo(() => {
        const sheetName = (selectedSheet?.sheet_name || '').trim();

        if (!sheetName) return [];

        return (prefixSuggestions[sheetName] ?? []).slice(0, 6);
    }, [selectedSheet?.sheet_name, prefixSuggestions]);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Integrations" />

            <div className="flex w-full min-w-0 max-w-full flex-col gap-5 px-4 py-5 sm:px-6 sm:py-6">
                <div className="relative isolate flex min-w-0 flex-col justify-between gap-4 overflow-hidden rounded-xl border bg-card px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:px-5">
                    <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-14 -z-10 size-48 rounded-full bg-primary/10 blur-3xl" />
                    <div className="min-w-0">
                        <div className="mb-2 inline-flex items-center gap-2 rounded-full border bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                            <span className="size-1.5 rounded-full bg-primary" /> Store connections
                        </div>
                        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
                        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                            Manage connected stores, incoming order markets, and sync activity in one place.
                        </p>
                        <div className="mt-3 flex max-w-3xl items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                            <PlugZap className="mt-0.5 size-3.5 shrink-0 text-primary" />
                            <p>
                                <span className="font-medium text-foreground">Syncs every five minutes.</span>{' '}
                                Only selected markets are imported, and each order is filed under its chosen merchant with a store prefix, for example <span className="font-mono text-foreground">TRI1</span>.
                            </p>
                        </div>
                    </div>

                    <Button
                        onClick={openCreate}
                        className="max-w-full shrink-0 gap-2 shadow-sm"
                    >
                        <Plus className="size-4" />
                        Connect Storeep store
                    </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                    <Card className="border-border/70 shadow-sm">
                        <CardContent className="flex items-center gap-3 p-4">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Store className="size-5" /></div>
                            <div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">Connected stores</p><p className="mt-0.5 text-xl font-semibold tabular-nums">{integrations.length}</p></div>
                            <div className="ml-auto text-right">
                                <p className="text-xs text-muted-foreground">{enabledCount} active</p>
                                <p className="mt-1 text-xs text-muted-foreground"><span className="font-semibold text-foreground tabular-nums">{stagedOrderCount}</span> orders staged</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-border/70 shadow-sm">
                        <CardContent className="flex items-center gap-3 p-4">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground"><Globe2 className="size-5" /></div>
                            <div><p className="text-xs font-medium text-muted-foreground">Markets enabled</p><p className="mt-0.5 text-xl font-semibold tabular-nums">{countryCount}</p></div>
                            <span className="ml-auto text-xs text-muted-foreground">Across all stores</span>
                        </CardContent>
                    </Card>
                    <Card className="border-border/70 shadow-sm">
                        <CardContent className="flex items-center gap-3 p-4">
                            <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${errorCount ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>{errorCount ? <AlertTriangle className="size-5" /> : <Activity className="size-5" />}</div>
                            <div><p className="text-xs font-medium text-muted-foreground">Sync health</p><p className="mt-0.5 text-xl font-semibold">{errorCount ? `${errorCount} needs attention` : 'All clear'}</p></div>
                            <span className="ml-auto text-xs text-muted-foreground">Every 5 min</span>
                        </CardContent>
                    </Card>
                </div>

                <Deferred data="integrations" fallback={<IntegrationsTableSkeleton />}>
                {() => <>
                {integrations.length === 0 ? (
                    <Card>
                        <CardContent className="py-14 text-center text-muted-foreground">
                            No stores connected yet.
                        </CardContent>
                    </Card>
                ) : (
                    <Card
                        className="w-full min-w-0 max-w-full overflow-hidden border-border/70 shadow-sm"
                    >
                        <CardHeader className="flex flex-row items-center justify-between gap-4 border-b bg-muted/20 px-5 py-4 sm:px-6">
                            <div>
                            <CardTitle>Connected stores</CardTitle>
                            <CardDescription className="mt-1">Manage access, accepted markets, and order sync.</CardDescription>
                            </div>
                            <Badge variant="secondary" className="shrink-0">{integrations.length} {integrations.length === 1 ? 'store' : 'stores'}</Badge>
                        </CardHeader>
                        <CardContent className="min-w-0 p-3 sm:p-4">
                            <div className="w-full min-w-0 max-w-full overflow-x-auto rounded-lg border bg-background">
                                <Table className="min-w-[900px]">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Store</TableHead>
                                            <TableHead>Merchant</TableHead>
                                            <TableHead>Allowed countries</TableHead>
                                            <TableHead>Order prefix</TableHead>
                                            <TableHead>Synced</TableHead>
                                            <TableHead>State</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {integrations.map((integration) => (
                                            <React.Fragment key={integration.id}>
                                            <TableRow key={integration.id}>
                                                <TableCell>
                                                    <div className="font-medium">{integration.store_name}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        token {integration.token_hint}
                                                    </div>
                                                </TableCell>
                                                <TableCell>{integration.merchant}</TableCell>
                                                <TableCell>
                                                    <div className="max-w-48 text-sm leading-5">
                                                        {(integration.allowed_countries ?? [integration.country]).join(', ') || 'No countries allowed'}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="secondary" className="font-mono">
                                                        {integration.order_no_prefix}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    <div>{integration.orders_synced} staged</div>
                                                    <div className="text-xs">
                                                        {integration.last_synced_at ?? 'never'}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    {integration.last_error ? (
                                                        <Badge variant="destructive" title={integration.last_error}>
                                                            Error
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant={integration.is_enabled ? 'secondary' : 'outline'}>
                                                            {integration.is_enabled ? 'Enabled' : 'Disabled'}
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            aria-label={`${expandedId === integration.id ? 'Hide' : 'Show'} recent orders for ${integration.store_name}`}
                                                            aria-expanded={expandedId === integration.id}
                                                            onClick={() => void toggleOrders(integration)}
                                                            className="gap-1.5"
                                                        >
                                                            {expandedId === integration.id ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                                                            Orders
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            disabled={busyId === integration.id}
                                                            onClick={() => runAction(integration, 'test')}
                                                            className="gap-2"
                                                        >
                                                            {busyId === integration.id ? (
                                                                <Loader2 className="size-4 animate-spin" />
                                                            ) : (
                                                                <RefreshCw className="size-4" />
                                                            )}
                                                            Test
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            disabled={busyId === integration.id}
                                                            onClick={() => runAction(integration, 'sync')}
                                                            className="gap-2"
                                                        >
                                                            <RefreshCw className="size-4" />
                                                            Sync now
                                                        </Button>
                                                        {!isMerchant ? (
                                                            <Button size="sm" variant="ghost" onClick={() => openEdit(integration)}>
                                                                Edit
                                                            </Button>
                                                        ) : null}
                                                        {!isMerchant ? (
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="text-destructive"
                                                                onClick={() => setPendingDelete(integration)}
                                                            >
                                                                <Trash2 className="size-4" />
                                                            </Button>
                                                        ) : null}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                            {expandedId === integration.id ? (
                                                <TableRow key={`${integration.id}-orders`}>
                                                    <TableCell colSpan={8} className="bg-muted/30 p-0">
                                                        <div className="space-y-3 p-4">
                                                            <div>
                                                                <h3 className="text-sm font-medium">Recent picked orders</h3>
                                                                <p className="text-xs text-muted-foreground">Up to 25 orders fetched from Storeep, with their import progress.</p>
                                                            </div>
                                                            {ordersLoadingId === integration.id ? (
                                                                <div className="space-y-2" role="status" aria-label="Loading recent orders">
                                                                    {[1, 2, 3].map((item) => <div key={item} className="h-8 animate-pulse rounded-md bg-muted" />)}
                                                                </div>
                                                            ) : (ordersByIntegration[integration.id] ?? []).length === 0 ? (
                                                                <p className="rounded-md border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">No orders have been staged for this integration yet.</p>
                                                            ) : (
                                                                <div className="max-h-80 overflow-auto rounded-md border bg-card">
                                                                    <Table>
                                                                        <TableHeader>
                                                                            <TableRow>
                                                                                <TableHead>Order</TableHead><TableHead>Customer</TableHead><TableHead>Country</TableHead>
                                                                                <TableHead>Items</TableHead><TableHead>Qty</TableHead><TableHead>Amount</TableHead><TableHead>Order status</TableHead><TableHead>Import state</TableHead>
                                                                            </TableRow>
                                                                        </TableHeader>
                                                                        <TableBody>
                                                                            {(ordersByIntegration[integration.id] ?? []).map((order) => (
                                                                                <TableRow key={order.id}>
                                                                                    <TableCell className="font-mono text-xs">{order.order_no}</TableCell>
                                                                                    <TableCell>{order.client_name || '—'}</TableCell>
                                                                                    <TableCell>{order.country || '—'}</TableCell>
                                                                                    <TableCell className="max-w-64 truncate" title={order.product_name ?? undefined}>{order.product_name || '—'}</TableCell>
                                                                                    <TableCell>{order.quantity ?? '—'}</TableCell>
                                                                                    <TableCell>{order.amount == null ? '—' : Number(order.amount).toLocaleString()}</TableCell>
                                                                                    <TableCell>{order.status || 'New order'}</TableCell>
                                                                                    <TableCell>
                                                                                        <Badge
                                                                                            variant={order.import_state === 'failed' ? 'destructive' : order.import_state === 'processed' ? 'secondary' : 'outline'}
                                                                                            title={order.error_message ?? undefined}
                                                                                        >
                                                                                            {IMPORT_STATE_LABELS[order.import_state] ?? order.import_state}
                                                                                        </Badge>
                                                                                    </TableCell>
                                                                                </TableRow>
                                                                            ))}
                                                                        </TableBody>
                                                                    </Table>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ) : null}
                                            </React.Fragment>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                )}
                </>}
                </Deferred>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{isEditing ? 'Edit Storeep store' : 'Connect a Storeep store'}</DialogTitle>
                        <DialogDescription>
                            The token is saved encrypted and never shown again after saving.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={submit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="store_name">Store name</Label>
                            <Input
                                id="store_name"
                                value={data.store_name}
                                onChange={(event) => setData('store_name', event.target.value)}
                                placeholder="OKEA"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="access_token">Access token</Label>
                            <Input
                                id="access_token"
                                type="password"
                                value={data.access_token}
                                onChange={(event) => setData('access_token', event.target.value)}
                                placeholder={isEditing ? 'Leave blank to keep the stored token' : 'Storeep API token'}
                                required={!isEditing}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="sheets_id">Merchant</Label>
                            <Select
                                value={data.sheets_id}
                                onValueChange={(value) => {
                                    setData('sheets_id', value);

                                    // Staff picking a merchant get that merchant's
                                    // country suggested, but can still override it.
                                    const sheet = sheets.find((item) => String(item.id) === value);

                                    if (sheet?.country && (!data.id || !Object.values(countryNames).includes(data.country))) {
                                        setData('country', sheet.country);
                                    }
                                    if (sheet?.country && !data.id) {
                                        setData('allowed_countries', [canonicalCountryName(sheet.country)]);
                                    }
                                }}
                            >
                                <SelectTrigger id="sheets_id">
                                    <SelectValue placeholder="Choose a merchant" />
                                </SelectTrigger>
                                <SelectContent>
                                    {sheets.map((sheet) => (
                                        <SelectItem key={sheet.id} value={String(sheet.id)}>
                                            {/* A merchant can hold several sheets across
                                                countries, so the country disambiguates. */}
                                            <span className="flex w-full items-center justify-between gap-4">
                                                <span className="truncate">{sheet.sheet_name}</span>
                                                {sheet.country ? (
                                                    <span className="shrink-0 text-xs text-muted-foreground">
                                                        {sheet.country}
                                                    </span>
                                                ) : null}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                Orders are filed under this merchant&apos;s name.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label>Allowed order countries</Label>
                            <Input
                                value={countrySearch}
                                onChange={(event) => setCountrySearch(event.target.value)}
                                placeholder="Search countries..."
                                aria-label="Search allowed order countries"
                            />
                            <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-2">
                                {Object.entries(countryNames)
                                    .filter(([iso, name]) => `${name} ${iso}`.toLowerCase().includes(countrySearch.toLowerCase()))
                                    .map(([iso, name]) => {
                                        const checked = data.allowed_countries.includes(name);
                                        return (
                                            <label key={iso} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
                                                <Checkbox
                                                    checked={checked}
                                                    onCheckedChange={(next) => {
                                                        const countries = next
                                                            ? [...new Set([...data.allowed_countries, name])]
                                                            : data.allowed_countries.filter((country) => country !== name);
                                                        setData('allowed_countries', countries);
                                                        if (!data.country && countries.length > 0) setData('country', countries[0]);
                                                    }}
                                                />
                                                <span>{name}</span><span className="ml-auto text-xs text-muted-foreground">{iso}</span>
                                            </label>
                                        );
                                    })}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Only orders whose Storeep market matches a selected country will be inserted. With no countries selected, all incoming orders are skipped.
                            </p>
                            {data.allowed_countries.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                    {data.allowed_countries.map((country) => <Badge key={country} variant="secondary">{country}</Badge>)}
                                </div>
                            ) : <Badge variant="outline">No countries selected</Badge>}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="order_no_prefix">Order number prefix</Label>
                            <Input
                                id="order_no_prefix"
                                value={data.order_no_prefix}
                                onChange={(event) => setData('order_no_prefix', event.target.value.toUpperCase())}
                                placeholder="Leave blank to pick automatically"
                                maxLength={8}
                                disabled={isEditing}
                            />
                            {suggestions.length > 0 && !data.order_no_prefix ? (
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs text-muted-foreground">Suggestions</span>
                                    {suggestions.map((suggestion) => (
                                        <button
                                            key={suggestion}
                                            type="button"
                                            onClick={() => setData('order_no_prefix', suggestion)}
                                            className="rounded-md border px-2 py-0.5 font-mono text-xs hover:bg-accent"
                                        >
                                            {suggestion}
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                            <p className="text-xs text-muted-foreground">
                                Order numbers look like
                                <span className="font-mono">{data.order_no_prefix || suggestions[0] || 'TRI'}1</span> with
                                no separator. Locked once orders exist.
                            </p>
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSubmitting} className="gap-2">
                                {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
                                {isEditing ? 'Save changes' : 'Connect store'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Disconnect {pendingDelete?.store_name}?</DialogTitle>
                        <DialogDescription>
                            No more orders will be imported from this store. Orders already imported are kept.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPendingDelete(null)}>
                            Keep it
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={busyId !== null}
                            onClick={() => pendingDelete && destroy(pendingDelete)}
                            className="gap-2"
                        >
                            {busyId !== null ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : (
                                <Unplug className="size-4" />
                            )}
                            Disconnect
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
