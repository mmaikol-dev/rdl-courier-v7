'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Head, router, useForm } from '@inertiajs/react';
import { Loader2, PlugZap, Plus, RefreshCw, Trash2, Unplug } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

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
    order_no_prefix: string;
}

const emptyForm: IntegrationForm = {
    store_name: '',
    access_token: '',
    sheets_id: '',
    country: '',
    order_no_prefix: '',
};

export default function IntegrationsIndex({ integrations, sheets, countryNames, prefixSuggestions, auth }: PageProps) {
    const { data, setData, post, put, reset } = useForm<IntegrationForm>(emptyForm);
    const [isDialogOpen, setIsDialogOpen] = React.useState(false);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [pendingDelete, setPendingDelete] = React.useState<Integration | null>(null);
    const [busyId, setBusyId] = React.useState<number | null>(null);

    const isEditing = Boolean(data.id);
    const isMerchant = auth.user.roles === 'merchant';

    // A merchant only ever sees their own sheet, so the country follows it
    // rather than being a free choice. Staff pick per store.
    const selectedSheet = sheets.find((sheet) => String(sheet.id) === data.sheets_id);

    React.useEffect(() => {
        if (isMerchant && selectedSheet && !data.country) {
            setData('country', selectedSheet.country);
        }
    }, [data.country, isMerchant, selectedSheet, setData]);

    const openCreate = () => {
        reset();
        setIsDialogOpen(true);
    };

    const openEdit = (integration: Integration) => {
        setData({
            id: integration.id,
            store_name: integration.store_name,
            // Never prefill the token; leaving it blank keeps the stored one.
            access_token: '',
            sheets_id: String(integration.sheets_id),
            country: integration.country,
            order_no_prefix: integration.order_no_prefix,
        });
        setIsDialogOpen(true);
    };

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        setIsSubmitting(true);

        const onFinish = () => {
            setIsSubmitting(false);
            setIsDialogOpen(false);
        };

        if (isEditing) {
            put(`/integrations/${data.id}`, { onFinish });
        } else {
            post('/integrations', { onFinish });
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

            <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold">Integrations</h1>
                        <p className="text-sm text-muted-foreground">
                            Connect order platforms. Credentials are stored per store in the database, so adding a
                            merchant never needs an environment change.
                        </p>
                    </div>

                    <Button onClick={openCreate} className="gap-2">
                        <Plus className="size-4" />
                        Connect Storeep store
                    </Button>
                </div>

                <Alert>
                    <PlugZap className="size-4" />
                    <AlertTitle>Storeep</AlertTitle>
                    <AlertDescription>
                        Orders sync every five minutes and land on the orders board under the merchant you choose.
                        Order numbers are prefixed with a short abbreviation of the store name, for example
                        <span className="font-mono"> TRI1</span>. New orders arrive with a blank status so they show up
                        as fresh work until they are delivered.
                    </AlertDescription>
                </Alert>

                {integrations.length === 0 ? (
                    <Card>
                        <CardContent className="py-14 text-center text-muted-foreground">
                            No stores connected yet.
                        </CardContent>
                    </Card>
                ) : (
                    <Card className="border-border/60 shadow-sm">
                        <CardHeader>
                            <CardTitle>Connected stores</CardTitle>
                            <CardDescription>
                                One row per store and country. A merchant trading in several countries gets one row
                                per market.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto rounded-xl border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Store</TableHead>
                                            <TableHead>Merchant</TableHead>
                                            <TableHead>Country</TableHead>
                                            <TableHead>Order prefix</TableHead>
                                            <TableHead>Synced</TableHead>
                                            <TableHead>State</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {integrations.map((integration) => (
                                            <TableRow key={integration.id}>
                                                <TableCell>
                                                    <div className="font-medium">{integration.store_name}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        token {integration.token_hint}
                                                    </div>
                                                </TableCell>
                                                <TableCell>{integration.merchant}</TableCell>
                                                <TableCell>{integration.country}</TableCell>
                                                <TableCell>
                                                    <Badge variant="secondary" className="font-mono">
                                                        {integration.order_no_prefix}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    <div>{integration.orders_synced} order(s)</div>
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
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                )}
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

                                    if (sheet?.country && !Object.values(countryNames).includes(data.country)) {
                                        setData('country', sheet.country);
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
                            <Label htmlFor="country">Country</Label>
                            <Select
                                value={data.country}
                                onValueChange={(value) => setData('country', value)}
                                disabled={isMerchant}
                            >
                                <SelectTrigger id="country">
                                    <SelectValue placeholder="Choose a country" />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(countryNames).map(([iso, name]) => (
                                        <SelectItem key={iso} value={name}>
                                            {name} ({iso})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                Add the store again for each new country it sells in. No code change needed.
                            </p>
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
