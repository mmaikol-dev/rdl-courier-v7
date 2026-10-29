import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ControlStrip, DashboardHeader, Footnote, Panel } from '@/components/api-dashboard/blueprint';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { csrfHeaders } from '@/lib/csrf';
import { Deferred, Head, Link, router, useForm } from '@inertiajs/react';
import { Activity, BookOpen, ChevronLeft, ChevronRight, Clipboard, KeyRound, LoaderCircle, RefreshCw, Search, Send, ShieldCheck, Trash2, Webhook } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

interface Merchant { id: number; name: string; email: string; merchant_api_enabled: boolean; merchant_api_scopes: string[] | null; }
interface Integration {
    id: number;
    merchant_user_id: number;
    merchant: string | null;
    email: string | null;
    name: string;
    token_prefix: string;
    scopes: string[];
    merchant_allowed_scopes?: string[];
    webhook_url: string | null;
    webhook_events: string[];
    has_webhook_secret: boolean;
    is_active: boolean;
    last_used_at: string | null;
    created_at: string | null;
}
interface Credentials { integration_id: number; token: string | null; webhook_secret: string | null; }
interface NewIntegrationForm { merchant_user_id: string; name: string; scopes: string[]; webhook_url: string; webhook_events: string[]; }
interface IntegrationEdit { name: string; scopes: string[]; webhook_url: string; webhook_events: string[]; is_active: boolean; }

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Merchant API Access', href: '/merchant-api-access' }];
const scopeLabels: Record<string, string> = { 'orders:read': 'Read orders', 'products:read': 'Read products', 'transfers:read': 'Read transfers' };
const eventLabels: Record<string, string> = { 'order.created': 'Order created', 'order.updated': 'Order updated', 'product.created': 'Product created', 'product.updated': 'Product updated', 'transfer.created': 'Transfer sent', 'transfer.returned': 'Transfer returned' };
function ToggleList({ values, selected, onChange, columns = 2, compact = false }: { values: string[]; selected: string[]; onChange: (value: string) => void; columns?: 1 | 2; compact?: boolean }) {
    return <div className={`grid ${compact ? 'gap-1.5' : 'gap-2'} ${columns === 2 ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>{values.map((value) => <label key={value} className={`flex cursor-pointer items-center rounded-lg border transition-colors hover:bg-accent/50 ${compact ? 'min-h-8 gap-1.5 px-2 py-1 text-[10px] leading-tight' : 'min-h-10 gap-2 px-3 py-2 text-sm'}`}>
        <Checkbox className={compact ? 'size-3.5' : undefined} checked={selected.includes(value)} onCheckedChange={() => onChange(value)} />
        <span>{scopeLabels[value] ?? eventLabels[value] ?? value}</span>
    </label>)}</div>;
}

function AccessCardsSkeleton({ cards = 5 }: { cards?: number }) {
    return <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" role="status" aria-label="Loading merchant API access" aria-live="polite">{Array.from({ length: cards }).map((_, index) => <div key={index} className="space-y-3 rounded-lg border p-4"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-36" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>)}</div>;
}

export default function MerchantApiAccess({ integrations = [], merchants = [], canManage, currentMerchant, availableScopes, availableEvents, newCredentials }: {
    integrations: Integration[]; merchants: Merchant[]; canManage: boolean; currentMerchant: Merchant | null; availableScopes: string[]; availableEvents: string[]; newCredentials: Credentials | null;
}) {
    const allowedScopes = canManage ? availableScopes : (currentMerchant?.merchant_api_scopes ?? availableScopes);
    const form = useForm<NewIntegrationForm>({
        merchant_user_id: canManage ? '' : String(currentMerchant?.id ?? ''), name: '', scopes: canManage ? ['orders:read'] : allowedScopes,
        webhook_url: '', webhook_events: [],
    });
    const selectedMerchant = merchants.find((merchant) => String(merchant.id) === form.data.merchant_user_id);
    const formAllowedScopes = canManage ? (selectedMerchant?.merchant_api_scopes ?? availableScopes) : allowedScopes;
    const [edits, setEdits] = React.useState<Record<number, IntegrationEdit>>(() => Object.fromEntries(integrations.map((integration) => {
        const scopeOptions = canManage ? (integration.merchant_allowed_scopes ?? availableScopes) : allowedScopes;
        return [integration.id, { name: integration.name, scopes: integration.scopes.filter((scope) => scopeOptions.includes(scope)), webhook_url: integration.webhook_url ?? '', webhook_events: integration.webhook_events, is_active: integration.is_active }] as const;
    })));
    const [savingId, setSavingId] = React.useState<number | null>(null);
    const [testingWebhookId, setTestingWebhookId] = React.useState<number | null>(null);
    const [rotatingId, setRotatingId] = React.useState<number | null>(null);
    const [credentialRequest, setCredentialRequest] = React.useState<{ integration: Integration; choice: 'token' | 'webhook' | 'both' } | null>(null);
    const [issuedCredentials, setIssuedCredentials] = React.useState<Credentials | null>(null);
    const [credentialsModalOpen, setCredentialsModalOpen] = React.useState(Boolean(newCredentials));
    const [savedWebhookUrls, setSavedWebhookUrls] = React.useState<Record<number, string | null>>({});
    const [webhookSecretConfigured, setWebhookSecretConfigured] = React.useState<Record<number, boolean>>({});
    const [tokenPrefixOverrides, setTokenPrefixOverrides] = React.useState<Record<number, string>>({});
    const [integrationPage, setIntegrationPage] = React.useState(1);
    const [merchantPage, setMerchantPage] = React.useState(1);
    const [createIntegrationOpen, setCreateIntegrationOpen] = React.useState(false);
    const [editingIntegrationId, setEditingIntegrationId] = React.useState<number | null>(null);
    const [merchantSearch, setMerchantSearch] = React.useState('');
    const [integrationSearch, setIntegrationSearch] = React.useState('');
    const [merchantControls, setMerchantControls] = React.useState<Record<number, { enabled: boolean; scopes: string[] }>>(() => Object.fromEntries(merchants.map((merchant) => [merchant.id, {
        enabled: merchant.merchant_api_enabled, scopes: merchant.merchant_api_scopes ?? availableScopes,
    }] as const)));
    React.useEffect(() => {
        if (newCredentials) {
            setIssuedCredentials(null);
            setCredentialsModalOpen(true);
        }
    }, [newCredentials?.integration_id, newCredentials?.token, newCredentials?.webhook_secret]);
    React.useEffect(() => {
        if (!integrations.length) return;
        setEdits(Object.fromEntries(integrations.map((integration) => {
            const scopeOptions = canManage ? (integration.merchant_allowed_scopes ?? availableScopes) : allowedScopes;
            return [integration.id, { name: integration.name, scopes: integration.scopes.filter((scope) => scopeOptions.includes(scope)), webhook_url: integration.webhook_url ?? '', webhook_events: integration.webhook_events, is_active: integration.is_active }] as const;
        })));
    }, [integrations]);
    React.useEffect(() => {
        if (!merchants.length) return;
        setMerchantControls(Object.fromEntries(merchants.map((merchant) => [merchant.id, {
            enabled: merchant.merchant_api_enabled, scopes: merchant.merchant_api_scopes ?? availableScopes,
        }] as const)));
    }, [merchants]);
    const integrationPageSize = 10;
    const filteredIntegrations = integrations.filter((integration) => `${integration.name} ${integration.merchant ?? ''} ${integration.email ?? ''} ${integration.token_prefix}`.toLowerCase().includes(integrationSearch.trim().toLowerCase()));
    const integrationPageCount = Math.max(1, Math.ceil(filteredIntegrations.length / integrationPageSize));
    const safeIntegrationPage = Math.min(integrationPage, integrationPageCount);
    const visibleIntegrations = filteredIntegrations.slice((safeIntegrationPage - 1) * integrationPageSize, safeIntegrationPage * integrationPageSize);
    const merchantPageSize = 10;
    const filteredMerchants = merchants.filter((merchant) => `${merchant.name} ${merchant.email}`.toLowerCase().includes(merchantSearch.trim().toLowerCase()));
    const merchantPageCount = Math.max(1, Math.ceil(filteredMerchants.length / merchantPageSize));
    const safeMerchantPage = Math.min(merchantPage, merchantPageCount);
    const visibleMerchants = filteredMerchants.slice((safeMerchantPage - 1) * merchantPageSize, safeMerchantPage * merchantPageSize);

    const toggle = (values: string[], value: string) => values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
    const requestJson = async (url: string, method: 'POST' | 'PUT', body: Record<string, unknown> = {}) => {
        const response = await fetch(url, {
            method,
            credentials: 'same-origin',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...csrfHeaders() },
            body: JSON.stringify(body),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message ?? `Request failed with HTTP ${response.status}.`);
        return result;
    };
    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        form.post('/merchant-api-access', {
            onSuccess: () => setCreateIntegrationOpen(false),
            onError: () => toast.error('Review the merchant, access scopes, and webhook URL.'),
        });
    };
    const save = (integration: Integration, afterSave?: () => void) => {
        const data = edits[integration.id];
        setSavingId(integration.id);
        void requestJson(`/merchant-api-access/${integration.id}`, 'PUT', data as unknown as Record<string, unknown>)
            .then((result) => {
                setSavedWebhookUrls((previous) => ({ ...previous, [integration.id]: data.webhook_url || null }));
                if (result.webhook_secret) {
                    const current = issuedCredentials?.integration_id === integration.id ? issuedCredentials : newCredentials?.integration_id === integration.id ? newCredentials : null;
                    setIssuedCredentials({ integration_id: integration.id, token: current?.token ?? null, webhook_secret: result.webhook_secret });
                    setWebhookSecretConfigured((previous) => ({ ...previous, [integration.id]: true }));
                    setCredentialsModalOpen(true);
                }
                toast.success(result.message ?? 'Integration settings saved.');
                afterSave?.();
            })
            .catch((error: Error) => toast.error(error.message || 'Could not save these access settings.'))
            .finally(() => setSavingId(null));
    };
    const testWebhook = (integrationId: number) => {
        setTestingWebhookId(integrationId);
        void requestJson(`/merchant-api-access/${integrationId}/test-webhook`, 'POST')
            .then((result) => toast.success(`Webhook accepted · HTTP ${result.status} · ${result.duration_ms} ms`))
            .catch((error: Error) => toast.error(error.message || 'Webhook test failed.'))
            .finally(() => setTestingWebhookId(null));
    };
    const requestNewCredentials = (integration: Integration) => {
        if (rotatingId !== null) return;
        setCredentialRequest({ integration, choice: 'token' });
    };
    const rotateCredentials = () => {
        if (!credentialRequest) return;
        const { integration, choice } = credentialRequest;
        setCredentialRequest(null);
        setRotatingId(integration.id);
        void requestJson(`/merchant-api-access/${integration.id}/rotate`, 'POST', { credentials: choice })
            .then((result) => {
                setIssuedCredentials(result.credentials);
                if (result.token_prefix) setTokenPrefixOverrides((previous) => ({ ...previous, [integration.id]: result.token_prefix }));
                setCredentialsModalOpen(true);
                toast.success(result.message ?? 'Credentials rotated.');
            })
            .catch((error: Error) => toast.error(error.message || 'Could not rotate credentials.'))
            .finally(() => setRotatingId(null));
    };
    const saveMerchantControl = (merchant: Merchant) => {
        const access = merchantControls[merchant.id];
        router.patch(`/merchant-api-access/merchants/${merchant.id}/access`, { merchant_api_enabled: access.enabled, merchant_api_scopes: access.scopes }, {
            preserveScroll: true,
            onSuccess: () => {
                setEdits((previous) => Object.fromEntries(Object.entries(previous).map(([id, value]) => {
                    const integration = integrations.find((item) => item.id === Number(id));
                    return [id, integration?.merchant_user_id === merchant.id ? { ...value, scopes: value.scopes.filter((scope) => access.scopes.includes(scope)), is_active: access.enabled ? value.is_active : false } : value];
                })));
                toast.success(access.enabled ? 'Merchant API access settings saved.' : 'Merchant API access disabled and tokens revoked.');
            },
                onError: () => toast.error('Could not update merchant API access.'),
        });
    };
    const copy = async (value: string, label: string) => {
        try { await navigator.clipboard.writeText(value); toast.success(`${label} copied.`); }
        catch { toast.error(`Could not copy ${label.toLowerCase()}.`); }
    };
    const credentialsToShow = issuedCredentials ?? newCredentials;

    return <AppLayout breadcrumbs={breadcrumbs}>
        <Head title="Merchant API Access" />
        <div className="w-full space-y-5 p-4 md:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <DashboardHeader title="Merchant API access" summary={canManage ? 'Manage merchant permissions, issue credentials, configure webhooks, and monitor each integration from one place.' : 'Connect your systems to your orders, products, and transfers. Manage your own API keys and webhook destinations.'} />
                <div className="flex flex-wrap gap-2"><Button onClick={() => setCreateIntegrationOpen(true)} disabled={(canManage && !merchants.length) || (!canManage && !currentMerchant?.merchant_api_enabled)}><KeyRound aria-label="Open integration form" className="mr-2 size-4" />Create integration</Button><Button asChild variant="outline"><Link href="/api-dashboard"><Activity aria-label="API dashboard" className="mr-2 size-4" />API health</Link></Button><Button asChild variant="outline"><Link href="/developers/api"><BookOpen aria-label="Developer documentation" className="mr-2 size-4" />Developer docs</Link></Button></div>
            </div>

            <Dialog open={credentialsModalOpen && Boolean(credentialsToShow)} onOpenChange={setCredentialsModalOpen}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader><DialogTitle className="flex items-center gap-2"><ShieldCheck className="size-5" />Copy your new credentials</DialogTitle><DialogDescription>These secrets are shown once. Save them securely; they cannot be viewed again.</DialogDescription></DialogHeader>
                <div className="space-y-3 py-2">
                    {credentialsToShow?.token && <div className="flex min-w-0 items-center gap-2"><Input readOnly value={credentialsToShow.token} className="min-w-0 flex-1 truncate font-mono text-xs" aria-label="New API token" /><Button type="button" variant="outline" className="shrink-0 whitespace-nowrap" onClick={() => copy(credentialsToShow.token!, 'API token')}><Clipboard aria-label="Copy API token" className="mr-2 size-4" />Copy token</Button></div>}
                    {credentialsToShow?.webhook_secret && <div className="flex min-w-0 items-center gap-2"><Input readOnly value={credentialsToShow.webhook_secret} className="min-w-0 flex-1 truncate font-mono text-xs" aria-label="New webhook signing secret" /><Button type="button" variant="outline" className="shrink-0 whitespace-nowrap" onClick={() => copy(credentialsToShow.webhook_secret!, 'Webhook secret')}><Clipboard aria-label="Copy webhook secret" className="mr-2 size-4" />Copy signing secret</Button></div>}
                    {credentialsToShow?.webhook_secret && <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">The integration is saved. Send a signed test event to confirm your webhook receiver works.</p><Button type="button" size="sm" variant="outline" className="shrink-0" disabled={testingWebhookId === credentialsToShow.integration_id} onClick={() => testWebhook(credentialsToShow.integration_id)}>{testingWebhookId === credentialsToShow.integration_id ? <LoaderCircle aria-label="Sending test webhook" className="mr-2 size-4 animate-spin" /> : <Send aria-label="Test webhook" className="mr-2 size-4" />}Test webhook</Button></div>}
                </div>
                <Footnote>Credentials are returned once by the server and are not stored in readable form.</Footnote>
                    <DialogFooter><DialogClose asChild><Button type="button" variant="outline">Done</Button></DialogClose></DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(credentialRequest)} onOpenChange={(open) => { if (!open) setCredentialRequest(null); }}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Choose credentials to replace</DialogTitle>
                        <DialogDescription>Select what you want to renew for {credentialRequest?.integration.name}. Replacing a credential immediately invalidates its current value.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-2">
                        {([
                            ['token', 'API token', 'The current API token will stop working.'],
                            ['webhook', 'Webhook signing secret', 'Webhook signatures must use the new secret.'],
                            ['both', 'Both credentials', 'Both current credentials will stop working.'],
                        ] as const).map(([value, label, description]) => <label key={value} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-accent/50">
                            <Checkbox checked={credentialRequest?.choice === value} onCheckedChange={() => setCredentialRequest((current) => current ? { ...current, choice: value } : current)} />
                            <span><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-muted-foreground">{description}</span></span>
                        </label>)}
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                        <Button type="button" disabled={!credentialRequest || rotatingId !== null} onClick={rotateCredentials}>{rotatingId !== null && <LoaderCircle className="mr-2 size-4 animate-spin" />}Replace selected credentials</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {!canManage && currentMerchant && !currentMerchant.merchant_api_enabled && <Panel className="border-dashed p-4"><p className="text-sm font-medium">API access is disabled</p><p className="mt-1 text-xs text-muted-foreground">Ask an administrator to enable self-service access for your merchant account.</p></Panel>}

            {canManage && <Panel className="overflow-hidden">
                <Deferred data="merchants" fallback={<><ControlStrip label="Merchant self-service access" /><AccessCardsSkeleton /></>}>
                {() => <>
                <ControlStrip label="Merchant self-service access"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4"><p className="text-xs text-muted-foreground">Disable an account to revoke its active keys immediately.</p><div className="relative w-full sm:w-64"><Search aria-label="Search merchants" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={merchantSearch} onChange={(event) => { setMerchantSearch(event.target.value); setMerchantPage(1); }} placeholder="Search name or email" aria-label="Search merchants by name or email" className="h-9 pl-9" /></div></div></ControlStrip>
                {merchants.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No merchant accounts are available.</p> : <>
                    {filteredMerchants.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No merchants match “{merchantSearch}”.</p> : <>
                    <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                    {visibleMerchants.map((merchant) => <section key={merchant.id} className="flex min-w-0 flex-col rounded-lg border p-4">
                        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-semibold" title={merchant.name}>{merchant.name}</h3><p className="mt-1 truncate text-xs text-muted-foreground" title={merchant.email}>{merchant.email}</p></div><Badge variant={merchantControls[merchant.id]?.enabled ? 'secondary' : 'outline'}>{merchantControls[merchant.id]?.enabled ? 'Enabled' : 'Disabled'}</Badge></div>
                        <label className="mt-4 flex items-center gap-2 text-xs"><Checkbox checked={merchantControls[merchant.id]?.enabled ?? false} onCheckedChange={(checked) => setMerchantControls((previous) => ({ ...previous, [merchant.id]: { ...previous[merchant.id], enabled: checked === true } }))} />Allow API self-service</label>
                        <div className="mt-3"><p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Allowed resources</p><ToggleList compact columns={1} values={availableScopes} selected={merchantControls[merchant.id]?.scopes ?? []} onChange={(scope) => setMerchantControls((previous) => ({ ...previous, [merchant.id]: { ...previous[merchant.id], scopes: toggle(previous[merchant.id]?.scopes ?? [], scope) } }))} /></div>
                        <Button size="sm" variant="outline" className="mt-4 w-full" onClick={() => saveMerchantControl(merchant)}>Save merchant access</Button>
                    </section>)}
                    </div>
                    <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="font-mono text-xs tabular-nums text-muted-foreground">Showing {(safeMerchantPage - 1) * merchantPageSize + 1}–{Math.min(safeMerchantPage * merchantPageSize, filteredMerchants.length)} of {filteredMerchants.length} merchants · page {safeMerchantPage} of {merchantPageCount}</p>
                        <div className="flex items-center gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setMerchantPage((page) => Math.max(1, page - 1))} disabled={safeMerchantPage <= 1}><ChevronLeft aria-label="Previous merchant page" className="mr-1 size-4" />Previous</Button><Button type="button" size="sm" variant="outline" onClick={() => setMerchantPage((page) => Math.min(merchantPageCount, page + 1))} disabled={safeMerchantPage >= merchantPageCount}>Next<ChevronRight aria-label="Next merchant page" className="ml-1 size-4" /></Button></div>
                    </div>
                    </>}
                </>}
                <Footnote>Merchant-level access limits the resources that every integration under that account can read.</Footnote>
                </>}
                </Deferred>
            </Panel>}

            <Sheet open={createIntegrationOpen} onOpenChange={setCreateIntegrationOpen}>
                <SheetContent side="right" className="w-full gap-0 overflow-hidden p-0 sm:max-w-xl">
                    <SheetHeader className="border-b p-5 pr-14 text-left"><SheetTitle>Create integration</SheetTitle><SheetDescription>{canManage ? 'Choose a merchant, grant resource permissions, and configure optional webhooks.' : 'Create a key for your merchant account and choose what it can access.'}</SheetDescription></SheetHeader>
                    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
                        <div className="flex-1 space-y-5 overflow-y-auto p-5">
                            <div className="space-y-2"><Label>Merchant account</Label>{canManage ? <><Select value={form.data.merchant_user_id} onValueChange={(value) => { const merchant = merchants.find((option) => String(option.id) === value); form.setData({ ...form.data, merchant_user_id: value, scopes: merchant?.merchant_api_scopes ?? availableScopes }); }}><SelectTrigger><SelectValue placeholder="Select merchant" /></SelectTrigger><SelectContent>{merchants.map((merchant) => <SelectItem key={merchant.id} value={String(merchant.id)}>{merchant.name} · {merchant.email}</SelectItem>)}</SelectContent></Select>{form.errors.merchant_user_id && <p className="text-xs text-destructive">{form.errors.merchant_user_id}</p>}</> : <Input readOnly value={currentMerchant ? `${currentMerchant.name} · ${currentMerchant.email}` : ''} />}</div>
                            <div className="space-y-2"><Label htmlFor="integration-name">Integration name</Label><Input id="integration-name" value={form.data.name} onChange={(event) => form.setData('name', event.target.value)} placeholder="Merchant storefront" required />{form.errors.name && <p className="text-xs text-destructive">{form.errors.name}</p>}</div>
                            <div className="space-y-2"><Label>API permissions</Label><ToggleList values={formAllowedScopes} selected={form.data.scopes} onChange={(scope) => form.setData('scopes', toggle(form.data.scopes, scope))} />{form.errors.scopes && <p className="text-xs text-destructive">{form.errors.scopes}</p>}</div>
                            <div className="space-y-2"><Label htmlFor="webhook-url">Webhook URL <span className="font-normal text-muted-foreground">optional</span></Label><Input id="webhook-url" type="url" value={form.data.webhook_url} onChange={(event) => form.setData('webhook_url', event.target.value)} placeholder="https://merchant.example/webhooks/rdl" /><p className="text-xs text-muted-foreground">We’ll POST signed events to this HTTPS address.</p>{form.errors.webhook_url && <p className="text-xs text-destructive">{form.errors.webhook_url}</p>}</div>
                            <div className="space-y-2"><Label className="flex items-center gap-2"><Webhook aria-label="Webhook events" className="size-4" />Webhook events</Label><ToggleList values={availableEvents} selected={form.data.webhook_events} onChange={(value) => form.setData('webhook_events', toggle(form.data.webhook_events, value))} /></div>
                        </div>
                        <SheetFooter className="border-t p-5"><Button type="submit" className="w-full" disabled={form.processing || (canManage && !merchants.length) || (!canManage && !currentMerchant?.merchant_api_enabled) || form.data.scopes.length === 0}>{form.processing ? <LoaderCircle aria-label="Creating token" className="mr-2 size-4 animate-spin" /> : <KeyRound aria-label="Create token" className="mr-2 size-4" />}Create access token</Button></SheetFooter>
                    </form>
                </SheetContent>
            </Sheet>

            <Deferred data="integrations" fallback={<section className="space-y-3"><DashboardHeader title={canManage ? 'Existing integrations' : 'Your integrations'} summary="Edit access, rotate credentials, and configure event delivery for each connection." /><AccessCardsSkeleton cards={6} /></section>}>
            {() => <section className="space-y-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><DashboardHeader title={canManage ? 'Existing integrations' : 'Your integrations'} summary="Edit access, rotate credentials, and configure event delivery for each connection." /><div className="flex flex-col gap-2 sm:flex-row sm:items-center"><div className="relative w-full sm:w-72"><Search aria-label="Search integrations" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={integrationSearch} onChange={(event) => { setIntegrationSearch(event.target.value); setIntegrationPage(1); }} placeholder="Search integrations" aria-label="Search by integration, merchant, email, or token" className="h-9 pl-9" /></div><span className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">{filteredIntegrations.length} of {integrations.length} integrations</span></div></div>
                {integrations.length === 0 ? <Panel className="p-10 text-center"><KeyRound aria-label="No integrations" className="mx-auto size-5 text-muted-foreground" /><p className="mt-3 text-sm">No merchant API integrations yet</p><p className="mt-1 text-xs text-muted-foreground">Create an integration above to issue the first key.</p></Panel> : <>
                    {filteredIntegrations.length === 0 ? <Panel className="p-10 text-center"><Search aria-label="No matching integrations" className="mx-auto size-5 text-muted-foreground" /><p className="mt-3 text-sm">No integrations match “{integrationSearch}”.</p></Panel> : <>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                    {visibleIntegrations.map((integration) => {
                    const integrationScopes = canManage ? (integration.merchant_allowed_scopes ?? availableScopes) : allowedScopes;
                    const edit = edits[integration.id] ?? { name: integration.name, scopes: integration.scopes.filter((scope) => integrationScopes.includes(scope)), webhook_url: integration.webhook_url ?? '', webhook_events: integration.webhook_events, is_active: integration.is_active };
                    const configuredWebhookUrl = Object.prototype.hasOwnProperty.call(savedWebhookUrls, integration.id) ? savedWebhookUrls[integration.id] : integration.webhook_url;
                    const webhookUrlNeedsSave = Boolean(edit.webhook_url) && edit.webhook_url !== (configuredWebhookUrl ?? '');
                    const setField = <K extends keyof IntegrationEdit>(key: K, value: IntegrationEdit[K]) => setEdits((previous) => ({ ...previous, [integration.id]: { ...edit, [key]: value } }));
                    return <Panel key={integration.id} className="flex min-w-0 flex-col overflow-hidden">
                        <div className="border-b p-3">
                            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-semibold" title={integration.name}>{integration.name}</h3><p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{tokenPrefixOverrides[integration.id] ?? integration.token_prefix}••••</p></div><Badge variant={edit.is_active ? 'secondary' : 'outline'}>{edit.is_active ? 'Active' : 'Revoked'}</Badge></div>
                            {canManage && <p className="mt-2 truncate text-[10px] text-muted-foreground" title={`${integration.merchant} · ${integration.email}`}>{integration.merchant ?? 'Merchant'}</p>}
                            <p className="mt-1 truncate text-[10px] text-muted-foreground">Last used · {integration.last_used_at ?? 'Never'}</p>
                            <div className="mt-3 flex gap-2"><Button type="button" size="sm" variant="outline" className="h-8 flex-1 px-2 text-xs" disabled={rotatingId !== null} onClick={() => requestNewCredentials(integration)}>{rotatingId === integration.id ? <LoaderCircle aria-label="Rotating credentials" className="mr-1.5 size-3.5 animate-spin" /> : <RefreshCw aria-label="Rotate credentials" className="mr-1.5 size-3.5" />}New credentials</Button><Button size="sm" variant="outline" className="h-8 flex-1 px-2 text-xs" onClick={() => router.delete(`/merchant-api-access/${integration.id}`, { preserveScroll: true, onSuccess: () => setField('is_active', false), onError: () => toast.error('Could not revoke access.') })}><Trash2 aria-label="Revoke integration" className="mr-1.5 size-3.5" />Revoke</Button></div>
                        </div>
                        <Dialog open={editingIntegrationId === integration.id} onOpenChange={(open) => setEditingIntegrationId(open ? integration.id : null)}>
                            <DialogTrigger asChild><Button type="button" variant="ghost" className="w-full justify-start rounded-none px-3 py-2.5 text-xs font-medium text-muted-foreground">Edit integration settings</Button></DialogTrigger>
                            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                                <DialogHeader className="rounded-xl border bg-muted/20 p-4"><DialogTitle className="flex items-center gap-2"><KeyRound className="size-4 text-primary" />Edit {integration.name}</DialogTitle><DialogDescription>Manage the integration identity, data access, and webhook delivery settings.</DialogDescription></DialogHeader>
                            <div className="divide-y rounded-xl border">
                                <div className="grid gap-2 p-4 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center"><div><Label>Integration name</Label><p className="mt-1 text-[10px] text-muted-foreground">Shown in your access dashboard.</p></div><Input className="h-9" value={edit.name} onChange={(event) => setField('name', event.target.value)} /></div>
                                <div className="grid gap-3 p-4 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-start"><div><Label>Webhook endpoint</Label><p className="mt-1 text-[10px] text-muted-foreground">Public HTTPS URL for event delivery.</p></div><div className="space-y-2"><div className="flex flex-col gap-2 sm:flex-row"><Input className="h-9 min-w-0 flex-1" type="url" value={edit.webhook_url} onChange={(event) => setField('webhook_url', event.target.value)} placeholder="https://merchant.example/webhooks/rdl" /><Button type="button" size="sm" variant="outline" className="shrink-0" disabled={!edit.webhook_url || savingId === integration.id || testingWebhookId === integration.id} onClick={() => webhookUrlNeedsSave ? save(integration, () => testWebhook(integration.id)) : testWebhook(integration.id)}>{testingWebhookId === integration.id ? <LoaderCircle aria-label="Sending test webhook" className="mr-2 size-4 animate-spin" /> : <Send aria-label="Test webhook" className="mr-2 size-4" />}{webhookUrlNeedsSave ? 'Save and test' : 'Send test'}</Button></div><p className="text-[10px] text-muted-foreground">A changed endpoint is saved before the signed <code>integration.test</code> event is sent.</p></div></div>
                                <div className="grid gap-3 p-4 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-start"><div><Label>API permissions</Label><p className="mt-1 text-[10px] text-muted-foreground">Choose which resources this key can read.</p></div><ToggleList columns={2} values={integrationScopes} selected={edit.scopes} onChange={(value) => setField('scopes', toggle(edit.scopes, value))} /></div>
                                <div className="grid gap-3 p-4 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-start"><div><Label className="flex items-center gap-2"><Webhook aria-label="Webhook events" className="size-4" />Webhook events</Label><p className="mt-1 text-[10px] text-muted-foreground">Choose which changes trigger a delivery.</p></div><ToggleList columns={2} values={availableEvents} selected={edit.webhook_events} onChange={(value) => setField('webhook_events', toggle(edit.webhook_events, value))} /></div>
                                <div className="grid gap-2 p-4 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center"><span className="text-xs font-medium">Signing secret</span><div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 text-[10px] text-muted-foreground"><ShieldCheck className="size-4 shrink-0 text-primary" />{(webhookSecretConfigured[integration.id] ?? integration.has_webhook_secret) ? 'Configured · value is hidden for security.' : 'Not configured yet. Saving a webhook URL creates one.'}</div></div>
                                <div className="flex items-center justify-between gap-4 p-4"><div><p className="text-xs font-medium">Integration access</p><p className="mt-1 text-[10px] text-muted-foreground">Turn off to prevent this key from accessing data.</p></div><label className="flex shrink-0 items-center gap-2 text-xs"><Checkbox checked={edit.is_active} disabled={!canManage && !integration.is_active} onCheckedChange={(checked) => setField('is_active', checked === true)} />Active</label></div>
                            </div>
                                <DialogFooter><DialogClose asChild><Button type="button" variant="outline">Close</Button></DialogClose><Button type="button" onClick={() => save(integration)} disabled={savingId === integration.id || edit.scopes.length === 0}>{savingId === integration.id && <LoaderCircle aria-label="Saving" className="mr-2 size-4 animate-spin" />}Save settings</Button></DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </Panel>;
                    })}
                    </div>
                    <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="font-mono text-xs tabular-nums text-muted-foreground">Showing {(safeIntegrationPage - 1) * integrationPageSize + 1}–{Math.min(safeIntegrationPage * integrationPageSize, filteredIntegrations.length)} of {filteredIntegrations.length} integrations · page {safeIntegrationPage} of {integrationPageCount}</p>
                        <div className="flex items-center gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setIntegrationPage((page) => Math.max(1, page - 1))} disabled={safeIntegrationPage <= 1}><ChevronLeft aria-label="Previous page" className="mr-1 size-4" />Previous</Button><Button type="button" size="sm" variant="outline" onClick={() => setIntegrationPage((page) => Math.min(integrationPageCount, page + 1))} disabled={safeIntegrationPage >= integrationPageCount}>Next<ChevronRight aria-label="Next page" className="ml-1 size-4" /></Button></div>
                    </div>
                    </>}
                </>}
            </section>}
            </Deferred>

            <Panel className="overflow-hidden">
                <ControlStrip label="API reference"><p className="text-xs text-muted-foreground">Authenticated endpoints · responses are restricted to the merchant attached to each key.</p></ControlStrip>
                <div className="grid gap-3 p-4 sm:grid-cols-3">{['orders', 'products', 'transfers'].map((resource) => <div key={resource} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-3"><div className="flex min-w-0 items-center gap-2"><Badge variant="outline" className="font-mono text-[10px]">GET</Badge><code className="truncate text-xs">/api/merchant/v1/{resource}</code></div><Clipboard aria-label={`${resource} endpoint`} className="size-3.5 shrink-0 text-muted-foreground" /></div>)}</div>
                <Footnote>The transfers endpoint includes sent and returned stock movements, identified by <code>movement_type</code>. Subscribe to <code>transfer.created</code> and <code>transfer.returned</code> for webhooks. Use <code>per_page</code> (up to 100) and <code>updated_since</code> to sync incrementally. Webhooks are signed with HMAC SHA-256 in <code>X-RDL-Signature</code>.</Footnote>
            </Panel>
        </div>
    </AppLayout>;
}
