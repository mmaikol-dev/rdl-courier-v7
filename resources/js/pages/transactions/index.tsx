'use client';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Pagination, PaginationContent, PaginationItem } from '@/components/ui/pagination';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { format } from 'date-fns';
import { CalendarRange, Edit, LoaderCircle, RefreshCwIcon, SearchIcon, ShieldAlert } from 'lucide-react';
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

export default function TransactionsView() {
    const { transactions, auth, filters, summary } = usePage<{
        transactions: { data: Transaction[]; links: any[] } | Transaction[];
        auth: { user: { roles: string } };
        filters?: Filters;
        summary: { totalAmount: number; totalRecords: number };
    }>().props;

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
            only: ['transactions', 'summary'],
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
                            <ShieldAlert className="h-12 w-12 text-red-500" />
                        </div>
                        <DialogTitle className="text-red-600">Access Not Allowed</DialogTitle>
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
                <div className="p-4">
                    {/* Toolbar */}
                    <div className="mb-4 flex flex-col gap-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex w-full flex-col gap-2 lg:flex-row lg:items-center">
                                <div className="flex w-full gap-2 sm:w-auto sm:flex-1">
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
                                        <Button variant="outline" className="w-full justify-start text-left font-normal lg:w-[300px]">
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
                            <div className="flex gap-2">
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
                                <CardContent className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <p className="text-sm text-muted-foreground">Filtered total amount</p>
                                        <p className="text-2xl font-semibold tracking-tight">{formattedTotalAmount}</p>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
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
                                <TableHeader className="sticky top-0 z-10 bg-background">
                                    <TableRow>
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
                                                No transactions found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        list.map((txn) => (
                                            <TableRow key={txn.id} className="hover:bg-muted/10">
                                                <TableCell className="align-middle whitespace-nowrap">
                                                    <span className="block max-w-[200px] truncate" title={txn.transaction_id}>
                                                        {txn.transaction_id}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="align-middle whitespace-nowrap">
                                                    <span className="block max-w-[180px] truncate" title={txn.account_number}>
                                                        {txn.account_number}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="align-middle whitespace-nowrap">
                                                    <span title={txn.amount}>{txn.amount}</span>
                                                </TableCell>
                                                <TableCell className="align-middle whitespace-nowrap">
                                                    <span className="block max-w-[180px] truncate" title={txn.payer_phone}>
                                                        {txn.payer_phone || '—'}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="align-middle whitespace-nowrap">
                                                    <span className="block max-w-[180px] truncate" title={txn.business_shortcode}>
                                                        {txn.business_shortcode || '—'}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="align-middle whitespace-nowrap">
                                                    {txn.processed ? (
                                                        <span className="font-semibold text-green-600">Processed</span>
                                                    ) : (
                                                        <span className="font-semibold text-yellow-600">Pending</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="align-middle whitespace-nowrap">
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
                                                <TableCell className="align-middle whitespace-nowrap">
                                                    <div className="flex justify-end gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleEditOpen(txn)}
                                                            title="Edit"
                                                            disabled={isSaving}
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
                        <div className="mt-4 flex justify-center">
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
