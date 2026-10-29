import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Deferred, Head, Link } from '@inertiajs/react';
import { ArrowDownToLine, ArrowRight, CalendarClock, CircleAlert, PackageCheck, Plus, Warehouse } from 'lucide-react';

interface ShipmentItemSummary {
    id: number;
    product_name: string;
    expected_quantity: number;
    received_quantity: number;
}

interface Shipment {
    id: number;
    shipment_number: string;
    supplier: string;
    supplier_reference: string | null;
    carrier: string | null;
    tracking_number: string | null;
    expected_on: string | null;
    warehouse_code: string;
    warehouse_name: string;
    country: string;
    status: string;
    expected_units: number;
    received_units: number;
    items: ShipmentItemSummary[];
}

interface PaginatedShipments {
    data: Shipment[];
    current_page: number;
    last_page: number;
    total: number;
    from: number | null;
    to: number | null;
    links: Array<{ url: string | null; label: string; active: boolean }>;
}

interface Stats {
    expected_count: number;
    expected_units: number;
    arriving_soon: number;
    at_dock: number;
    received_count: number;
    units_received: number;
    discrepancies: number;
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Inventory', href: '/products' },
    { title: 'Shipments', href: '/shipments' },
];

const tabs = [
    { key: 'ALL', label: 'All' },
    { key: 'EXPECTED', label: 'Expected' },
    { key: 'RECEIVING', label: 'At the dock' },
    { key: 'RECEIVED', label: 'Received' },
    { key: 'DISCREPANCY', label: 'Discrepancy' },
];

function statusLabel(status: string) {
    return ({ EXPECTED: 'Expected', ARRIVED: 'Arrived', RECEIVING: 'Receiving', RECEIVED: 'Received', DISCREPANCY: 'Discrepancy' } as Record<string, string>)[status] ?? status;
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
    if (status === 'DISCREPANCY') return 'destructive';
    if (status === 'RECEIVED') return 'secondary';
    if (status === 'RECEIVING' || status === 'ARRIVED') return 'default';
    return 'outline';
}

function StatCard({ title, value, caption, icon: Icon, href }: { title: string; value: string | number; caption: string; icon: typeof Warehouse; href?: string }) {
    const content = (
        <Card className={href ? 'transition-colors hover:border-primary/50' : undefined}>
            <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">{title}</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{caption}</p>
                </div>
                <span className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="size-4" /></span>
            </CardContent>
        </Card>
    );

    return href ? <Link href={href} className="block">{content}</Link> : content;
}

function ShipmentsLoadingSkeleton() {
    return <div className="space-y-6" role="status" aria-label="Loading shipments" aria-live="polite">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }).map((_, index) => <Card key={index}><CardContent className="space-y-3 p-4"><Skeleton className="h-4 w-28" /><Skeleton className="h-8 w-16" /><Skeleton className="h-3 w-36" /></CardContent></Card>)}</div>
        <Card className="overflow-hidden"><CardHeader className="border-b"><Skeleton className="h-5 w-40" /></CardHeader><CardContent className="space-y-4 p-4"><div className="grid grid-cols-2 gap-3 sm:grid-cols-7">{Array.from({ length: 7 }).map((_, index) => <Skeleton key={index} className="h-4 w-full" />)}</div>{Array.from({ length: 6 }).map((_, row) => <div key={row} className="grid grid-cols-2 gap-3 border-t pt-4 sm:grid-cols-7">{Array.from({ length: 7 }).map((__, col) => <Skeleton key={col} className="h-5 w-full" />)}</div>)}</CardContent></Card>
    </div>;
}

