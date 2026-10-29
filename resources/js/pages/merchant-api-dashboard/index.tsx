import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ControlStrip, DashboardHeader, Footnote, Inspector, Panel, SegmentedChips, Slider, SplitLayout } from '@/components/api-dashboard/blueprint';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Deferred, Head, Link } from '@inertiajs/react';
import { Activity, AlertTriangle, ArrowDown, ArrowUp, Check, Clipboard, Clock3, KeyRound, Search, ShieldCheck, Waypoints, X } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

interface Stats { requests: number; errors: number; latency: number; success_rate: number | null; active_integrations: number; total_integrations: number; }
interface ChartPoint { time: string; requests: number; errors: number; latency: number; }
interface LogRow { id: number; integration: string; method: string; path: string; status_code: number | null; duration_ms: number | null; requested_at: string | null; }
interface EndpointStat { path: string; method: string; requests: number; errors: number; latency: number; slowest: number; last_seen: string; }
interface IntegrationRow { id: number; name: string; merchant: string | null; email: string | null; active: boolean; last_used_at: string | null; requests: number; errors: number; latency: number; }
interface ExternalConnection { id: number; provider: string; name: string; merchant: string | null; active: boolean; has_error: boolean; last_error_at: string | null; last_activity_at: string | null; }
interface DashboardData { stats: Stats; chart: ChartPoint[]; logs: LogRow[]; integrations: IntegrationRow[]; externalConnections: ExternalConnection[]; endpointStats: EndpointStat[]; }
type View = 'Health' | 'Latency' | 'Access logs';
type LogMethod = 'All' | 'GET' | 'POST' | 'PUT' | 'DELETE';
type LogStatus = 'All' | '2xx' | '3xx' | '4xx' | '5xx';
type LatencyMetric = 'Average' | 'Slowest';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'API Dashboard', href: '/api-dashboard' }];
const views: View[] = ['Health', 'Latency', 'Access logs'];
const methods: LogMethod[] = ['All', 'GET', 'POST', 'PUT', 'DELETE'];
const statuses: LogStatus[] = ['All', '2xx', '3xx', '4xx', '5xx'];
const latencyMetrics: LatencyMetric[] = ['Average', 'Slowest'];

function formatDate(value: string | null) {
    if (!value) return 'Never';
    const date = new Date(`${value.replace(' ', 'T')}Z`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function responseLabel(status: number | null) {
    if (status === null) return 'Unknown';
    if (status >= 500) return 'Server error';
    if (status >= 400) return 'Request error';
    if (status >= 300) return 'Redirect';
    return 'Success';
}

function endpointHealth(endpoint: EndpointStat, slo: number) {
    if (endpoint.errors > 0 && endpoint.errors >= endpoint.requests) return 'Down';
    if (endpoint.errors > 0 || endpoint.latency >= slo) return 'Degraded';
    return 'Healthy';
}

function StateIcon({ state }: { state: 'Healthy' | 'Degraded' | 'Down' }) {
    if (state === 'Down') return <X aria-label="Endpoint down" className="size-4" />;
    if (state === 'Degraded') return <AlertTriangle aria-label="Endpoint degraded" className="size-4" />;
    return <Check aria-label="Endpoint healthy" className="size-4" />;
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Activity }) {
    return <Panel className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 truncate font-mono text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><Icon aria-label={label} className="size-4 shrink-0 text-muted-foreground" /></div></Panel>;
}

function TrafficTrace({ data }: { data: ChartPoint[] }) {
    const max = Math.max(...data.map((point) => point.requests), 1);
    return <div className="flex h-28 items-end gap-1 border-b border-l px-2 pb-1" role="img" aria-label="Hourly API requests over the last 24 hours">
        {data.map((point, index) => <div key={`${point.time}-${index}`} className="group relative flex h-full min-w-1 flex-1 items-end" title={`${point.time}: ${point.requests} requests, ${point.errors} errors, ${point.latency} ms average`}>
            <div className="w-full rounded-t-sm bg-foreground/70 transition-opacity group-hover:bg-foreground" style={{ height: `${Math.max((point.requests / max) * 100, point.requests ? 4 : 0)}%` }} />
        </div>)}
    </div>;
}

function MerchantApiDashboardSkeleton() {
    return <AppLayout breadcrumbs={breadcrumbs}><Head title="API Dashboard" /><div className="space-y-5 p-4 md:p-6" role="status" aria-label="Loading API dashboard" aria-live="polite">
        <div className="flex items-end justify-between gap-4"><div className="space-y-2"><Skeleton className="h-7 w-44" /><Skeleton className="h-4 w-72 max-w-full" /></div><Skeleton className="h-9 w-40" /></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="rounded-xl border p-4"><Skeleton className="h-4 w-28" /><Skeleton className="mt-3 h-8 w-24" /><Skeleton className="mt-2 h-3 w-36" /></div>)}</div>
        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]"><div className="space-y-4 rounded-xl border p-4"><Skeleton className="h-5 w-48" /><Skeleton className="h-64 w-full" /><Skeleton className="h-28 w-full" /></div><div className="space-y-4 rounded-xl border p-4"><Skeleton className="h-5 w-40" />{Array.from({ length: 6 }).map((__, row) => <Skeleton key={row} className="h-10 w-full" />)}</div></div>
    </div></AppLayout>;
}

