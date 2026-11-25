'use client';

import { Head, router, usePage } from '@inertiajs/react';
import * as React from 'react';
import { ArrowLeftFromLine, ArrowRightFromLine, Camera, CheckCircle2, ChevronsUpDown, LoaderCircle, ScanLine, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { type BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/dashboard' },
    { title: 'QR Agent Assignment', href: '/agent-order-scans' },
];

type Agent = { id: number; name: string };
type RecentScan = {
    id: number;
    order_no: string;
    scan_type: 'in' | 'out';
    scanned_at: string;
    agent_name: string | null;
    scanned_by: string | null;
};
type PageProps = { agents: Agent[]; recentScans: RecentScan[] };

export default function AgentOrderScansPage() {
    const { agents, recentScans } = usePage<PageProps>().props;
    const [selectedAgentId, setSelectedAgentId] = React.useState('');
    const [agentPickerOpen, setAgentPickerOpen] = React.useState(false);
    const [scanType, setScanType] = React.useState<'out' | 'in'>('out');
    const [cameraOpen, setCameraOpen] = React.useState(false);
    const [cameraReady, setCameraReady] = React.useState(false);
    const [cameraError, setCameraError] = React.useState(false);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [lastScan, setLastScan] = React.useState<string | null>(null);
    const scannerRef = React.useRef<any>(null);
    const scanningRef = React.useRef(false);
    const cooldownRef = React.useRef(false);
    const scanTypeRef = React.useRef(scanType);
    const agentIdRef = React.useRef(selectedAgentId);
    const selectedAgent = agents.find((agent) => String(agent.id) === selectedAgentId);

    React.useEffect(() => { scanTypeRef.current = scanType; }, [scanType]);
    React.useEffect(() => { agentIdRef.current = selectedAgentId; }, [selectedAgentId]);

    const submitScan = React.useCallback((orderNo: string) => {
        if (scanningRef.current || cooldownRef.current) return;
        const agentId = agentIdRef.current;
        if (!agentId) {
            toast.error('Select an agent before scanning an order.');
            return;
        }

        const type = scanTypeRef.current;
        scanningRef.current = true;
        setIsSubmitting(true);
        router.post('/agent-order-scans', {
            order_no: orderNo,
            agent_id: Number(agentId),
            scan_type: type,
        }, {
            preserveScroll: true,
            onSuccess: () => {
                setLastScan(orderNo);
                const status = type === 'out' ? 'Dispatched' : 'Returned';
                toast.success(`${orderNo} assigned to ${agents.find((agent) => String(agent.id) === agentId)?.name ?? 'agent'} · ${status}`);
                setTimeout(() => setLastScan(null), 2500);
            },
            onError: (errors) => {
                const message = Object.values(errors).find((value) => typeof value === 'string');
                toast.error(typeof message === 'string' ? message : 'Could not assign this order.');
            },
            onFinish: () => {
                setIsSubmitting(false);
                scanningRef.current = false;
                cooldownRef.current = true;
                setTimeout(() => { cooldownRef.current = false; }, 1500);
            },
        });
    }, [agents]);

    const startCamera = React.useCallback(async () => {
        if (scannerRef.current) {
            try { await scannerRef.current.stop(); } catch { /* scanner may already be stopped */ }
            scannerRef.current = null;
        }
        try {
            const { Html5Qrcode } = await import('html5-qrcode');
            const scanner = new Html5Qrcode('agent-order-qr-scanner');
            scannerRef.current = scanner;
            await scanner.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 220, height: 220 } },
                (decodedText: string) => {
                    const orderNo = decodedText.split('|')[0]?.trim() || decodedText.trim();
                    if (orderNo) submitScan(orderNo);
                },
                () => {},
            );
            setCameraReady(true);
            setCameraError(false);
        } catch {
            setCameraError(true);
            setCameraReady(false);
            toast.error('Camera unavailable. Allow camera access and try again.');
        }
    }, [submitScan]);

    const openCamera = React.useCallback(() => {
        if (!selectedAgentId) {
            toast.error('Choose the agent who will receive these orders first.');
            return;
        }
        setCameraOpen(true);
        setTimeout(() => { void startCamera(); }, 50);
    }, [selectedAgentId, startCamera]);

    const closeCamera = React.useCallback(() => {
        if (scannerRef.current) {
            try { void scannerRef.current.stop(); } catch { /* scanner may already be stopped */ }
            scannerRef.current = null;
        }
        setCameraOpen(false);
        setCameraReady(false);
        setCameraError(false);
    }, []);

    React.useEffect(() => () => {
        if (scannerRef.current) {
            try { void scannerRef.current.stop(); } catch { /* scanner may already be stopped */ }
            scannerRef.current = null;
        }
    }, []);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="QR Agent Assignment" />
            <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 p-4 md:p-6">
                <div className="flex items-center gap-3">
                    <ScanLine className="size-6 text-primary" />
                    <div>
                        <h1 className="text-xl font-semibold">QR Agent Assignment</h1>
                        <p className="text-sm text-muted-foreground">Assign waybill orders to an agent by scanning their QR codes.</p>
                    </div>
                </div>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Choose agent and scan direction</CardTitle>
                        <CardDescription>Each scan assigns the order to the selected agent and updates its status.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Popover open={agentPickerOpen} onOpenChange={setAgentPickerOpen}>
                            <PopoverTrigger asChild>
                                <Button variant="outline" role="combobox" aria-expanded={agentPickerOpen} className="w-full justify-between">
                                    {selectedAgent?.name ?? 'Select an agent'}
                                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                                <Command>
                                    <CommandInput placeholder="Search agents..." />
                                    <CommandList className="max-h-60 overflow-y-auto">
                                        <CommandEmpty>No agents found.</CommandEmpty>
                                        <CommandGroup>
                                            {agents.map((agent) => (
                                                <CommandItem key={agent.id} value={agent.name} onSelect={() => {
                                                    setSelectedAgentId(String(agent.id));
                                                    setAgentPickerOpen(false);
                                                }}>
                                                    {agent.name}
                                                    {selectedAgentId === String(agent.id) && <CheckCircle2 className="ml-auto size-4 text-primary" />}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>

                        <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
                            <button type="button" onClick={() => setScanType('out')} className={cn('flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-semibold transition-colors', scanType === 'out' ? 'bg-destructive text-destructive-foreground shadow-sm' : 'text-muted-foreground')}>
                                <ArrowRightFromLine className="size-4" /> OUT · Dispatch
                            </button>
                            <button type="button" onClick={() => setScanType('in')} className={cn('flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-semibold transition-colors', scanType === 'in' ? 'bg-success text-success-foreground shadow-sm' : 'text-muted-foreground')}>
                                <ArrowLeftFromLine className="size-4" /> IN · Return
                            </button>
                        </div>

                        {!cameraOpen ? (
                            <Button onClick={openCamera} className="h-12 w-full gap-2 text-base">
                                <Camera className="size-5" /> Open Scanner
                            </Button>
                        ) : (
                            <div className="space-y-3">
                                <div className="relative aspect-square overflow-hidden rounded-xl bg-foreground">
                                    <div id="agent-order-qr-scanner" className="size-full" />
                                    {cameraError && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background p-5 text-center">
                                        <XCircle className="size-10 text-destructive" />
                                        <p className="text-sm">Camera unavailable. Check browser camera permission.</p>
                                        <Button variant="outline" onClick={() => void startCamera()}>Retry</Button>
                                    </div>}
                                    {!cameraReady && !cameraError && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-foreground">
                                        <LoaderCircle className="size-8 animate-spin text-background" />
                                        <p className="text-sm text-background">Starting camera...</p>
                                    </div>}
                                    {cameraReady && <Badge className={cn('absolute left-3 top-3', scanType === 'out' ? 'bg-destructive text-destructive-foreground' : 'bg-success text-success-foreground')}>
                                        {scanType === 'out' ? 'OUT · DISPATCHED' : 'IN · RETURNED'}
                                    </Badge>}
                                    {isSubmitting && <div className="absolute inset-0 flex items-center justify-center bg-foreground/80">
                                        <LoaderCircle className="size-8 animate-spin text-background" />
                                    </div>}
                                    {lastScan && <div className="absolute inset-x-3 bottom-3 rounded-lg bg-background px-3 py-2 text-center text-sm font-semibold text-foreground">
                                        <CheckCircle2 className="mr-2 inline size-4 text-success" />{lastScan}
                                    </div>}
                                </div>
                                <p className="text-center text-xs text-muted-foreground">Point the camera at the order’s waybill QR code.</p>
                                <Button variant="outline" onClick={closeCamera} className="w-full">Close Scanner</Button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Recent assignment scans</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {recentScans.length === 0 ? <p className="py-5 text-center text-sm text-muted-foreground">No orders scanned yet.</p> : recentScans.map((scan) => (
                            <div key={scan.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">{scan.order_no}</p>
                                    <p className="text-xs text-muted-foreground">{scan.agent_name ?? 'Agent removed'} · {scan.scanned_by ?? 'Unknown user'} · {new Date(scan.scanned_at).toLocaleString()}</p>
                                </div>
                                <Badge variant={scan.scan_type === 'out' ? 'destructive' : 'default'} className={scan.scan_type === 'in' ? 'bg-success text-success-foreground' : undefined}>
                                    {scan.scan_type === 'out' ? 'OUT · Dispatched' : 'IN · Returned'}
                                </Badge>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </main>
        </AppLayout>
    );
}
