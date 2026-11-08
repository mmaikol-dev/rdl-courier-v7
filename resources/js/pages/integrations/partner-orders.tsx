'use client';

import { ConfirmAction } from '@/components/confirm-action';
import { Integrations, type Integration as IntegrationCard } from '@/components/integrations';
import { NumberRoll } from '@/components/number-roll';
import { RelativeTime } from '@/components/relative-time';
import { StatusButton, type ActionStatus } from '@/components/status-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { ControlStrip, DashboardHeader, Footnote, Panel } from '@/components/api-dashboard/blueprint';
import AppLayout from '@/layouts/app-layout';
import { toast } from '@/lib/toast';
import { type BreadcrumbItem } from '@/types';
import { Deferred, Head, router, useForm } from '@inertiajs/react';
import { Activity, ArrowLeft, PlugZap, RefreshCw, Save, Trash2 } from 'lucide-react';
import * as React from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/dashboard' },
    { title: 'Integrations', href: '/integrations' },
    { title: 'Partner API Orders', href: '/integrations/partner-orders' },
];

interface SheetOption { id: number; sheet_name: string; country: string | null }
interface PartnerIntegration {
    id: number; name: string; provider: string; merchant: string | null; sheets_id: number;
    base_url: string; country_code: string; since_date: string; enabled: boolean;
    last_synced_at: string | null; orders_synced: number; last_error: string | null; has_key: boolean;
}
interface Props extends Record<string, unknown> {
    integrations: PartnerIntegration[]; sheets: SheetOption[]; canManage: boolean; today: string;
    storageError?: string | null;
    flash?: { success?: string; error?: string };
}
interface FormData {
    integration_name: string; sheets_id: string; base_url: string; api_key: string;
    country_code: string; since_date: string;
}

const EMPTY_INTEGRATIONS: PartnerIntegration[] = [];
const EMPTY_SHEETS: SheetOption[] = [];

const emptyForm = (today: string): FormData => ({
    integration_name: 'Healthily Vitae', sheets_id: '',
    base_url: 'https://healthilyvitae.com/wp-json/hv-partner/v1',
    api_key: '', country_code: 'KE', since_date: today,
});

function PartnerCardsSkeleton() {
    return <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading partner integrations" aria-live="polite">
        {Array.from({ length: 3 }, (_, index) => <div key={index} className="space-y-3 rounded-lg border p-4">
            <Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-48" />
            <Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-2/3" />
        </div>)}
    </div>;
}

function toIntegrationCard(item: PartnerIntegration): IntegrationCard {
    return {
        id: String(item.id), name: item.name,
        description: `${item.merchant ?? 'Merchant'} · ${item.country_code} order feed`,
        category: 'Order feeds', icon: <PlugZap className="size-4" />,
        account: item.enabled ? { name: 'Enabled', detail: `${item.orders_synced} orders staged` } : null,
        scopes: [item.provider, `Since ${item.since_date}`],
    };
}

