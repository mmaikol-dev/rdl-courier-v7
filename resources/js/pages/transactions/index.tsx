'use client';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Pagination, PaginationContent, PaginationItem } from '@/components/ui/pagination';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Deferred, Head, router, usePage } from '@inertiajs/react';
import { format } from 'date-fns';
import { CalendarRange, Edit, LoaderCircle, RefreshCwIcon, SearchIcon, ShieldAlert, Inbox } from 'lucide-react';
import * as React from 'react';
import { type DateRange } from 'react-day-picker';
import { toast } from 'sonner';

const BREADCRUMBS: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/dashboard' },
    { title: 'Transactions', href: '/transactions' },
];

interface Transaction {
    id: number;
    transaction_id: string;
    account_number: string;
    amount: string;
    payer_phone: string;
    business_shortcode?: string;
    processed: boolean;
    created_at?: string;
}

interface Filters {
    search?: string;
    status?: string;
    start_date?: string;
    end_date?: string;
}

const EMPTY_TRANSACTIONS = { data: [] as Transaction[], links: [] as any[] };

function TransactionsSkeleton() {
    return (
        <div className="space-y-3 p-2 sm:p-3" role="status" aria-label="Loading transactions" aria-live="polite">
            <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row">
                <Skeleton className="h-9 flex-1" />
                <Skeleton className="h-9 w-full sm:w-64" />
                <Skeleton className="h-9 w-24" />
            </div>
            <div className="rounded-lg border">
                <div className="grid grid-cols-4 gap-3 border-b p-3 sm:grid-cols-8">
                    {Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-4 w-full" />)}
                </div>
                {Array.from({ length: 8 }).map((_, row) => (
                    <div key={row} className="grid grid-cols-4 gap-3 border-b p-3 last:border-0 sm:grid-cols-8">
                        {Array.from({ length: 8 }).map((__, column) => <Skeleton key={column} className="h-4 w-full" />)}
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function TransactionsView() {
    const { transactionReport, auth, filters } = usePage<{
        transactionReport?: {
            transactions: { data: Transaction[]; links: any[] } | Transaction[];
            summary: { totalAmount: number; totalRecords: number };
        };
        auth: { user: { roles: string } };
        filters?: Filters;
    }>().props;
    const transactions = transactionReport?.transactions ?? EMPTY_TRANSACTIONS;
    const summary = transactionReport?.summary ?? { totalAmount: 0, totalRecords: 0 };

    const userRole = String(auth?.user?.roles || '').trim().toLowerCase();
    const canViewTotalAmountCard = ['g.o.d', 'finance'].includes(userRole);

    // Normalize list + links regardless of array/paginated payload
    const list: Transaction[] = Array.isArray(transactions) ? (transactions as Transaction[]) : (transactions?.data as Transaction[]) || [];
    const links: any[] = Array.isArray(transactions) ? [] : (transactions as any)?.links || [];

    const [search, setSearch] = React.useState(filters?.search || '');
    const [dateRange, setDateRange] = React.useState<DateRange | undefined>(() => ({
        from: filters?.start_date ? new Date(`${filters.start_date}T00:00:00`) : undefined,
        to: filters?.end_date ? new Date(`${filters.end_date}T00:00:00`) : undefined,
    }));

    // Edit/Delete state
    const [editingTransaction, setEditingTransaction] = React.useState<Transaction | null>(null);
    const [editValues, setEditValues] = React.useState<Partial<Transaction>>({});
    const [isSearching, setIsSearching] = React.useState(false);
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [isSaving, setIsSaving] = React.useState(false);

    const buildFilters = React.useCallback(
        () => ({
            search: search || undefined,
            status: filters?.status || undefined,
            start_date: dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined,
            end_date: dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined,
        }),
        [dateRange, filters?.status, search],
    );

    const getFirstErrorMessage = (errors: Record<string, string | string[]>) => {
        const firstError = Object.values(errors)[0];

        if (Array.isArray(firstError)) {
            return firstError[0];
        }

        return firstError || 'Something went wrong.';
    };

    const handleSearch = React.useCallback(() => {
        setIsSearching(true);
        router.get('/transactions', buildFilters(), {
            preserveState: true,
            replace: true,
            onError: () => toast.error('Failed to search transactions'),
            onFinish: () => setIsSearching(false),
        });
    }, [buildFilters]);

    const refresh = React.useCallback(() => {
        setIsRefreshing(true);
        setSearch('');
        setDateRange(undefined);
        router.get(
            '/transactions',
            {},
            {
                preserveState: true,
                replace: true,
                onSuccess: () => toast.success('Transactions refreshed'),
                onError: () => toast.error('Failed to refresh transactions'),
                onFinish: () => setIsRefreshing(false),
            },
        );
    }, []);

    const clearFilters = React.useCallback(() => {
        setSearch('');
        setDateRange(undefined);
        setIsSearching(true);
        router.get(
            '/transactions',
            {},
            {
                preserveState: true,
                replace: true,
                onError: () => toast.error('Failed to clear filters'),
                onFinish: () => setIsSearching(false),
            },
        );
    }, []);

    const handleEditOpen = (transaction: Transaction) => {
        setEditingTransaction(transaction);
        setEditValues(transaction);
    };

    const handleEditSave = () => {
        if (!editingTransaction || isSaving) return;

        setIsSaving(true);

        router.put(`/transactions/${editingTransaction.id}`, editValues, {
            onSuccess: () => {
                toast.success('Transaction updated successfully');
                setEditingTransaction(null);
            },
            onError: (errors) => toast.error(getFirstErrorMessage(errors)),
            onFinish: () => setIsSaving(false),
            preserveScroll: true,
            preserveState: true,
            only: ['transactionReport'],
        });
    };

    const formattedTotalAmount = new Intl.NumberFormat('en-KE', {
        style: 'currency',
        currency: 'KES',
        minimumFractionDigits: 2,
    }).format(Number(summary?.totalAmount || 0));

    const hasActiveFilters = Boolean(search || dateRange?.from || dateRange?.to);

    return (
        <AppLayout breadcrumbs={BREADCRUMBS}>
            <Head title="Transactions" />

            {/* Access Denied */}
            <Dialog open={userRole === 'merchant'}>
                <DialogContent className="max-w-sm text-center">
                    <DialogHeader>
                        <div className="mb-2 flex justify-center">
                            <ShieldAlert className="h-12 w-12 text-destructive" />
                        </div>
                        <DialogTitle className="text-destructive">Access Not Allowed</DialogTitle>
                        <DialogDescription>You don’t have permission to view transactions.</DialogDescription>
                    </DialogHeader>
                    <div className="mt-4 flex justify-center">
                        <Button variant="outline" onClick={() => router.visit('/dashboard')}>
                            Go Back to Dashboard
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {userRole !== 'merchant' && (
                <Deferred data="transactionReport" fallback={<TransactionsSkeleton />}>
                {() => <>
                <div className="space-y-3 p-2 sm:p-3">
                    {/* Toolbar */}
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                            <div className="flex w-full flex-col gap-2 lg:flex-row lg:items-center">
                                <div className="flex w-full gap-2 sm:flex-1">
                                    <Input
                                        placeholder="Search by transaction ID, account, phone, or shortcode"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                        className="flex-1"
                                    />
                                    <Button onClick={handleSearch} title="Search" disabled={isSearching}>
                                        {isSearching ? (
                                            <LoaderCircle className="mr-1 h-4 w-4 animate-spin" />
                                        ) : (
                                            <SearchIcon className="mr-1 h-4 w-4" />
                                        )}
                                        Search
                                    </Button>
                                </div>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className="h-9 w-full justify-start text-left font-normal lg:w-[260px]">
                                            <CalendarRange className="mr-2 h-4 w-4" />
                                            {dateRange?.from ? (
                                                dateRange.to ? (
                                                    `${format(dateRange.from, 'MMM d, yyyy')} - ${format(dateRange.to, 'MMM d, yyyy')}`
                                                ) : (
                                                    format(dateRange.from, 'MMM d, yyyy')
                                                )
                                            ) : (
                                                <span className="text-muted-foreground">Pick a date range</span>
                                            )}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                            initialFocus
                                            mode="range"
                                            defaultMonth={dateRange?.from}
                                            selected={dateRange}
                                            onSelect={setDateRange}
                                            numberOfMonths={2}
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <div className="flex shrink-0 gap-2">
                                <Button variant="outline" onClick={clearFilters} disabled={!hasActiveFilters || isSearching}>
                                    Clear
                                </Button>
                                <Button variant="outline" onClick={refresh} title="Refresh list" disabled={isRefreshing}>
                                    <RefreshCwIcon className={`mr-1 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                                    Refresh
                                </Button>
                            </div>
                        </div>

                        {canViewTotalAmountCard && (
                            <Card>
                                <CardContent className="flex items-center justify-between gap-3 px-3 py-2">
                                    <div className="flex items-baseline gap-2">
                                        <p className="text-xs text-muted-foreground">Filtered total</p>
                                        <p className="text-lg font-semibold tracking-tight">{formattedTotalAmount}</p>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {summary?.totalRecords ?? 0} transaction{summary?.totalRecords === 1 ? '' : 's'} in view
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {/* Table container ensures no overlap by allowing horizontal scroll and fixed widths */}
                    <div className="overflow-x-auto rounded-lg border">
                        <div className="min-w-[980px]">
                            <Table className="table-fixed">
                                <TableHeader className="sticky top-0 z-10 bg-muted/60">
                                    <TableRow className="hover:bg-muted/60">
                                        <TableHead className="w-[16%]">Txn ID</TableHead>
                                        <TableHead className="w-[14%]">Account</TableHead>
                                        <TableHead className="w-[10%]">Amount</TableHead>
                                        <TableHead className="w-[14%]">Payer Phone</TableHead>
                                        <TableHead className="w-[14%]">Shortcode</TableHead>
                                        <TableHead className="w-[10%]">Status</TableHead>
                                        <TableHead className="w-[14%]">Created</TableHead>
                                        <TableHead className="w-[8%] text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {list.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="py-10 text-center">
                                                <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-muted">
                                                    <Inbox className="size-6 text-muted-foreground" />
                                                </div>
                                                <p className="font-medium text-muted-foreground">No transactions found</p>
                                                <p className="mt-1 text-sm text-muted-foreground">
                                                    Try adjusting your search or clearing the filters.
                                                </p>
                                                {hasActiveFilters && (
                                                    <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                                                        Clear filters
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        list.map((txn) => (
                                            <TableRow key={txn.id} className="h-10 transition-colors hover:bg-muted/40">
                                                <TableCell className="whitespace-nowrap px-2 py-1 font-mono text-xs font-medium">
                                                    <span className="block max-w-[200px] truncate" title={txn.transaction_id}>
                                                        {txn.transaction_id}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap px-2 py-1">
                                                    <span className="block max-w-[180px] truncate font-medium" title={txn.account_number}>
                                                        {txn.account_number}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap px-2 py-1 font-mono text-sm font-medium tabular-nums">
                                                    <span title={txn.amount}>{txn.amount}</span>
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap px-2 py-1">
                                                    <span className="block max-w-[180px] truncate font-mono text-xs" title={txn.payer_phone}>
                                                        {txn.payer_phone || '—'}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap px-2 py-1">
                                                    <span
                                                        className="block max-w-[180px] truncate font-mono text-xs"
                                                        title={txn.business_shortcode}
                                                    >
                                                        {txn.business_shortcode || '—'}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap px-2 py-1">
                                                    {txn.processed ? (
                                                        <Badge className="border-success/30 bg-success/10 text-success hover:bg-success/10">
                                                            Processed
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning-foreground">
                                                            Pending
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap px-2 py-1 text-sm text-muted-foreground">
                                                    {txn.created_at ? (
                                                        <span
                                                            className="block max-w-[220px] truncate"
                                                            title={new Date(txn.created_at).toLocaleString()}
                                                        >
                                                            {new Date(txn.created_at).toLocaleString()}
                                                        </span>
                                                    ) : (
                                                        '—'
                                                    )}
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap px-2 py-1">
                                                    <div className="flex justify-end">
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => handleEditOpen(txn)}
                                                            title="Edit"
                                                            disabled={isSaving}
                                                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                                                        >
                                                            <Edit className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>

                    {/* Pagination (keeps search param for cross-page search) */}
                    {!Array.isArray(transactions) && links.length > 0 && (
                        <div className="flex justify-center">
                            <Pagination>
                                <PaginationContent>
                                    {links.map((link: any, index: number) => (
                                        <PaginationItem key={index}>
                                            <Button
                                                type="button"
                                                variant={link.active ? 'outline' : 'ghost'}
                                                size="sm"
                                                disabled={!link.url}
                                                onClick={() =>
                                                    link.url &&
                                                    router.get(link.url, buildFilters(), {
                                                        preserveState: true,
                                                        preserveScroll: true,
                                                    })
                                                }
                                                dangerouslySetInnerHTML={{ __html: link.label }}
                                            />
                                        </PaginationItem>
                                    ))}
                                </PaginationContent>
                            </Pagination>
                        </div>
                    )}
                </div>
                </>}
                </Deferred>
            )}

            {/* Edit Modal */}
            <Dialog open={!!editingTransaction} onOpenChange={(open) => !open && setEditingTransaction(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Edit Transaction</DialogTitle>
                        <DialogDescription>Update the transaction information below.</DialogDescription>
                    </DialogHeader>
                    <div className="mt-2 space-y-3">
                        {['transaction_id', 'account_number', 'amount', 'payer_phone', 'business_shortcode'].map((field) => (
                            <Input
                                key={field}
                                value={(editValues as any)[field] || ''}
                                onChange={(e) => setEditValues({ ...editValues, [field]: e.target.value })}
                                placeholder={field.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                                disabled={isSaving}
                            />
                        ))}
                        <div className="flex items-center gap-2">
                            <label className="text-sm font-medium">Processed</label>
                            <input
                                type="checkbox"
                                checked={!!editValues.processed}
                                onChange={(e) => setEditValues({ ...editValues, processed: e.target.checked })}
                                disabled={isSaving}
                            />
                        </div>
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setEditingTransaction(null)} disabled={isSaving}>
                            Cancel
                        </Button>
                        <Button onClick={handleEditSave} disabled={isSaving}>
                            {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                            Save
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
