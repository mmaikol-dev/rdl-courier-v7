'use client';

import { Badge } from '@/components/ui/badge';
import type { BreadcrumbItem } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { EAST_AFRICAN_COUNTRIES } from '@/lib/east-african-countries';
import { Deferred, Head, router, usePage } from '@inertiajs/react';
import { Hash, Layers3, LoaderCircle, RefreshCcw, Search } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

interface SheetOrder {
    id: number;
    order_no: string;
    sheet_id: string;
    sheet_name: string;
    merchant: string;
    status: string;
    updated_at: string;
}

const EMPTY_UPDATES: SheetOrder[] = [];

function UpdatesSkeleton() {
    return (
        <div className="overflow-x-auto" role="status" aria-label="Loading pending updates" aria-live="polite">
            <div className="min-w-[760px]">
                <div className="grid grid-cols-6 gap-4 border-b bg-muted/30 px-4 py-3">
                    {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-4 w-full" />)}
                </div>
                {Array.from({ length: 7 }).map((_, row) => (
                    <div key={row} className="grid grid-cols-6 gap-4 border-b px-4 py-4 last:border-0">
                        {Array.from({ length: 6 }).map((__, column) => <Skeleton key={column} className="h-4 w-full" />)}
                    </div>
                ))}
            </div>
        </div>
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

    const BREADCRUMBS: BreadcrumbItem[] = [
        { title: 'Dashboard', href: '/dashboard' },
        { title: 'Pending Sheet Updates', href: '/updates' },
    ];

    const [search, setSearch] = React.useState(filters?.search || '');
    const [selectedCountry, setSelectedCountry] = React.useState(filters?.country || 'all');
    const [isRunning, setIsRunning] = React.useState(false);

    const filtered = React.useMemo(() => {
        return updates.filter(
            (order) =>
                order.order_no.toLowerCase().includes(search.toLowerCase()) ||
                order.merchant?.toLowerCase().includes(search.toLowerCase()) ||
                order.sheet_name?.toLowerCase().includes(search.toLowerCase()),
        );
    }, [search, updates]);

    const sheetCount = React.useMemo(() => new Set(updates.map((order) => order.sheet_id)).size, [updates]);
    const merchantCount = React.useMemo(() => new Set(updates.map((order) => order.merchant).filter(Boolean)).size, [updates]);
    const oldestUpdate = updates[0]?.updated_at ?? '—';

    const runUpdateCommand = () => {
        setIsRunning(true);
        router.post(
            '/sheet-updates/run',
            {},
            {
                onSuccess: () => {
                    toast.success('Update command started');
                    router.reload({ only: ['updates'] });
                },
                onError: () => {
                    toast.error('Failed to run update command');
                },
                onFinish: () => {
                    setIsRunning(false);
                },
            },
        );
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
                                        {isUpdatesLoaded ? `${updates.length} queued · ${sheetCount} sheets · ${merchantCount} merchants` : <Skeleton className="mt-1 h-3 w-48" />}
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

                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span>{isUpdatesLoaded ? `${filtered.length} visible of ${updates.length} queued` : <Skeleton className="h-3 w-36" />}</span>
                            <span>{isUpdatesLoaded ? `Oldest update: ${oldestUpdate}` : <Skeleton className="h-3 w-40" />}</span>
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
                                        <Table className="min-w-[760px]">
                                            <TableHeader>
                                                <TableRow className="bg-muted/30 hover:bg-muted/30">
                                                    <TableHead className="w-[180px]">Order</TableHead>
                                                    <TableHead>Destination sheet</TableHead>
                                                    <TableHead>Merchant</TableHead>
                                                    <TableHead className="w-[140px]">Sheet ID</TableHead>
                                                    <TableHead className="w-[130px]">Status</TableHead>
                                                    <TableHead className="w-[190px]">Last updated</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {filtered.map((order) => (
                                                    <TableRow key={order.id}>
                                                        <TableCell className="font-medium">
                                                            <span className="flex items-center gap-2"><Hash className="size-3.5 text-muted-foreground" />{order.order_no}</span>
                                                        </TableCell>
                                                        <TableCell className="max-w-[260px] truncate">{order.sheet_name}</TableCell>
                                                        <TableCell className="max-w-[220px] truncate text-muted-foreground">{order.merchant}</TableCell>
                                                        <TableCell className="font-mono text-xs text-muted-foreground">{order.sheet_id}</TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning-foreground dark:border-warning/30 dark:bg-primary dark:text-warning-foreground">
                                                                Pending
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{order.updated_at}</TableCell>
                                                    </TableRow>
                                                ))}
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