export default function MerchantApiDashboard({ canManage, dashboardData }: { canManage: boolean; dashboardData: DashboardData }) {
    return <Deferred data="dashboardData" fallback={<MerchantApiDashboardSkeleton />}>
        {() => <MerchantApiDashboardContent canManage={canManage} {...dashboardData} />}
    </Deferred>;
}

function MerchantApiDashboardContent({ canManage, stats, chart, logs, integrations, externalConnections, endpointStats }: {
    canManage: boolean; stats: Stats; chart: ChartPoint[]; logs: LogRow[]; integrations: IntegrationRow[]; externalConnections: ExternalConnection[]; endpointStats: EndpointStat[];
}) {
    const [view, setView] = React.useState<View>('Health');
    const [selectedEndpoint, setSelectedEndpoint] = React.useState(0);
    const [slo, setSlo] = React.useState(400);
    const [latencyMetric, setLatencyMetric] = React.useState<LatencyMetric>('Average');
    const [method, setMethod] = React.useState<LogMethod>('All');
    const [status, setStatus] = React.useState<LogStatus>('All');
    const [search, setSearch] = React.useState('');
    const [selectedLogId, setSelectedLogId] = React.useState<number | null>(logs[0]?.id ?? null);

    const sortedEndpoints = React.useMemo(() => [...endpointStats].sort((a, b) => latencyMetric === 'Average' ? b.latency - a.latency : b.slowest - a.slowest), [endpointStats, latencyMetric]);
    const healthEndpoints = endpointStats;
    const activeEndpoint = healthEndpoints[selectedEndpoint] ?? healthEndpoints[0] ?? null;
    const filteredLogs = React.useMemo(() => logs.filter((log) => {
        const matchesMethod = method === 'All' || log.method === method;
        const matchesStatus = status === 'All' || (log.status_code !== null && `${Math.floor(log.status_code / 100)}xx` === status);
        const matchesSearch = !search || `${log.path} ${log.integration} ${log.method}`.toLowerCase().includes(search.toLowerCase());
        return matchesMethod && matchesStatus && matchesSearch;
    }), [logs, method, status, search]);
    const activeLog = filteredLogs.find((log) => log.id === selectedLogId) ?? filteredLogs[0] ?? null;
    const failedLogs = filteredLogs.filter((log) => (log.status_code ?? 500) >= 400).length;
    const failedEndpoints = endpointStats.filter((endpoint) => endpoint.errors > 0 && endpoint.errors >= endpoint.requests).length;
    const degradedEndpoints = endpointStats.filter((endpoint) => endpointHealth(endpoint, slo) === 'Degraded').length;
    const healthyEndpoints = Math.max(endpointStats.length - failedEndpoints - degradedEndpoints, 0);
    const summary = stats.requests === 0
        ? 'No merchant API requests have been recorded in the last 24 hours. Endpoint health will appear here after integrations send traffic.'
        : `${failedEndpoints} down, ${degradedEndpoints} degraded, ${healthyEndpoints} healthy across ${endpointStats.length} endpoints observed in the last 24 hours.`;

    const selectLogWithKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
        const currentIndex = filteredLogs.findIndex((log) => log.id === activeLog?.id);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const nextIndex = Math.max(0, Math.min(filteredLogs.length - 1, currentIndex + (event.key === 'ArrowDown' ? 1 : -1)));
            setSelectedLogId(filteredLogs[nextIndex]?.id ?? null);
        }
    };

    const copyCurl = async (log: LogRow) => {
        const command = `curl -X ${log.method} '${window.location.origin}${log.path}' -H 'Authorization: Bearer $MERCHANT_API_TOKEN' -H 'Accept: application/json'`;
        try { await navigator.clipboard.writeText(command); toast.success('cURL command copied.'); }
        catch { toast.error('Could not copy the cURL command.'); }
    };

    const healthPanel = <Panel className="overflow-hidden">
        <ControlStrip label="Observed endpoint health"><div className="flex items-center gap-2"><span className="size-2 rounded-full bg-foreground" /><span className="text-xs text-muted-foreground">Last 24 hours</span></div></ControlStrip>
        <div className="grid grid-cols-[minmax(0,1.6fr)_72px_82px_100px] gap-3 border-b px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:grid-cols-[minmax(0,1.8fr)_90px_90px_110px_100px]"><span>Endpoint</span><span className="text-right">State</span><span className="text-right">Requests</span><span className="hidden text-right sm:block">Avg latency</span><span className="text-right">Errors</span></div>
        {healthEndpoints.length === 0 ? <div className="p-10 text-center"><Activity aria-label="No activity" className="mx-auto size-5 text-muted-foreground" /><p className="mt-3 text-sm">No endpoint activity yet</p><p className="mt-1 text-xs text-muted-foreground">Send an API request to populate this view.</p></div> : <div role="listbox" aria-label="Observed API endpoints" tabIndex={0} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setSelectedEndpoint(Math.min(selectedEndpoint + 1, healthEndpoints.length - 1)); } if (event.key === 'ArrowUp') { event.preventDefault(); setSelectedEndpoint(Math.max(0, selectedEndpoint - 1)); } }} className="max-h-[470px] divide-y divide-border overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {healthEndpoints.map((endpoint, index) => {
                const state = endpointHealth(endpoint, slo);
                return <button type="button" role="option" aria-selected={selectedEndpoint === index} key={`${endpoint.method}-${endpoint.path}`} onClick={() => setSelectedEndpoint(index)} className={`grid w-full grid-cols-[minmax(0,1.6fr)_72px_82px_100px] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(0,1.8fr)_90px_90px_110px_100px] ${selectedEndpoint === index ? 'bg-accent/70' : ''}`}>
                    <span className="min-w-0"><span className="flex min-w-0 items-center gap-2"><span className="shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px]">{endpoint.method}</span><code className="truncate text-xs" title={endpoint.path}>{endpoint.path}</code></span><span className="mt-1 block text-[10px] text-muted-foreground">Merchant API · observed traffic</span></span>
                    <span className="flex items-center justify-end gap-1.5 text-xs"><StateIcon state={state} /><span>{state}</span></span>
                    <span className="text-right font-mono text-xs tabular-nums">{endpoint.requests.toLocaleString()}</span>
                    <span className="hidden text-right font-mono text-xs tabular-nums sm:block">{endpoint.latency} ms</span>
                    <span className="text-right font-mono text-xs tabular-nums">{endpoint.errors.toLocaleString()}</span>
                </button>;
            })}
        </div>}
        <Footnote>Healthy means no recorded 4xx or 5xx responses and average latency below the selected SLO. “Down” means every observed request failed.</Footnote>
    </Panel>;

    const healthInspector = activeEndpoint ? <Inspector title={`${activeEndpoint.method} ${activeEndpoint.path}`} subtitle="Observed merchant API endpoint · last 24 hours" rows={[
        { label: 'State', value: endpointHealth(activeEndpoint, slo) },
        { label: 'Requests', value: activeEndpoint.requests.toLocaleString() },
        { label: 'Failed responses', value: activeEndpoint.errors.toLocaleString() },
        { label: 'Average latency', value: `${activeEndpoint.latency} ms` },
        { label: 'Slowest response', value: `${activeEndpoint.slowest} ms` },
        { label: 'Last request', value: formatDate(activeEndpoint.last_seen) },
    ]} summary={`${activeEndpoint.errors} of ${activeEndpoint.requests} observed requests failed. Average response time is ${activeEndpoint.latency} ms against a ${slo} ms SLO.`} /> : <Inspector title="No endpoint selected" subtitle="Waiting for API traffic" rows={[]} summary="Once an integration makes a request, endpoint details will appear here." />;

    const latencyPanel = <Panel className="overflow-hidden">
        <ControlStrip label="Latency target"><Slider label="SLO response time" min={100} max={1200} value={slo} onChange={setSlo} formatValue={(value) => `${value} ms`} className="sm:min-w-80" /></ControlStrip>
        <ControlStrip label="Rank endpoints"><SegmentedChips label="Latency metric" values={latencyMetrics} value={latencyMetric} onChange={setLatencyMetric} /></ControlStrip>
        <div className="space-y-1 p-3 sm:p-4">
            {sortedEndpoints.length === 0 ? <div className="py-12 text-center text-sm text-muted-foreground">Latency data appears after the first API request.</div> : sortedEndpoints.map((endpoint) => {
                const value = latencyMetric === 'Average' ? endpoint.latency : endpoint.slowest;
                const over = value >= slo;
                const width = Math.min((value / 1200) * 100, 100);
                const marker = Math.min((slo / 1200) * 100, 100);
                return <div key={`${endpoint.method}-${endpoint.path}`} className="grid gap-3 rounded-lg border border-transparent p-3 hover:border-border hover:bg-accent/40 md:grid-cols-[minmax(180px,1fr)_minmax(180px,1.25fr)_100px] md:items-center">
                    <div className="min-w-0"><div className="flex items-center gap-2">{over && <AlertTriangle aria-label="Above latency target" className="size-3.5 shrink-0" />}<code className="truncate text-xs" title={`${endpoint.method} ${endpoint.path}`}>{endpoint.method} {endpoint.path}</code></div><p className="mt-1 text-[10px] text-muted-foreground">{endpoint.requests.toLocaleString()} requests · {endpoint.errors.toLocaleString()} errors</p></div>
                    <div className="relative h-7 rounded bg-muted/50"><div className="absolute inset-y-0 border-l border-dashed border-foreground/70" style={{ left: `${marker}%` }} /><div className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-foreground/70" style={{ width: `${width}%` }} /><span className="absolute top-1/2 size-2 -translate-y-1/2 rounded-full bg-foreground ring-2 ring-background" style={{ left: `calc(${width}% - 4px)` }} aria-label={`${value} milliseconds`} /></div>
                    <div className="text-right font-mono text-sm tabular-nums">{value.toLocaleString()} ms{over && <span className="ml-2 text-[10px] text-muted-foreground">Over</span>}</div>
                </div>;
            })}
        </div>
        <Footnote>The bar shows average or slowest observed response time on a shared 0–1,200 ms scale. The dashed line marks the selected SLO.</Footnote>
    </Panel>;

    const slowEndpoint = sortedEndpoints[0] ?? null;
    const latencyInspector = slowEndpoint ? <Inspector title={`${slowEndpoint.method} ${slowEndpoint.path}`} subtitle="Latency profile · last 24 hours" rows={[
        { label: 'Average', value: `${slowEndpoint.latency} ms` },
        { label: 'Slowest', value: `${slowEndpoint.slowest} ms` },
        { label: 'Requests', value: slowEndpoint.requests.toLocaleString() },
        { label: 'Errors', value: slowEndpoint.errors.toLocaleString() },
        { label: 'Selected metric', value: latencyMetric },
        { label: 'SLO', value: `${slo} ms` },
    ]} summary={`${latencyMetric === 'Average' ? slowEndpoint.latency : slowEndpoint.slowest} ms ${latencyMetric.toLowerCase()} response time${(latencyMetric === 'Average' ? slowEndpoint.latency : slowEndpoint.slowest) >= slo ? `, above the ${slo} ms target.` : `, within the ${slo} ms target.`}`} /> : <Inspector title="Latency profile" subtitle="Waiting for API activity" rows={[]} summary="Real request timing data will appear here when an API call is recorded." />;

    const logsPanel = <Panel className="overflow-hidden">
        <ControlStrip label="Filter requests"><div className="flex flex-wrap gap-2"><SegmentedChips label="Filter by request method" values={methods} value={method} onChange={setMethod} /><SegmentedChips label="Filter by response status" values={statuses} value={status} onChange={setStatus} /></div></ControlStrip>
        <ControlStrip label="Search access log"><div className="relative w-full sm:w-72"><Search aria-label="Search" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search path or integration" className="h-9 pl-9" /></div></ControlStrip>
        <div className="sticky top-0 grid grid-cols-[minmax(90px,0.8fr)_minmax(150px,1.8fr)_72px_72px] gap-3 border-b bg-card px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:grid-cols-[minmax(130px,0.9fr)_minmax(200px,2fr)_minmax(110px,0.8fr)_75px_86px]"><span>Time</span><span>Request</span><span className="hidden sm:block">Integration</span><span className="text-right">Status</span><span className="text-right">Time taken</span></div>
        {filteredLogs.length === 0 ? <div className="p-10 text-center"><Search aria-label="No matching requests" className="mx-auto size-5 text-muted-foreground" /><p className="mt-3 text-sm">No requests match these filters</p><p className="mt-1 text-xs text-muted-foreground">Try another method, status, or search phrase.</p></div> : <div role="listbox" aria-label="Recent API access log" tabIndex={0} onKeyDown={selectLogWithKeys} className="max-h-[520px] divide-y divide-border overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {filteredLogs.map((log) => <button type="button" role="option" aria-selected={activeLog?.id === log.id} key={log.id} onClick={() => setSelectedLogId(log.id)} className={`grid w-full grid-cols-[minmax(90px,0.8fr)_minmax(150px,1.8fr)_72px_72px] items-center gap-3 px-4 py-3 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(130px,0.9fr)_minmax(200px,2fr)_minmax(110px,0.8fr)_75px_86px] ${activeLog?.id === log.id ? 'bg-accent/70' : ''}`}>
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{formatDate(log.requested_at)}</span><span className="flex min-w-0 items-center gap-2"><Badge variant="outline" className="font-mono text-[9px]">{log.method}</Badge><code className="truncate text-xs" title={log.path}>{log.path}</code></span><span className="hidden truncate text-xs text-muted-foreground sm:block">{log.integration}</span><span className="flex items-center justify-end gap-1 font-mono text-xs tabular-nums">{(log.status_code ?? 500) >= 500 && <AlertTriangle aria-label="Server error" className="size-3" />}{log.status_code ?? '—'}</span><span className="text-right font-mono text-xs tabular-nums">{log.duration_ms ?? '—'} ms</span>
            </button>)}
        </div>}
        <Footnote>Showing {filteredLogs.length} of {logs.length} requests from the last 24 hours{method !== 'All' || status !== 'All' || search ? ' · filters applied' : ' · no filters'}. Only authenticated merchant API calls are logged.</Footnote>
    </Panel>;

    const requestInspector = activeLog ? <Inspector title={`${activeLog.method} ${activeLog.path}`} subtitle={`${activeLog.status_code ?? 'Unknown'} ${responseLabel(activeLog.status_code)} · ${formatDate(activeLog.requested_at)}`} rows={[
        { label: 'Integration', value: activeLog.integration },
        { label: 'Method', value: activeLog.method },
        { label: 'Path', value: activeLog.path },
        { label: 'Status', value: activeLog.status_code ?? 'Unknown' },
        { label: 'Time taken', value: `${activeLog.duration_ms ?? '—'} ms` },
        { label: 'Received at', value: formatDate(activeLog.requested_at) },
    ]} summary={`This request returned ${activeLog.status_code ?? 'an unknown status'} (${responseLabel(activeLog.status_code).toLowerCase()}) in ${activeLog.duration_ms ?? 'an unknown number of'} ms.`}>
        <Button size="sm" variant="outline" className="w-full" onClick={() => copyCurl(activeLog)}><Clipboard aria-label="Copy cURL command" className="mr-2 size-4" />Copy as cURL</Button>
    </Inspector> : <Inspector title="No request selected" subtitle="No matching access logs" rows={[]} summary="Clear or change the filters to inspect a request." />;

    return <AppLayout breadcrumbs={breadcrumbs}>
        <Head title="API Dashboard" />
        <div className="w-full space-y-5 p-4 md:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <DashboardHeader title="API health" summary={summary} />
                <Button asChild variant="outline"><Link href="/merchant-api-access"><KeyRound aria-label="API access settings" className="mr-2 size-4" />Manage API access</Link></Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="Requests · 24h" value={stats.requests.toLocaleString()} detail="Authenticated merchant API calls" icon={Activity} />
                <Metric label="Response health" value={stats.success_rate === null ? '—' : `${stats.success_rate}%`} detail={`${stats.errors.toLocaleString()} responses with 4xx or 5xx`} icon={ShieldCheck} />
                <Metric label="Average latency" value={`${stats.latency} ms`} detail="Across recorded requests" icon={Clock3} />
                <Metric label="Active integrations" value={`${stats.active_integrations} / ${stats.total_integrations}`} detail="Enabled merchant tokens" icon={Waypoints} />
            </div>

            <Panel className="overflow-hidden">
                <ControlStrip label="Monitoring view"><SegmentedChips label="API dashboard view" values={views} value={view} onChange={setView} /></ControlStrip>
                {view === 'Health' && <div className="grid gap-4 p-3 sm:p-4">
                    <SplitLayout main={healthPanel} inspector={healthInspector} />
                    <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
                        <Panel className="overflow-hidden"><div className="flex items-center justify-between gap-3 border-b px-4 py-3"><div><h2 className="text-sm font-semibold">Traffic trace</h2><p className="mt-1 text-xs text-muted-foreground">Request volume by hour · last 24 hours</p></div><span className="font-mono text-xs tabular-nums">{stats.requests.toLocaleString()} total</span></div><div className="p-4"><TrafficTrace data={chart} /><div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground"><span>24h ago</span><span>Now</span></div></div></Panel>
                        <Panel className="overflow-hidden"><div className="border-b px-4 py-3"><h2 className="text-sm font-semibold">Integration keys</h2><p className="mt-1 text-xs text-muted-foreground">Usage and connection state by token</p></div><div className="max-h-64 divide-y divide-border overflow-y-auto">{integrations.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No integrations have been created.</p> : integrations.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.name}</p><p className="truncate text-[10px] text-muted-foreground">{canManage ? `${item.merchant ?? 'Merchant'} · ` : ''}used {formatDate(item.last_used_at)}</p></div><div className="shrink-0 text-right"><p className="font-mono text-xs tabular-nums">{item.requests} req</p><p className="text-[10px] text-muted-foreground">{item.errors} err · {item.latency} ms</p></div></div>)}</div><Footnote>Active integrations: {stats.active_integrations} of {stats.total_integrations}.</Footnote></Panel>
                    </div>
                    {externalConnections.length > 0 && <Panel className="overflow-hidden"><div className="border-b px-4 py-3"><h2 className="text-sm font-semibold">Other API connections</h2><p className="mt-1 text-xs text-muted-foreground">Managed Storeep connection status and most recent sync</p></div><div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">{externalConnections.map((connection) => <div key={`${connection.provider}-${connection.id}`} className="bg-card p-4"><div className="flex items-center justify-between gap-3"><span className="font-mono text-xs">{connection.provider} / {connection.name}</span><span className="flex items-center gap-1.5 text-xs"><StateIcon state={!connection.active || connection.has_error ? 'Degraded' : 'Healthy'} />{!connection.active ? 'Disabled' : connection.has_error ? 'Sync error' : 'Connected'}</span></div><p className="mt-2 truncate text-[10px] text-muted-foreground">{canManage ? `${connection.merchant ?? 'Merchant'} · ` : ''}last sync {formatDate(connection.last_activity_at)}</p></div>)}</div></Panel>}
                </div>}
                {view === 'Latency' && <div className="grid gap-4 p-3 sm:p-4"><SplitLayout main={latencyPanel} inspector={latencyInspector} /></div>}
                {view === 'Access logs' && <div className="grid gap-4 p-3 sm:p-4"><SplitLayout main={logsPanel} inspector={requestInspector} /></div>}
            </Panel>
        </div>
    </AppLayout>;
}
