'use client';

import { Badge } from '@/components/ui/badge';
import type { BreadcrumbItem } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { EAST_AFRICAN_COUNTRIES } from '@/lib/east-african-countries';
import { Head, router, usePage } from '@inertiajs/react';
import { ArrowUpRight, Clock3, FileSpreadsheet, Hash, Layers3, LoaderCircle, RefreshCcw, Search } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

interface SheetOrder {
    id: number;
    order_no: string;
    sheet_id: string;
    sheet_name: string;
    merchant: string;
    status: string;
    updated_at: string;
}

export default function PendingUpdates() {
    const { props } = usePage();
    const { updates, filters } = props as unknown as {
        updates: SheetOrder[];
        filters: { search?: string; country?: string };
    };

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

            <div className="space-y-6 p-4 sm:p-6">
                <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                    <Card className="border-0 shadow-lg">
                        <CardHeader className="border-b bg-slate-50/80 pb-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <CardTitle className="text-lg">Search Queue</CardTitle>
                                    <CardDescription>Search by order number, merchant, or destination sheet.</CardDescription>
                                </div>
                                <Button
                                    onClick={runUpdateCommand}
                                    disabled={isRunning}
                                    className="h-10 shrink-0 rounded-full bg-slate-900 px-5 text-white hover:bg-slate-800"
                                >
                                    {isRunning ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                                    Run update command
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="p-5">
                            <div className="relative">
                                <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search by order no, merchant, or sheet"
                                    className="h-11 pl-9"
                                />
                            </div>
                            <div className="mt-3">
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
                                    <SelectTrigger className="h-11">
                                        <SelectValue placeholder="Filter by country" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All countries</SelectItem>
                                        {EAST_AFRICAN_COUNTRIES.map((country) => (
                                            <SelectItem key={country} value={country}>
                                                {country}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-3">
                        <Card className="border-0 shadow-lg">
                            <CardContent className="p-5">
                                <div className="flex items-center justify-between">
                                    <Layers3 className="h-5 w-5 text-sky-600" />
                                    <Badge variant="secondary">{filtered.length}</Badge>
                                </div>
                                <p className="mt-4 text-xs tracking-[0.2em] text-muted-foreground uppercase">Pending Orders</p>
                                <p className="mt-1 text-2xl font-semibold">{updates.length}</p>
                            </CardContent>
                        </Card>

                        <Card className="border-0 shadow-lg">
                            <CardContent className="p-5">
                                <div className="flex items-center justify-between">
                                    <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                                    <Badge variant="secondary">{sheetCount}</Badge>
                                </div>
                                <p className="mt-4 text-xs tracking-[0.2em] text-muted-foreground uppercase">Affected Sheets</p>
                                <p className="mt-1 text-2xl font-semibold">{sheetCount}</p>
                            </CardContent>
                        </Card>

                        <Card className="border-0 shadow-lg">
                            <CardContent className="p-5">
                                <div className="flex items-center justify-between">
                                    <Clock3 className="h-5 w-5 text-amber-600" />
                                    <Badge variant="secondary">{merchantCount}</Badge>
                                </div>
                                <p className="mt-4 text-xs tracking-[0.2em] text-muted-foreground uppercase">Merchants</p>
                                <p className="mt-1 text-2xl font-semibold">{merchantCount}</p>
                                <p className="mt-1 truncate text-xs text-slate-500">Oldest: {oldestUpdate}</p>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                <Card className="border-0 shadow-lg">
                    <CardHeader className="border-b bg-slate-50/80">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <CardTitle className="text-xl">Pending Orders</CardTitle>
                                <CardDescription>These records remain queued until the update command processes them.</CardDescription>
                            </div>
                            <Badge className="w-fit bg-slate-900 text-white hover:bg-slate-900">{filtered.length} visible</Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-5">
                        {filtered.length === 0 && (
                            <div className="rounded-2xl border border-dashed py-12 text-center text-muted-foreground">No pending updates found</div>
                        )}

                        {filtered.length > 0 && (
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5">
                                {filtered.map((order) => (
                                    <div
                                        key={order.id}
                                        className="flex min-h-[230px] flex-col rounded-2xl border bg-white p-4 shadow-sm transition hover:border-sky-200 hover:bg-sky-50/20"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <Badge variant="outline" className="max-w-[70%] gap-1.5 overflow-hidden rounded-full px-3 py-1 text-xs">
                                                <Hash className="h-3.5 w-3.5 shrink-0" />
                                                <span className="truncate">{order.order_no}</span>
                                            </Badge>
                                            <Badge className="shrink-0 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-100">Pending</Badge>
                                        </div>

                                        <div className="mt-4 min-w-0 space-y-2">
                                            <p className="line-clamp-2 min-h-[3rem] text-base leading-6 font-semibold text-slate-900">
                                                {order.sheet_name}
                                            </p>
                                            <p className="truncate text-sm text-slate-500">{order.merchant}</p>
                                        </div>

                                        <div className="mt-4 flex flex-wrap gap-2">
                                            <span className="max-w-full truncate rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
                                                Sheet ID: {order.sheet_id}
                                            </span>
                                        </div>

                                        <div className="mt-auto pt-4">
                                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                                <ArrowUpRight className="h-4 w-4 shrink-0" />
                                                <span className="truncate">Waiting for sync</span>
                                            </div>
                                            <p className="mt-2 truncate text-xs text-slate-500">Updated: {order.updated_at}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