export default function ShipmentsIndex({ shipments, stats, stage }: { shipments: PaginatedShipments; stats: Stats; stage: string }) {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Shipments" />
            <div className="space-y-6 p-4 md:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="text-sm font-medium text-primary">Inventory</p>
                        <h1 className="text-2xl font-semibold tracking-tight">Shipments</h1>
                        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Track stock coming into your warehouses. Count the delivery to add received units to available stock.</p>
                    </div>
                    <Button asChild><Link href="/shipments/create"><Plus className="mr-2 size-4" />New shipment</Link></Button>
                </div>

                <Deferred data={['shipments', 'stats']} fallback={<ShipmentsLoadingSkeleton />}>
                {() => <>
                <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Shipment summary">
                    <StatCard title="Expected" value={stats.expected_count} caption={`${stats.expected_units.toLocaleString()} units on the way`} icon={ArrowDownToLine} href="/shipments?stage=EXPECTED" />
                    <StatCard title="Arriving in 7 days" value={stats.arriving_soon} caption={stats.arriving_soon ? 'expected soon' : 'none scheduled'} icon={CalendarClock} href="/shipments?stage=EXPECTED" />
                    <StatCard title="At the dock" value={stats.at_dock} caption="to count and put away" icon={Warehouse} href="/shipments?stage=RECEIVING" />
                    <StatCard title="Received" value={stats.received_count} caption={`${stats.units_received.toLocaleString()} units put into stock · all time`} icon={PackageCheck} href="/shipments?stage=RECEIVED" />
                    <StatCard title="Discrepancies" value={stats.discrepancies} caption={stats.discrepancies ? 'review shipment counts' : 'nothing to decide'} icon={CircleAlert} href="/shipments?stage=DISCREPANCY" />
                </section>

                <Card>
                    <CardHeader className="gap-4 border-b pb-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <CardTitle className="text-base">Warehouse shipments</CardTitle>
                            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filter shipments by stage">
                                {tabs.map((tab) => (
                                    <Button key={tab.key} asChild size="sm" variant={stage === tab.key ? 'secondary' : 'ghost'}>
                                        <Link href={tab.key === 'ALL' ? '/shipments' : `/shipments?stage=${tab.key}`} role="tab" aria-selected={stage === tab.key}>{tab.label}</Link>
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Shipment</TableHead>
                                        <TableHead>From</TableHead>
                                        <TableHead>Carrier · tracking</TableHead>
                                        <TableHead>Expected on</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Units received</TableHead>
                                        <TableHead className="w-8" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {shipments.data.length === 0 ? (
                                        <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">No shipments in this view.</TableCell></TableRow>
                                    ) : shipments.data.map((shipment) => (
                                        <TableRow key={shipment.id}>
                                            <TableCell>
                                                <Link href={`/shipments/${shipment.id}`} className="font-semibold text-foreground hover:text-primary">{shipment.shipment_number}</Link>
                                                <p className="max-w-60 truncate text-xs text-muted-foreground">{shipment.items.map((item) => item.product_name).join(', ')}</p>
                                            </TableCell>
                                            <TableCell>
                                                <p className="font-medium">{shipment.supplier}</p>
                                                <p className="text-xs text-muted-foreground">{shipment.warehouse_name} ({shipment.warehouse_code}) · {shipment.country}</p>
                                            </TableCell>
                                            <TableCell>
                                                <p>{shipment.carrier || '—'}</p>
                                                {shipment.tracking_number && <p className="text-xs text-muted-foreground">{shipment.tracking_number}</p>}
                                            </TableCell>
                                            <TableCell>{shipment.expected_on ? new Date(`${shipment.expected_on.slice(0, 10)}T00:00:00`).toLocaleDateString() : '—'}</TableCell>
                                            <TableCell><Badge variant={statusVariant(shipment.status)}>{statusLabel(shipment.status)}</Badge></TableCell>
                                            <TableCell className="text-right tabular-nums">{Number(shipment.received_units || 0).toLocaleString()} <span className="text-muted-foreground">of {Number(shipment.expected_units || 0).toLocaleString()}</span></TableCell>
                                            <TableCell><Link href={`/shipments/${shipment.id}`} aria-label={`Open ${shipment.shipment_number}`}><ArrowRight className="size-4 text-muted-foreground" /></Link></TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        {shipments.last_page > 1 && (
                            <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
                                <span>Showing {shipments.from ?? 0}–{shipments.to ?? 0} of {shipments.total}</span>
                                <div className="flex gap-2">
                                    {shipments.links.filter((link) => link.label.includes('Previous') || link.label.includes('Next')).map((link) => (
                                        <Button key={link.label} asChild variant="outline" size="sm" disabled={!link.url}>
                                            {link.url ? <Link href={link.url}>{link.label.replace('&laquo; ', '').replace(' &raquo;', '')}</Link> : <span>{link.label}</span>}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
                </>}
                </Deferred>
            </div>
        </AppLayout>
    );
}