export default function PartnerOrders({ integrations = EMPTY_INTEGRATIONS, sheets = EMPTY_SHEETS, canManage, flash, today, storageError }: Props) {
    const form = useForm<FormData>(emptyForm(today));
    const [editing, setEditing] = React.useState<PartnerIntegration | null>(null);
    const [sheetOpen, setSheetOpen] = React.useState(false);
    const [actionStatus, setActionStatus] = React.useState<Record<string, ActionStatus>>({});
    const [integrationCards, setIntegrationCards] = React.useState<IntegrationCard[]>(() => integrations.map(toIntegrationCard));
    const totalOrders = integrations.reduce((sum, item) => sum + item.orders_synced, 0);

    React.useEffect(() => {
        setIntegrationCards(integrations.map(toIntegrationCard));
    }, [integrations]);

    React.useEffect(() => {
        if (flash?.success) toast.success(flash.success);
        if (flash?.error) toast.error(flash.error);
    }, [flash?.success, flash?.error]);

    const openCreate = () => {
        setEditing(null);
        form.setData(emptyForm(today));
        form.clearErrors();
        setSheetOpen(true);
    };

    const openEdit = (item: PartnerIntegration) => {
        setEditing(item);
        form.setData({
            integration_name: item.name,
            sheets_id: String(item.sheets_id),
            base_url: item.base_url,
            api_key: '',
            country_code: item.country_code,
            since_date: item.since_date,
        });
        form.clearErrors();
        setSheetOpen(true);
    };

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        const options = {
            onSuccess: () => {
                setSheetOpen(false);
                setEditing(null);
                form.setData(emptyForm(today));
            },
            onError: (errors: Record<string, string>) => toast.error(Object.values(errors)[0] ?? 'Could not save this integration.'),
        };
        if (editing) form.put(`/integrations/partner-orders/${editing.id}`, options);
        else form.post('/integrations/partner-orders', options);
    };

    const toggleEnabled = (item: PartnerIntegration, enabled: boolean) => new Promise<{ name: string; detail?: string }>((resolve, reject) => {
        router.patch(`/integrations/partner-orders/${item.id}/enabled`, { enabled }, {
            onSuccess: () => resolve({ name: enabled ? 'Enabled' : 'Disabled', detail: `${item.orders_synced} orders staged` }),
            onError: (errors) => reject(new Error(Object.values(errors)[0] ?? 'Could not update the connection state.')),
        });
    });

    const runAction = (item: PartnerIntegration, kind: 'test' | 'sync') => {
        const key = `${kind}:${item.id}`;
        setActionStatus((current) => ({ ...current, [key]: 'pending' }));
        router.post(`/integrations/partner-orders/${item.id}/${kind}`, {}, {
            onSuccess: (page) => {
                const hasError = Boolean((page.props as unknown as { flash?: { error?: string } }).flash?.error);
                setActionStatus((current) => ({ ...current, [key]: hasError ? 'error' : 'success' }));
            },
            onError: (errors) => {
                setActionStatus((current) => ({ ...current, [key]: 'error' }));
                toast.error(Object.values(errors)[0] ?? `${kind === 'test' ? 'Connection test' : 'Sync'} failed.`);
            },
            onFinish: () => window.setTimeout(() => setActionStatus((current) => ({ ...current, [key]: 'idle' })), 1800),
        });
    };

    const removeIntegration = (item: PartnerIntegration) => new Promise<void>((resolve, reject) => {
        router.delete(`/integrations/partner-orders/${item.id}`, {
            onSuccess: () => resolve(),
            onError: (errors) => reject(new Error(Object.values(errors)[0] ?? 'Could not disconnect this partner.')),
        });
    });

    return <AppLayout breadcrumbs={breadcrumbs}>
        <Head title="Partner API Orders" />
        <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 sm:py-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div className="flex items-start gap-3">
                    <a href="/integrations" aria-label="Back to integrations" className="mt-1 grid size-9 shrink-0 place-items-center rounded-full border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><ArrowLeft className="size-4" /></a>
                    <DashboardHeader title="Partner API Orders" summary="Connect partner storefronts and bring their orders into the shared import pipeline. Each provider can have its own adapter while order processing remains shared." />
                </div>
                {canManage && !storageError && <Button onClick={openCreate} className="shrink-0 gap-2"><PlugZap className="size-4" />Connect partner</Button>}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
                <Panel className="flex items-center gap-3 p-4"><span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><PlugZap className="size-4" /></span><div><p className="text-xs text-muted-foreground">Connections</p><p className="font-mono text-xl font-semibold"><NumberRoll value={integrations.length} /></p></div></Panel>
                <Panel className="flex items-center gap-3 p-4"><span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><Activity className="size-4" /></span><div><p className="text-xs text-muted-foreground">Orders staged</p><p className="font-mono text-xl font-semibold"><NumberRoll value={totalOrders} /></p></div></Panel>
                <Panel className="flex items-center gap-3 p-4"><span className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground"><RefreshCw className="size-4" /></span><div><p className="text-xs text-muted-foreground">Sync interval</p><p className="text-sm font-medium">Every five minutes</p></div></Panel>
            </div>

            {storageError ? <Panel role="alert" className="border-destructive/40 p-5"><h2 className="text-sm font-semibold text-destructive">Partner integrations are unavailable</h2><p className="mt-2 text-sm text-muted-foreground">{storageError}</p></Panel> : <Deferred data="integrations" fallback={<Panel className="overflow-hidden"><ControlStrip label="Partner API integrations"><span className="sr-only">Loading partner feeds</span></ControlStrip><PartnerCardsSkeleton /></Panel>}>
                {() => <Panel className="overflow-hidden">
                    <ControlStrip label="Partner API integrations">
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">{integrations.length} connection{integrations.length === 1 ? '' : 's'}</span>
                    </ControlStrip>
                    {integrations.length === 0 ? <div className="p-10 text-center"><PlugZap className="mx-auto size-5 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No partner feeds yet</p><p className="mt-1 text-xs text-muted-foreground">Connect a partner API to start importing its orders.</p></div> : <>
                        <div className="p-3 sm:p-4">
                            <Integrations value={integrationCards} onValueChange={setIntegrationCards} onConnect={(card) => {
                                const item = integrations.find((candidate) => String(candidate.id) === card.id);
                                return item ? toggleEnabled(item, true) : Promise.reject(new Error('Integration was not found.'));
                            }} onDisconnect={(card) => {
                                const item = integrations.find((candidate) => String(candidate.id) === card.id);
                                return item ? toggleEnabled(item, false) : Promise.reject(new Error('Integration was not found.'));
                            }} connectLabel="Enable" connectingLabel="Enabling" connectedLabel="Enabled" connectedCountLabel="enabled" disconnectLabel="Disable" disconnectingLabel="Disabling" title="Partner feed status" description="Pause or resume automatic order imports." />
                        </div>
                        <div className="grid gap-3 border-t bg-muted/10 p-3 sm:grid-cols-2 xl:grid-cols-3 sm:p-4">
                            {integrations.map((item) => <Panel key={item.id} className="flex min-w-0 flex-col overflow-hidden">
                                <div className="flex items-start justify-between gap-3 border-b p-3">
                                    <div className="min-w-0"><h2 className="truncate text-sm font-semibold" title={item.name}>{item.name}</h2><p className="mt-1 truncate text-xs text-muted-foreground">{item.merchant ?? 'Merchant'} · {item.country_code}</p></div>
                                    <Badge variant={item.last_error ? 'destructive' : item.enabled ? 'secondary' : 'outline'}>{item.last_error ? 'Error' : item.enabled ? 'Active' : 'Paused'}</Badge>
                                </div>
                                <div className="flex-1 space-y-2 p-3 text-xs">
                                    <p className="break-all font-mono text-muted-foreground">{item.base_url}</p>
                                    <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Import since</span><span className="font-mono">{item.since_date}</span></div>
                                    <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Orders staged</span><span className="font-mono tabular-nums"><NumberRoll value={item.orders_synced} /></span></div>
                                    <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Last sync</span>{item.last_synced_at ? <RelativeTime date={item.last_synced_at} /> : <span className="text-muted-foreground">Never</span>}</div>
                                    <p className="text-muted-foreground">Credential {item.has_key ? 'encrypted and saved' : 'missing'}</p>
                                    {item.last_error && <p className="break-words rounded-md bg-destructive/10 p-2 text-destructive">{item.last_error}</p>}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 border-t p-3">
                                    <StatusButton size="sm" variant="outline" status={actionStatus[`test:${item.id}`] ?? 'idle'} labels={{ idle: 'Test', pending: 'Testing', success: 'Connected', error: 'Try again' }} onClick={() => runAction(item, 'test')} />
                                    <StatusButton size="sm" variant="outline" icon={<RefreshCw />} status={actionStatus[`sync:${item.id}`] ?? 'idle'} labels={{ idle: 'Sync now', pending: 'Syncing', success: 'Synced', error: 'Try again' }} onClick={() => runAction(item, 'sync')} />
                                    {canManage && <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={() => openEdit(item)}>Edit</Button>}
                                    {canManage && <ConfirmAction icon={<Trash2 />} label={`Disconnect ${item.name}`} labels={{ idle: 'Disconnect', pending: 'Removing', success: 'Removed' }} onConfirm={() => removeIntegration(item)} />}
                                </div>
                            </Panel>)}
                        </div>
                    </>}
                    <Footnote>Imported orders use the existing deduplication, retry, and product matching pipeline. A partner&apos;s status is not treated as delivery confirmation.</Footnote>
                </Panel>}
            </Deferred>}

            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetContent side="right" className="w-full gap-0 overflow-hidden p-0 sm:max-w-xl">
                    <SheetHeader className="border-b p-5 pr-14 text-left"><SheetTitle>{editing ? 'Edit partner connection' : 'Connect partner API'}</SheetTitle><SheetDescription>{editing ? 'Update the endpoint, merchant mapping, country, or import start date. Leave the API key empty to keep the saved credential.' : 'Partner API credentials are encrypted at rest and are never shown after saving.'}</SheetDescription></SheetHeader>
                    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
                        <div className="flex-1 space-y-5 overflow-y-auto p-5">
                            <div className="space-y-2"><Label htmlFor="partner-name">Connection name</Label><Input id="partner-name" value={form.data.integration_name} onChange={(event) => form.setData('integration_name', event.target.value)} required />{form.errors.integration_name && <p className="text-xs text-destructive">{form.errors.integration_name}</p>}</div>
                            <div className="space-y-2"><Label>Merchant</Label><Deferred data="sheets" fallback={<Skeleton className="h-10 w-full" />}><Select value={form.data.sheets_id} onValueChange={(value) => form.setData('sheets_id', value)}><SelectTrigger><SelectValue placeholder="Choose a merchant" /></SelectTrigger><SelectContent>{sheets.map((sheet) => <SelectItem key={sheet.id} value={String(sheet.id)}>{sheet.sheet_name}{sheet.country ? ` · ${sheet.country}` : ''}</SelectItem>)}</SelectContent></Select></Deferred>{form.errors.sheets_id && <p className="text-xs text-destructive">{form.errors.sheets_id}</p>}</div>
                            <div className="space-y-2"><Label htmlFor="partner-url">API base URL</Label><Input id="partner-url" type="url" value={form.data.base_url} onChange={(event) => form.setData('base_url', event.target.value)} required /><p className="text-xs text-muted-foreground">Use the API root, without the final <code>/orders</code> path.</p>{form.errors.base_url && <p className="text-xs text-destructive">{form.errors.base_url}</p>}</div>
                            <div className="space-y-2"><Label htmlFor="partner-key">X-API-Key</Label><Input id="partner-key" type="password" autoComplete="new-password" value={form.data.api_key} onChange={(event) => form.setData('api_key', event.target.value)} placeholder={editing ? 'Leave empty to keep the saved key' : 'Paste partner API key'} required={!editing} />{form.errors.api_key && <p className="text-xs text-destructive">{form.errors.api_key}</p>}</div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2"><Label htmlFor="partner-country">Country code</Label><Input id="partner-country" maxLength={2} value={form.data.country_code} onChange={(event) => form.setData('country_code', event.target.value.toUpperCase())} required />{form.errors.country_code && <p className="text-xs text-destructive">{form.errors.country_code}</p>}</div>
                                <div className="space-y-2"><Label htmlFor="partner-since">Import orders since</Label><Input id="partner-since" type="date" value={form.data.since_date} onChange={(event) => form.setData('since_date', event.target.value)} required />{form.errors.since_date && <p className="text-xs text-destructive">{form.errors.since_date}</p>}</div>
                            </div>
                        </div>
                        <SheetFooter className="border-t p-5"><Button type="submit" className="w-full gap-2" disabled={form.processing}>{form.processing ? <RefreshCw className="size-4 animate-spin" /> : <Save className="size-4" />}{form.processing ? 'Saving…' : editing ? 'Save changes' : 'Connect partner'}</Button></SheetFooter>
                    </form>
                </SheetContent>
            </Sheet>
        </main>
    </AppLayout>;
}
