import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { ArrowLeft, Check, LoaderCircle, ScanBarcode, Truck } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

interface ShipmentItem {
    id: number;
    product_name: string;
    product_code: string | null;
    expected_quantity: number;
    received_quantity: number;
    receipt_counted: boolean;
}

interface Shipment {
    id: number;
    shipment_number: string;
    supplier: string;
    supplier_reference: string | null;
    carrier: string | null;
    tracking_number: string | null;
    expected_on: string | null;
    cartons: number | null;
    warehouse_code: string;
    warehouse_name: string;
    country: string;
    status: string;
    note: string | null;
    arrived_at: string | null;
    received_at: string | null;
    items: ShipmentItem[];
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Inventory', href: '/products' },
    { title: 'Shipments', href: '/shipments' },
    { title: 'Shipment details', href: '#' },
];

const statusLabel: Record<string, string> = {
    EXPECTED: 'Expected', ARRIVED: 'Arrived', RECEIVING: 'Receiving', RECEIVED: 'Received', DISCREPANCY: 'Discrepancy',
};

export default function ShowShipment({ shipment }: { shipment: Shipment }) {
    const [counts, setCounts] = React.useState<Record<number, string>>(() => Object.fromEntries(
        shipment.items.map((item) => [item.id, item.receipt_counted ? String(item.received_quantity) : '']),
    ));
    const [processing, setProcessing] = React.useState(false);
    const [sku, setSku] = React.useState('');
    const canReceive = ['ARRIVED', 'RECEIVING'].includes(shipment.status);
    const terminal = ['RECEIVED', 'DISCREPANCY'].includes(shipment.status);
    const allCounted = shipment.items.every((item) => counts[item.id] !== undefined && counts[item.id].trim() !== '');
    const expectedTotal = shipment.items.reduce((sum, item) => sum + Number(item.expected_quantity), 0);
    const receivedTotal = shipment.items.reduce((sum, item) => sum + Number(item.received_quantity), 0);

    const addScannedSku = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const code = sku.trim().toLowerCase();
        const item = shipment.items.find((line) => line.product_code?.trim().toLowerCase() === code);
        if (!item) {
            toast.error(`SKU ${sku.trim()} is not on this shipment.`);
            return;
        }
        const current = counts[item.id] === undefined || counts[item.id] === '' ? 0 : Number(counts[item.id]);
        setCounts((previous) => ({ ...previous, [item.id]: String(current + 1) }));
        setSku('');
        toast.success(`${item.product_name}: count increased by one.`);
    };

    const saveCounts = (complete: boolean) => {
        if (!allCounted) {
            toast.error('Enter a count for every product. Use 0 if none arrived.');
            return;
        }
        setProcessing(true);
        router.put(`/shipments/${shipment.id}/receipt`, {
            items: shipment.items.map((item) => ({ id: item.id, received_quantity: Number(counts[item.id]) })),
            complete_receipt: complete,
        }, {
            preserveScroll: true,
            onSuccess: () => toast.success(complete ? 'Receipt completed and available stock updated.' : 'Counts saved. Units remain inbound.'),
            onError: (errors) => toast.error(Object.values(errors)[0] || 'Could not save receipt counts.'),
            onFinish: () => setProcessing(false),
        });
    };

    const markArrived = () => router.post(`/shipments/${shipment.id}/arrive`, {}, {
        preserveScroll: true,
        onSuccess: () => toast.success('Shipment marked as arrived.'),
        onError: () => toast.error('Could not update shipment status.'),
    });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={shipment.shipment_number} />
            <div className="mx-auto w-full max-w-5xl space-y-5 p-4 md:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                        <Button asChild variant="outline" size="icon" aria-label="Back to shipments"><Link href="/shipments"><ArrowLeft className="size-4" /></Link></Button>
                        <div>
                            <p className="text-sm font-medium text-primary">Shipment</p>
                            <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight">{shipment.shipment_number}</h1><Badge variant={shipment.status === 'DISCREPANCY' ? 'destructive' : shipment.status === 'RECEIVED' ? 'secondary' : 'outline'}>{statusLabel[shipment.status] ?? shipment.status}</Badge></div>
                            <p className="mt-1 text-sm text-muted-foreground">{shipment.warehouse_name} ({shipment.warehouse_code}) · {shipment.country}</p>
                        </div>
                    </div>
                    {shipment.status === 'EXPECTED' && <Button onClick={markArrived}><Truck className="mr-2 size-4" />Mark as arrived</Button>}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <Card>
                        <CardHeader><CardTitle className="text-base">Shipment details</CardTitle></CardHeader>
                        <CardContent className="grid gap-x-5 gap-y-4 text-sm sm:grid-cols-2">
                            <div><p className="text-xs text-muted-foreground">Supplier or origin</p><p className="font-medium">{shipment.supplier}</p></div>
                            <div><p className="text-xs text-muted-foreground">Supplier reference</p><p>{shipment.supplier_reference || '—'}</p></div>
                            <div><p className="text-xs text-muted-foreground">Carrier</p><p>{shipment.carrier || '—'}</p></div>
                            <div><p className="text-xs text-muted-foreground">Tracking number</p><p>{shipment.tracking_number || '—'}</p></div>
                            <div><p className="text-xs text-muted-foreground">Expected on</p><p>{shipment.expected_on ? new Date(`${shipment.expected_on.slice(0, 10)}T00:00:00`).toLocaleDateString() : '—'}</p></div>
                            <div><p className="text-xs text-muted-foreground">Cartons</p><p>{shipment.cartons ?? '—'}</p></div>
                            {shipment.note && <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Note</p><p className="whitespace-pre-wrap">{shipment.note}</p></div>}
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader><CardTitle className="text-base">Stock summary</CardTitle><CardDescription>Available stock changes only when receipt is completed.</CardDescription></CardHeader>
                        <CardContent className="grid grid-cols-2 gap-4 text-sm">
                            <div><p className="text-xs text-muted-foreground">Expected units</p><p className="text-2xl font-semibold tabular-nums">{expectedTotal.toLocaleString()}</p></div>
                            <div><p className="text-xs text-muted-foreground">Counted units</p><p className="text-2xl font-semibold tabular-nums">{receivedTotal.toLocaleString()}</p></div>
                            {shipment.arrived_at && <p className="text-xs text-muted-foreground sm:col-span-2">Arrived {new Date(shipment.arrived_at).toLocaleString()}</p>}
                            {shipment.received_at && <p className="text-xs text-muted-foreground sm:col-span-2">Receipt completed {new Date(shipment.received_at).toLocaleString()}</p>}
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Products and receipt</CardTitle>
                        <CardDescription>{canReceive ? 'Count or scan each product. Save counts to keep units inbound, or complete receipt to add counted units to available stock.' : terminal ? 'Final receipt counts. Any difference from expected quantities is recorded as a discrepancy.' : 'Mark this shipment as arrived before counting products.'}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {canReceive && <div className="max-w-md space-y-2"><Label htmlFor="receipt-sku">Scan product SKU to count one unit</Label><div className="relative"><ScanBarcode className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="receipt-sku" className="pl-9" value={sku} onChange={(event) => setSku(event.target.value)} onKeyDown={addScannedSku} placeholder="Scan SKU and press Enter" /></div></div>}
                        <div className="overflow-x-auto rounded-md border">
                            <Table>
                                <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Expected</TableHead><TableHead className="w-48 text-right">Received</TableHead><TableHead className="text-right">Difference</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {shipment.items.map((item) => {
                                        const value = counts[item.id] ?? '';
                                        const difference = value === '' ? null : Number(value) - Number(item.expected_quantity);
                                        return <TableRow key={item.id}>
                                            <TableCell><p className="font-medium">{item.product_name}</p><p className="text-xs text-muted-foreground">{item.product_code || 'No SKU'}</p></TableCell>
                                            <TableCell className="text-right tabular-nums">{Number(item.expected_quantity).toLocaleString()}</TableCell>
                                            <TableCell className="text-right">{canReceive ? <Input className="ml-auto w-32 text-right tabular-nums" type="number" min="0" value={value} onChange={(event) => setCounts((previous) => ({ ...previous, [item.id]: event.target.value }))} aria-label={`Received quantity for ${item.product_name}`} /> : <span className="tabular-nums">{item.receipt_counted ? Number(item.received_quantity).toLocaleString() : '—'}</span>}</TableCell>
                                            <TableCell className={`text-right tabular-nums ${difference !== null && difference !== 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{difference === null ? '—' : `${difference > 0 ? '+' : ''}${difference.toLocaleString()}`}</TableCell>
                                        </TableRow>;
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                        {canReceive && <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <Button variant="outline" onClick={() => saveCounts(false)} disabled={processing || !allCounted}>{processing ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : null}Save counts</Button>
                            <Button onClick={() => saveCounts(true)} disabled={processing || !allCounted}>{processing ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />}Complete receipt</Button>
                        </div>}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
