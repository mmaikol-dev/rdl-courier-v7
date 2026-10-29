'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import AppLayout from '@/layouts/app-layout';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EAST_AFRICAN_COUNTRIES } from '@/lib/east-african-countries';
import { cn } from '@/lib/utils';
import { csrfHeaders } from '@/lib/csrf';
import { type BreadcrumbItem } from '@/types';
import { Deferred, Head, router, usePage } from '@inertiajs/react';
import {
    Check,
    ArrowDownLeft,
    ArrowUpRight,
    ChevronLeft,
    ChevronRight,
    ChevronsUpDown,
    Edit,
    Eye,
    Globe2,
    LoaderCircle,
    MoreHorizontal,
    PackagePlus,
    Plus,
    Search,
    ScanBarcodeIcon,
    ScanEyeIcon,
    Trash2,
    X,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/dashboard' },
    { title: 'Products', href: '/products' },
];

interface Product {
    id: number;
    name: string;
    store_name: string;
    merchant?: string | null;
    country?: string | null;
    slug: string;
    code: string;
    quantity: number;
    buying_price: number;
    selling_price: number;
    total_stock_added: number;
    total_stock_deducted: number;
    inbound_quantity: number;
    quantity_alert: number;
    tax: number;
    tax_type: string;
    notes: string;
    product_image: string;
    category_id: number;
    unit_id: number;
    user?: {
        id: number;
        name: string;
        store_address?: string | null;
    } | null;
}

interface PaginatedProducts {
    current_page: number;
    data: Product[];
    first_page_url: string;
    from: number;
    last_page: number;
    last_page_url: string;
    links: Array<{
        url: string | null;
        label: string;
        active: boolean;
    }>;
    next_page_url: string | null;
    path: string;
    per_page: number;
    prev_page_url: string | null;
    to: number;
    total: number;
}

interface InventoryLog {
    id: number;
    product_name: string;
    product_code: string;
    quantity_added: number;
    remaining_qnty: number;
    previous_quantity: number;
    updated_quantity: number;
    current_quantity: number;
    added_by: string;
    product_unit_id: number;
    date_added: string;
    created_at: string;
    updated_at: string;
}

interface BarcodeData {
    id: number;
    product_id: number;
    product_code: string;
    product_name: string;
    barcode: string;
    operation_type: 'inbound' | 'outbound';
    scanned_by: string;
    scanned_at: string;
}

interface ProductOverview {
    product: Product & {
        category?: Category | null;
        unit?: Unit | null;
        created_at: string;
        updated_at: string;
    };
    stock: {
        quantity: number;
        added: number;
        deducted: number;
    };
    transfers: {
        count: number;
        quantity: number;
        recent: Array<{
            id: number;
            quantity: number;
            region: string | null;
            from: string | null;
            date: string | null;
            created_at: string;
            agent?: { id: number; name: string } | null;
        }>;
    };
    deductions: {
        count: number;
        quantity: number;
        recent: Array<{
            id: number;
            code: string;
            quantity: number;
            reason: string | null;
            deducted_by: string;
            created_at: string;
            agent_name: string | null;
        }>;
    };
    inventoryLogs: InventoryLog[];
    barcodes: BarcodeData[];
}

interface Unit {
    id: number;
    name: string;
    short_code: string;
}

interface Category {
    id: number;
    name: string;
}

interface MerchantUser {
    id: number;
    name: string;
}

interface SearchableOption {
    value: string;
    label: string;
}

function SearchableSelect({
    label,
    placeholder,
    emptyMessage,
    value,
    options,
    onChange,
}: {
    label: string;
    placeholder: string;
    emptyMessage: string;
    value: string;
    options: SearchableOption[];
    onChange: (value: string) => void;
}) {
    const [open, setOpen] = React.useState(false);
    const selectedLabel = options.find((option) => option.value === value)?.label ?? '';

    return (
        <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        className={cn('h-10 w-full justify-between', !selectedLabel && 'text-muted-foreground')}
                    >
                        <span className="truncate">{selectedLabel || placeholder}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                        <CommandInput placeholder={`Search ${label.toLowerCase()}...`} />
                        <CommandList className="max-h-56">
                            <CommandEmpty>{emptyMessage}</CommandEmpty>
                            <CommandGroup>
                                <CommandItem
                                    value=""
                                    onSelect={() => {
                                        onChange('');
                                        setOpen(false);
                                    }}
                                >
                                    <Check className={cn('mr-2 h-4 w-4', value === '' ? 'opacity-100' : 'opacity-0')} />
                                    Clear selection
                                </CommandItem>
                                {options.map((option) => (
                                    <CommandItem
                                        key={option.value}
                                        value={option.label}
                                        onSelect={() => {
                                            onChange(option.value);
                                            setOpen(false);
                                        }}
                                    >
                                        <Check className={cn('mr-2 h-4 w-4', value === option.value ? 'opacity-100' : 'opacity-0')} />
                                        {option.label}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    );
}

const EMPTY_PRODUCTS: PaginatedProducts = {
    current_page: 1,
    data: [],
    first_page_url: '',
    from: 0,
    last_page: 1,
    last_page_url: '',
    links: [{ url: null, label: '1', active: true }],
    next_page_url: null,
    path: '',
    per_page: 10,
    prev_page_url: null,
    to: 0,
    total: 0,
};

function ProductsPageSkeleton() {
    return <div className="space-y-3" role="status" aria-label="Loading products" aria-live="polite">
        <div className="rounded-2xl border bg-card p-3"><div className="flex flex-col gap-2 lg:flex-row"><Skeleton className="h-10 w-full lg:max-w-md" /><Skeleton className="h-10 w-full sm:w-48" /><Skeleton className="h-10 w-full sm:w-40" /><Skeleton className="h-10 w-full sm:w-36" /></div></div>
        <div className="overflow-hidden rounded-2xl border"><div className="grid grid-cols-3 gap-3 border-b bg-muted/30 p-3 sm:grid-cols-7">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}</div>{Array.from({ length: 8 }).map((_, row) => <div key={row} className="grid grid-cols-3 gap-3 border-b p-3 last:border-0 sm:grid-cols-7">{Array.from({ length: 7 }).map((__, col) => <Skeleton key={col} className="h-5 w-full" />)}</div>)}</div>
        <div className="flex justify-center gap-2"><Skeleton className="h-9 w-24" /><Skeleton className="h-9 w-40" /><Skeleton className="h-9 w-24" /></div>
    </div>;
}

export default function ProductsPage() {
    const pageProps = usePage<{
        products?: PaginatedProducts;
        categories: Category[];
        units: Unit[];
        merchantUsers: MerchantUser[];
        filters?: {
            country?: string;
            search?: string;
            per_page?: number;
        };
        auth?: {
            user?: {
                id: number;
                name: string;
                roles?: string;
                store_address?: string | null;
            } | null;
        };
        selectedCountry?: string | null;
    }>().props;
    const products = pageProps.products ?? EMPTY_PRODUCTS;
    const categories = pageProps.categories ?? [];
    const units = pageProps.units ?? [];
    const merchantUsers = pageProps.merchantUsers ?? [];
    const auth = pageProps.auth;
    const filters = pageProps.filters;

    const userStoreAddress = auth?.user?.store_address || '';
    const isGlobalCountryUser = ['g.o.d', 'merchant'].includes((auth?.user?.roles || '').trim().toLowerCase());
    const dashboardCountry = pageProps.selectedCountry || '';

    const [filter, setFilter] = React.useState(filters?.search || '');
    const [selectedCountry, setSelectedCountry] = React.useState(
        isGlobalCountryUser ? dashboardCountry || 'all' : filters?.country || 'all',
    );
    const [pageSize, setPageSize] = React.useState(String(filters?.per_page ?? products.per_page ?? 10));
    const [isLoading, setIsLoading] = React.useState(false);
    const [countryFilterOpen, setCountryFilterOpen] = React.useState(false);
    const [pageSizeOpen, setPageSizeOpen] = React.useState(false);
    const [editingProduct, setEditingProduct] = React.useState<Product | null>(null);
    const [creatingProduct, setCreatingProduct] = React.useState(false);
    const [deletingProduct, setDeletingProduct] = React.useState<Product | null>(null);
    const [updatingProduct, setUpdatingProduct] = React.useState<Product | null>(null);
    const [quantityChange, setQuantityChange] = React.useState<number | null>(null);
    const [operation, setOperation] = React.useState<'add' | 'subtract'>('add');
    const [viewingLogs, setViewingLogs] = React.useState(false);
    const [inventoryLogs, setInventoryLogs] = React.useState<InventoryLog[]>([]);
    const [formValues, setFormValues] = React.useState<Partial<Product>>({});

    // Barcode scanning states
    const [scanningBarcodes, setScanningBarcodes] = React.useState(false);
    const [selectedProduct, setSelectedProduct] = React.useState<Product | null>(null);
    const [operationType, setOperationType] = React.useState<'inbound' | 'outbound'>('inbound');
    const [scannedBarcodes, setScannedBarcodes] = React.useState<string[]>([]);
    const [currentBarcode, setCurrentBarcode] = React.useState('');
    const [viewingBarcodeHistory, setViewingBarcodeHistory] = React.useState(false);
    const [barcodeHistory, setBarcodeHistory] = React.useState<BarcodeData[]>([]);
    const [overviewProduct, setOverviewProduct] = React.useState<Product | null>(null);
    const [productOverview, setProductOverview] = React.useState<ProductOverview | null>(null);
    const [isLoadingOverview, setIsLoadingOverview] = React.useState(false);
    const [overviewError, setOverviewError] = React.useState<string | null>(null);
    const [isProcessing, setIsProcessing] = React.useState(false);
    const [isCreating, setIsCreating] = React.useState(false);
    const [isSaving, setIsSaving] = React.useState(false);
    const [isDeleting, setIsDeleting] = React.useState(false);
    const [isUpdatingQuantity, setIsUpdatingQuantity] = React.useState(false);
    const overviewRequest = React.useRef<AbortController | null>(null);

    React.useEffect(() => {
        if (isGlobalCountryUser) {
            setSelectedCountry(dashboardCountry || 'all');
        }
    }, [dashboardCountry, isGlobalCountryUser]);

    React.useEffect(() => {
        const removeStart = router.on('start', () => setIsLoading(true));
        const removeFinish = router.on('finish', () => setIsLoading(false));
        const removeCancel = router.on('cancel', () => setIsLoading(false));
        const removeError = router.on('error', () => setIsLoading(false));

        return () => {
            removeStart();
            removeFinish();
            removeCancel();
            removeError();
        };
    }, []);

    React.useEffect(() => {
        if (!isLoading) {
            setCountryFilterOpen(false);
            setPageSizeOpen(false);
        }
    }, [isLoading]);

    const barcodeInputRef = React.useRef<HTMLInputElement>(null);
    const merchantOptions = React.useMemo(() => merchantUsers.map((merchant) => ({ value: merchant.name, label: merchant.name })), [merchantUsers]);
    const countryOptions = React.useMemo(() => EAST_AFRICAN_COUNTRIES.map((country) => ({ value: country, label: country })), []);
    const categoryOptions = React.useMemo(() => categories.map((category) => ({ value: String(category.id), label: category.name })), [categories]);
    const unitOptions = React.useMemo(() => units.map((unit) => ({ value: String(unit.id), label: `${unit.name} (${unit.short_code})` })), [units]);

    const filteredProducts = React.useMemo(() => {
        if (!products?.data) return [];
        return products.data;
    }, [products]);

    const handleSearch = () => {
        const params: Record<string, string> = { per_page: pageSize };
        if (filter) params.search = filter;
        if (!isGlobalCountryUser && selectedCountry && selectedCountry !== 'all') params.country = selectedCountry;
        router.get('/products', params, { preserveState: true, preserveScroll: true });
    };

    // Auto-focus barcode input when scanning modal opens
    React.useEffect(() => {
        if (scanningBarcodes && barcodeInputRef.current) {
            barcodeInputRef.current.focus();
        }
    }, [scanningBarcodes]);

    const handleCreate = () => {
        setIsCreating(true);
        router.post(
            '/products',
            {
                ...formValues,
                country: dashboardCountry || formValues.country || userStoreAddress,
            },
            {
                preserveState: true,
                onSuccess: () => {
                    setCreatingProduct(false);
                    setFormValues({});
                    toast.success('Product created successfully!');
                },
                onError: (errors) => {
                    console.error(errors);
                    const firstError = Object.values(errors)[0];
                    toast.error(typeof firstError === 'string' ? firstError : 'Failed to create product. Please check all required fields.');
                },
                onFinish: () => setIsCreating(false),
            },
        );
    };

    const handleEditSave = () => {
        if (!editingProduct) return;
        setIsSaving(true);
        const productDetails = { ...formValues };
        delete productDetails.quantity;
        router.put(`/products/${editingProduct.slug}`, productDetails, {
            preserveState: true,
            onSuccess: () => {
                setEditingProduct(null);
                setFormValues({});
                toast.success('Product updated successfully!');
            },
            onError: (errors) => {
                const firstError = Object.values(errors)[0];
                toast.error(typeof firstError === 'string' ? firstError : 'Failed to update product.');
            },
            onFinish: () => setIsSaving(false),
        });
    };

    const handleUpdateQuantity = () => {
        if (!updatingProduct || quantityChange === null) return;
        const finalChange = operation === 'subtract' ? -Math.abs(quantityChange) : Math.abs(quantityChange);
        setIsUpdatingQuantity(true);

        router.post(
            `/products/${updatingProduct.id}/update-quantity`,
            { quantity_change: finalChange },
            {
                preserveState: true,
                onSuccess: () => {
                    setUpdatingProduct(null);
                    setQuantityChange(null);
                    setOperation('add');
                    toast.success('Quantity updated successfully!');
                },
                onError: (errors) => {
                    const firstError = Object.values(errors)[0];
                    toast.error(typeof firstError === 'string' ? firstError : 'Failed to update quantity.');
                },
                onFinish: () => setIsUpdatingQuantity(false),
            },
        );
    };

    const handleDelete = () => {
        if (!deletingProduct) return;
        setIsDeleting(true);
        router.delete(`/products/${deletingProduct.slug}`, {
            preserveState: true,
            onSuccess: () => {
                setDeletingProduct(null);
                toast.success('Product deleted successfully!');
            },
            onError: (errors) => {
                const firstError = Object.values(errors)[0];
                toast.error(typeof firstError === 'string' ? firstError : 'Failed to delete product.');
            },
            onFinish: () => setIsDeleting(false),
        });
    };

    const handleViewLogs = async (productCode: string) => {
        try {
            const response = await fetch(`/products/${productCode}/inventory-logs`);
            const data = await response.json();
            setInventoryLogs(data.logs);
            setViewingLogs(true);
        } catch (error) {
            console.error('Failed to fetch inventory logs:', error);
            toast.error('Failed to fetch inventory logs.');
        }
    };

    const handleViewProduct = async (product: Product) => {
        overviewRequest.current?.abort();
        const request = new AbortController();
        overviewRequest.current = request;
        setOverviewProduct(product);
        setProductOverview(null);
        setOverviewError(null);
        setIsLoadingOverview(true);

        try {
            const response = await fetch(`/products/${product.slug}/overview`, {
                headers: { Accept: 'application/json' },
                signal: request.signal,
            });

            if (!response.ok) {
                throw new Error(response.status === 403 || response.status === 404
                    ? 'You do not have access to this product.'
                    : 'Could not load product details.');
            }

            setProductOverview(await response.json());
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return;
            setOverviewError(error instanceof Error ? error.message : 'Could not load product details.');
        } finally {
            if (!request.signal.aborted) {
                setIsLoadingOverview(false);
            }
        }
    };

    const handlePageChange = (url: string | null) => {
        if (!url) return;
        const params: Record<string, string> = {};
        if (!isGlobalCountryUser && selectedCountry && selectedCountry !== 'all') params.country = selectedCountry;
        if (filter) params.search = filter;
        params.per_page = pageSize;
        router.get(url, params, { preserveState: true, preserveScroll: true });
    };

    // Barcode scanning functions
    const handleStartScanning = (product: Product) => {
        setSelectedProduct(product);
        setScannedBarcodes([]);
        setCurrentBarcode('');
        setOperationType('inbound');
        setScanningBarcodes(true);
    };

    const handleAddBarcode = (e: React.FormEvent) => {
        e.preventDefault();
        if (currentBarcode.trim()) {
            setScannedBarcodes([...scannedBarcodes, currentBarcode.trim()]);
            setCurrentBarcode('');
            barcodeInputRef.current?.focus();
        }
    };

    const handleRemoveBarcode = (index: number) => {
        setScannedBarcodes(scannedBarcodes.filter((_, i) => i !== index));
    };

    const handleSubmitBarcodes = async () => {
        if (!selectedProduct || scannedBarcodes.length === 0) {
            toast.error('Please scan at least one barcode.');
            return;
        }

        setIsProcessing(true);

        try {
            const response = await fetch('/products/scan-barcodes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...csrfHeaders(),
                },
                body: JSON.stringify({
                    product_id: selectedProduct.id,
                    operation_type: operationType,
                    barcodes: scannedBarcodes,
                }),
            });

            const data = await response.json();

            if (data.success) {
                toast.success(data.message);
                setScanningBarcodes(false);
                setScannedBarcodes([]);
                setCurrentBarcode('');
                router.reload({ only: ['products'] });
            } else {
                toast.error(data.message);
            }
        } catch (error) {
            console.error('Failed to submit barcodes:', error);
            toast.error('Failed to process barcodes.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleViewBarcodeHistory = async (product: Product) => {
        try {
            const response = await fetch(`/products/${product.slug}/barcode-history`);
            const data = await response.json();

            if (data.success) {
                setBarcodeHistory(data.barcodes);
                setSelectedProduct(product);
                setViewingBarcodeHistory(true);
            }
        } catch (error) {
            console.error('Failed to fetch barcode history:', error);
            toast.error('Failed to fetch barcode history.');
        }
    };

    const resetProductForm = React.useCallback(() => {
        setFormValues({});
        setCreatingProduct(false);
        setEditingProduct(null);
    }, []);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Products" />

            <div className="flex flex-col gap-2 p-2 sm:p-3">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Product Inventory</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Manage products and track stock movements.</p>
                </div>

                <Deferred data="products" fallback={<ProductsPageSkeleton />}>
                {() => <>
                <Card className="overflow-hidden rounded-2xl border-border bg-card shadow-xs">
                    <CardHeader className="gap-0 border-b bg-muted/30 px-3 py-2 sm:px-4">
                        <div className="flex flex-col gap-1.5">
                            <div className="flex w-full flex-col gap-1.5 lg:flex-row lg:items-center">
                                <div className="flex min-w-0 flex-1 gap-2 sm:w-[min(28rem,50vw)]">
                                    <Input
                                        aria-label="Search products"
                                        placeholder="Search by name, merchant, store, or code"
                                        value={filter}
                                        onChange={(e) => setFilter(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleSearch();
                                        }}
                                        className="min-w-0 flex-1 bg-background"
                                    />
                                    <Button variant="default" onClick={handleSearch} disabled={isLoading} className="shrink-0">
                                        <Search className="size-4 sm:mr-1" />
                                        <span className="hidden sm:inline">Search</span>
                                    </Button>
                                </div>
                                {!isGlobalCountryUser ? <Popover open={countryFilterOpen} onOpenChange={setCountryFilterOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={countryFilterOpen}
                                            aria-label="Filter products by country"
                                            className="w-full justify-between bg-background sm:w-48"
                                        >
                                            <span className="flex min-w-0 items-center gap-2">
                                                <Globe2 className="size-4 shrink-0" />
                                                <span className="truncate">{selectedCountry === 'all' ? 'All countries' : selectedCountry}</span>
                                            </span>
                                            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent align="end" className="w-56 p-0">
                                        <Command>
                                            <CommandInput placeholder="Search countries..." />
                                            <CommandList className="max-h-60">
                                                {isLoading ? (
                                                    <div className="space-y-2 p-2" aria-label="Loading country options">
                                                        {Array.from({ length: 4 }).map((_, index) => (
                                                            <Skeleton key={index} className="h-8 w-full" />
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <>
                                                        <CommandEmpty>No country found.</CommandEmpty>
                                                        <CommandGroup>
                                                            {[{ value: 'all', label: 'All countries' }, ...EAST_AFRICAN_COUNTRIES.map((country) => ({ value: country, label: country }))].map(
                                                                (option) => (
                                                                    <CommandItem
                                                                        key={option.value}
                                                                        value={option.label}
                                                                        onSelect={() => {
                                                                            setSelectedCountry(option.value);
                                                                            const params: Record<string, string> = {};
                                                                            if (option.value !== 'all') params.country = option.value;
                                                                            if (filter) params.search = filter;
                                                                            params.per_page = pageSize;
                                                                            router.get('/products', params, {
                                                                                preserveState: true,
                                                                                preserveScroll: true,
                                                                                replace: true,
                                                                            });
                                                                            setCountryFilterOpen(true);
                                                                        }}
                                                                    >
                                                                        <Check className={selectedCountry === option.value ? 'opacity-100' : 'opacity-0'} />
                                                                        <span className="truncate">{option.label}</span>
                                                                    </CommandItem>
                                                                ),
                                                            )}
                                                        </CommandGroup>
                                                    </>
                                                )}
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover> : null}
                                <Popover open={pageSizeOpen} onOpenChange={setPageSizeOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={pageSizeOpen}
                                            aria-label="Rows per page"
                                            className="w-full justify-between bg-background lg:w-40"
                                        >
                                            <span>{pageSize} rows per page</span>
                                            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent align="end" className="w-44 p-0">
                                        <Command>
                                            <CommandInput placeholder="Search row count..." />
                                            <CommandList className="max-h-40">
                                                {isLoading ? (
                                                    <div className="space-y-2 p-2" aria-label="Loading row count options">
                                                        {Array.from({ length: 4 }).map((_, index) => (
                                                            <Skeleton key={index} className="h-8 w-full" />
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <>
                                                        <CommandEmpty>No row count found.</CommandEmpty>
                                                        <CommandGroup>
                                                            {[10, 20, 50, 100].map((count) => (
                                                                <CommandItem
                                                                    key={count}
                                                                    value={`${count} rows per page`}
                                                                    onSelect={() => {
                                                                        const nextSize = String(count);
                                                                        setPageSize(nextSize);
                                                                        const params: Record<string, string> = { per_page: nextSize };
                                                                        if (!isGlobalCountryUser && selectedCountry !== 'all') params.country = selectedCountry;
                                                                        if (filter) params.search = filter;
                                                                        router.get('/products', params, {
                                                                            preserveState: true,
                                                                            preserveScroll: true,
                                                                            replace: true,
                                                                        });
                                                                        setPageSizeOpen(true);
                                                                    }}
                                                                >
                                                                    <Check className={pageSize === String(count) ? 'opacity-100' : 'opacity-0'} />
                                                                    {count} rows per page
                                                                </CommandItem>
                                                            ))}
                                                        </CommandGroup>
                                                    </>
                                                )}
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                                <Button
                                    variant="default"
                                    className="shrink-0"
                                    onClick={() => {
                                        setEditingProduct(null);
                                        setFormValues({ country: dashboardCountry });
                                        setCreatingProduct(true);
                                    }}
                                >
                                    <Plus className="size-4" /> Create Product
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader className="bg-muted/30">
                                <TableRow className="h-8 hover:bg-transparent">
                                    <TableHead className="min-w-52 py-1 pl-3 sm:pl-4">Product</TableHead>
                                    <TableHead className="min-w-36 py-1">Merchant / store</TableHead>
                                    <TableHead className="py-1 text-right">Total stock added</TableHead>
                                    <TableHead className="py-1 text-right">Total stock deducted</TableHead>
                                    <TableHead className="min-w-32 py-1">Stock remaining</TableHead>
                                    <TableHead className="py-1">Country</TableHead>
                                    <TableHead className="w-12 py-1 pr-3 text-right sm:pr-4">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredProducts.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                                            No products found. Try changing the search or country filter.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredProducts.map((product) => {
                                        const isOutOfStock = product.quantity <= 0;
                                        const isLowStock = !isOutOfStock && product.quantity_alert > 0 && product.quantity <= product.quantity_alert;

                                        return (
                                            <TableRow key={product.id} className="group h-12">
                                                <TableCell className="max-w-72 whitespace-normal py-1 pl-3 sm:pl-4">
                                                    <div className="min-w-0">
                                                        <p className="truncate font-medium text-foreground" title={product.name}>
                                                            {product.name}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">
                                                            Code: {product.code || '—'}
                                                        </p>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="max-w-56 py-1">
                                                    <p className="truncate font-medium" title={product.merchant || ''}>
                                                        {product.merchant || '—'}
                                                    </p>
                                                    <p className="truncate text-xs text-muted-foreground" title={product.store_name || ''}>
                                                        {product.store_name || product.user?.store_address || 'No store'}
                                                    </p>
                                                </TableCell>
                                                <TableCell className="py-1 text-right font-medium tabular-nums">
                                                    {Number(product.total_stock_added || 0).toLocaleString()}
                                                </TableCell>
                                                <TableCell className="py-1 text-right font-medium tabular-nums">
                                                    {Number(product.total_stock_deducted || 0).toLocaleString()}
                                                </TableCell>
                                                <TableCell className="py-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium tabular-nums">{product.quantity.toLocaleString()}</span>
                                                        <Badge
                                                            variant={isOutOfStock ? 'destructive' : isLowStock ? 'outline' : 'secondary'}
                                                            className={isLowStock ? 'border-warning/30 bg-warning/10 text-warning' : ''}
                                                        >
                                                            {isOutOfStock ? 'Out' : isLowStock ? 'Low' : 'In stock'}
                                                        </Badge>
                                                    </div>
                                                    {product.quantity_alert > 0 && (
                                                        <p className="text-xs text-muted-foreground">
                                                            Alert at {product.quantity_alert.toLocaleString()}
                                                        </p>
                                                    )}
                                                    {Number(product.inbound_quantity || 0) > 0 && (
                                                        <p className="text-xs text-primary">Inbound: {Number(product.inbound_quantity).toLocaleString()}</p>
                                                    )}
                                                </TableCell>
                                                <TableCell className="py-1">{product.country || '—'}</TableCell>
                                                <TableCell className="py-1 pr-3 text-right sm:pr-4">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" aria-label={`Actions for ${product.name}`}>
                                                                <MoreHorizontal className="size-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-52">
                                                            <DropdownMenuLabel className="max-w-48 truncate">{product.name}</DropdownMenuLabel>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem onSelect={() => void handleViewProduct(product)}>
                                                                <Eye /> View product details
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                onSelect={() => {
                                                                    setUpdatingProduct(product);
                                                                    setQuantityChange(null);
                                                                    setOperation('add');
                                                                }}
                                                            >
                                                                <PackagePlus /> Update stock
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onSelect={() => handleStartScanning(product)}>
                                                                <ScanBarcodeIcon /> Scan barcodes
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onSelect={() => handleViewLogs(product.code)}>
                                                                <Eye /> Inventory logs
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onSelect={() => handleViewBarcodeHistory(product)}>
                                                                <ScanEyeIcon /> Barcode history
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                onSelect={() => {
                                                                    setCreatingProduct(false);
                                                                    setEditingProduct(product);
                                                                    setFormValues(product);
                                                                }}
                                                            >
                                                                <Edit /> Edit product
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                className="text-destructive focus:text-destructive"
                                                                onSelect={() => setDeletingProduct(product)}
                                                            >
                                                                <Trash2 /> Delete product
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* Pagination Controls */}
                <div className="mt-2 flex items-center justify-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handlePageChange(products.prev_page_url)} disabled={!products.prev_page_url}>
                        <ChevronLeft size={16} /> Previous
                    </Button>

                    <div className="flex gap-1">
                        {products.links.slice(1, -1).map((link, index) => (
                            <Button
                                key={index}
                                variant={link.active ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => handlePageChange(link.url)}
                                disabled={!link.url}
                                className="min-w-[40px]"
                            >
                                {link.label}
                            </Button>
                        ))}
                    </div>

                    <Button variant="outline" size="sm" onClick={() => handlePageChange(products.next_page_url)} disabled={!products.next_page_url}>
                        Next <ChevronRight size={16} />
                    </Button>
                </div>
                </>}
                </Deferred>
            </div>

            <Sheet
                open={overviewProduct !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        overviewRequest.current?.abort();
                        setOverviewProduct(null);
                        setProductOverview(null);
                        setOverviewError(null);
                        setIsLoadingOverview(false);
                    }
                }}
            >
                <SheetContent side="right" className="w-full gap-0 overflow-hidden p-0 sm:max-w-xl">
                    <SheetHeader className="border-b px-5 py-4 pr-12">
                        <SheetTitle className="truncate text-left text-lg">{overviewProduct?.name || 'Product details'}</SheetTitle>
                        <SheetDescription className="text-left">
                            {overviewProduct ? `Code ${overviewProduct.code} · ${overviewProduct.merchant || 'No merchant'}` : 'Product inventory and activity'}
                        </SheetDescription>
                    </SheetHeader>

                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                        {isLoadingOverview ? (
                            <div className="space-y-4" aria-label="Loading product details">
                                <div className="grid grid-cols-3 gap-2">
                                    {Array.from({ length: 3 }).map((_, index) => (
                                        <Skeleton key={index} className="h-20" />
                                    ))}
                                </div>
                                {Array.from({ length: 4 }).map((_, index) => (
                                    <div key={index} className="space-y-2 rounded-xl border p-3">
                                        <Skeleton className="h-4 w-32" />
                                        <Skeleton className="h-8 w-full" />
                                        <Skeleton className="h-8 w-4/5" />
                                    </div>
                                ))}
                            </div>
                        ) : overviewError ? (
                            <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                                <span>{overviewError}</span>
                                <Button variant="outline" size="sm" onClick={() => overviewProduct && void handleViewProduct(overviewProduct)}>
                                    Retry
                                </Button>
                            </div>
                        ) : productOverview ? (
                            <div className="space-y-3">
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="rounded-xl border bg-card p-3">
                                        <p className="text-xs text-muted-foreground">In stock</p>
                                        <p className="mt-1 text-lg font-semibold tabular-nums">
                                            {productOverview.stock.quantity.toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="rounded-xl border bg-card p-3">
                                        <p className="text-xs text-muted-foreground">Transferred</p>
                                        <p className="mt-1 text-lg font-semibold tabular-nums">
                                            {productOverview.transfers.quantity.toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="rounded-xl border bg-card p-3">
                                        <p className="text-xs text-muted-foreground">Returned / deducted</p>
                                        <p className="mt-1 text-lg font-semibold tabular-nums">
                                            {productOverview.deductions.quantity.toLocaleString()}
                                        </p>
                                    </div>
                                </div>

                                <section className="rounded-xl border p-3">
                                    <h3 className="mb-2 text-sm font-semibold">Product information</h3>
                                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                        <div><dt className="text-xs text-muted-foreground">Merchant</dt><dd className="truncate">{productOverview.product.merchant || '—'}</dd></div>
                                        <div><dt className="text-xs text-muted-foreground">Country</dt><dd className="truncate">{productOverview.product.country || '—'}</dd></div>
                                        <div><dt className="text-xs text-muted-foreground">Category</dt><dd className="truncate">{productOverview.product.category?.name || '—'}</dd></div>
                                        <div><dt className="text-xs text-muted-foreground">Unit</dt><dd className="truncate">{productOverview.product.unit?.name || '—'}</dd></div>
                                        <div><dt className="text-xs text-muted-foreground">Selling price</dt><dd>{Number(productOverview.product.selling_price || 0).toLocaleString()}</dd></div>
                                        <div><dt className="text-xs text-muted-foreground">Buying price</dt><dd>{Number(productOverview.product.buying_price || 0).toLocaleString()}</dd></div>
                                        <div><dt className="text-xs text-muted-foreground">Low-stock alert</dt><dd>{Number(productOverview.product.quantity_alert || 0).toLocaleString()}</dd></div>
                                        <div><dt className="text-xs text-muted-foreground">Created</dt><dd>{new Date(productOverview.product.created_at).toLocaleDateString()}</dd></div>
                                    </dl>
                                    {productOverview.product.notes && (
                                        <p className="mt-3 border-t pt-2 text-sm text-muted-foreground">{productOverview.product.notes}</p>
                                    )}
                                </section>

                                <section className="rounded-xl border p-3">
                                    <div className="mb-2 flex items-center justify-between">
                                        <h3 className="text-sm font-semibold">Stock movements</h3>
                                        <span className="text-xs text-muted-foreground">
                                            +{productOverview.stock.added.toLocaleString()} / −{productOverview.stock.deducted.toLocaleString()}
                                        </span>
                                    </div>
                                    {productOverview.inventoryLogs.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">No stock movements recorded.</p>
                                    ) : (
                                        <div className="divide-y">
                                            {productOverview.inventoryLogs.map((log) => (
                                                <div key={log.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                                                    <div className="min-w-0">
                                                        <p className="truncate font-medium">{log.added_by || 'System'}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            Previous {Number(log.previous_quantity).toLocaleString()} · Updated {Number(log.updated_quantity) > 0 ? '+' : ''}
                                                            {Number(log.updated_quantity).toLocaleString()} · Current {Number(log.current_quantity).toLocaleString()}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">{new Date(log.date_added || log.created_at).toLocaleString()}</p>
                                                    </div>
                                                    <div className="shrink-0 text-right">
                                                        <p className="flex items-center justify-end gap-1 font-medium tabular-nums">
                                                            {Number(log.quantity_added) >= 0 ? <ArrowDownLeft className="size-3 text-success" /> : <ArrowUpRight className="size-3 text-destructive" />}
                                                            {Number(log.quantity_added) > 0 ? '+' : ''}{Number(log.quantity_added).toLocaleString()}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </section>

                                <section className="rounded-xl border p-3">
                                    <div className="mb-2 flex items-center justify-between">
                                        <h3 className="text-sm font-semibold">Transfers</h3>
                                        <span className="text-xs text-muted-foreground">
                                            {productOverview.transfers.count} records · {productOverview.transfers.quantity.toLocaleString()} units
                                        </span>
                                    </div>
                                    {productOverview.transfers.recent.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">No transfers recorded.</p>
                                    ) : (
                                        <div className="divide-y">
                                            {productOverview.transfers.recent.map((transfer) => (
                                                <div key={transfer.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                                                    <div className="min-w-0">
                                                        <p className="truncate font-medium">{transfer.agent?.name || 'Unknown agent'}</p>
                                                        <p className="truncate text-xs text-muted-foreground">
                                                            {[transfer.region, transfer.from, transfer.date].filter(Boolean).join(' · ') || 'Transfer'}
                                                        </p>
                                                    </div>
                                                    <span className="shrink-0 font-medium tabular-nums">{Number(transfer.quantity).toLocaleString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </section>

                                <section className="rounded-xl border p-3">
                                    <div className="mb-2 flex items-center justify-between">
                                        <h3 className="text-sm font-semibold">Returns and deductions</h3>
                                        <span className="text-xs text-muted-foreground">
                                            {productOverview.deductions.count} records · {productOverview.deductions.quantity.toLocaleString()} units
                                        </span>
                                    </div>
                                    {productOverview.deductions.recent.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">No returns or deductions recorded.</p>
                                    ) : (
                                        <div className="divide-y">
                                            {productOverview.deductions.recent.map((deduction) => (
                                                <div key={deduction.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                                                    <div className="min-w-0">
                                                        <p className="truncate font-medium">{deduction.agent_name || deduction.deducted_by} · {deduction.code}</p>
                                                        <p className="truncate text-xs text-muted-foreground">{deduction.reason || 'No reason'} · {new Date(deduction.created_at).toLocaleDateString()}</p>
                                                    </div>
                                                    <span className="shrink-0 font-medium tabular-nums">{Number(deduction.quantity).toLocaleString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </section>

                                <section className="rounded-xl border p-3">
                                    <div className="mb-2 flex items-center justify-between">
                                        <h3 className="text-sm font-semibold">Recent barcode scans</h3>
                                        <span className="text-xs text-muted-foreground">{productOverview.barcodes.length} shown</span>
                                    </div>
                                    {productOverview.barcodes.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">No barcode scans recorded.</p>
                                    ) : (
                                        <div className="divide-y">
                                            {productOverview.barcodes.map((barcode) => (
                                                <div key={barcode.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                                                    <div className="min-w-0">
                                                        <p className="truncate font-mono">{barcode.barcode}</p>
                                                        <p className="text-xs text-muted-foreground">{barcode.scanned_by} · {new Date(barcode.scanned_at).toLocaleString()}</p>
                                                    </div>
                                                    <Badge variant={barcode.operation_type === 'inbound' ? 'secondary' : 'outline'}>
                                                        {barcode.operation_type}
                                                    </Badge>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </section>
                            </div>
                        ) : null}
                    </div>
                </SheetContent>
            </Sheet>

            {/* Barcode Scanning Modal */}
            <Dialog open={scanningBarcodes} onOpenChange={(open) => !open && setScanningBarcodes(false)}>
                <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Scan Barcodes - {selectedProduct?.name}</DialogTitle>
                        <DialogDescription>
                            Select operation type and scan multiple barcodes. Total scanned: {scannedBarcodes.length}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="mt-4 space-y-4">
                        {/* Operation Type Selection */}
                        <div>
                            <label className="mb-2 block text-sm font-medium">Operation Type</label>
                            <div className="flex gap-4">
                                <label className="flex cursor-pointer items-center gap-2">
                                    <input
                                        type="radio"
                                        name="operationType"
                                        value="inbound"
                                        checked={operationType === 'inbound'}
                                        onChange={(e) => setOperationType(e.target.value as 'inbound' | 'outbound')}
                                        className="h-4 w-4"
                                    />
                                    <span className="text-sm">Inbound (Add Stock)</span>
                                </label>
                                <label className="flex cursor-pointer items-center gap-2">
                                    <input
                                        type="radio"
                                        name="operationType"
                                        value="outbound"
                                        checked={operationType === 'outbound'}
                                        onChange={(e) => setOperationType(e.target.value as 'inbound' | 'outbound')}
                                        className="h-4 w-4"
                                    />
                                    <span className="text-sm">Outbound (Remove Stock)</span>
                                </label>
                            </div>
                        </div>

                        {/* Barcode Input */}
                        <form onSubmit={handleAddBarcode} className="flex gap-2">
                            <Input
                                ref={barcodeInputRef}
                                type="text"
                                value={currentBarcode}
                                onChange={(e) => setCurrentBarcode(e.target.value)}
                                placeholder="Scan or enter barcode..."
                                className="flex-1"
                                autoFocus
                            />
                            <Button type="submit" variant="default">
                                Add
                            </Button>
                        </form>

                        {/* Scanned Barcodes List */}
                        <div className="max-h-64 overflow-y-auto rounded-lg border p-4">
                            <div className="mb-2 flex items-center justify-between">
                                <h4 className="text-sm font-medium">Scanned Barcodes ({scannedBarcodes.length})</h4>
                                {scannedBarcodes.length > 0 && (
                                    <Button size="sm" variant="outline" onClick={() => setScannedBarcodes([])}>
                                        Clear All
                                    </Button>
                                )}
                            </div>

                            {scannedBarcodes.length === 0 ? (
                                <p className="py-4 text-center text-sm text-muted-foreground">
                                    No barcodes scanned yet. Start scanning to add items.
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {scannedBarcodes.map((barcode, index) => (
                                        <div key={index} className="flex items-center justify-between rounded bg-secondary/50 p-2">
                                            <span className="font-mono text-sm">{barcode}</span>
                                            <Button size="sm" variant="ghost" onClick={() => handleRemoveBarcode(index)}>
                                                <X size={14} />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Summary */}
                        <div className="rounded-lg bg-muted p-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p className="text-muted-foreground">Current Quantity</p>
                                    <p className="text-lg font-semibold">{selectedProduct?.quantity || 0}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">{operationType === 'inbound' ? 'Will Add' : 'Will Remove'}</p>
                                    <p className="text-lg font-semibold">
                                        {operationType === 'inbound' ? '+' : '-'}
                                        {scannedBarcodes.length}
                                    </p>
                                </div>
                                <div className="col-span-2">
                                    <p className="text-muted-foreground">New Quantity</p>
                                    <p className="text-lg font-semibold">
                                        {operationType === 'inbound'
                                            ? (selectedProduct?.quantity || 0) + scannedBarcodes.length
                                            : (selectedProduct?.quantity || 0) - scannedBarcodes.length}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setScanningBarcodes(false)} disabled={isProcessing}>
                            Cancel
                        </Button>
                        <Button onClick={handleSubmitBarcodes} disabled={scannedBarcodes.length === 0 || isProcessing}>
                            {isProcessing ? 'Processing...' : `Submit ${scannedBarcodes.length} Barcode(s)`}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Barcode History Modal */}
            <Dialog open={viewingBarcodeHistory} onOpenChange={(open) => !open && setViewingBarcodeHistory(false)}>
                <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Barcode History - {selectedProduct?.name}</DialogTitle>
                        <DialogDescription>Complete history of scanned barcodes for this product</DialogDescription>
                    </DialogHeader>

                    <div className="mt-4 space-y-2">
                        {barcodeHistory.length === 0 ? (
                            <div className="py-8 text-center text-muted-foreground">No barcode history found for this product.</div>
                        ) : (
                            <div className="space-y-2">
                                {barcodeHistory.map((record) => (
                                    <div key={record.id} className="rounded-lg border p-3 transition-colors hover:bg-secondary/50">
                                        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                                            <div>
                                                <p className="text-xs text-muted-foreground">Barcode</p>
                                                <p className="font-mono font-medium">{record.barcode}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-muted-foreground">Operation</p>
                                                <p
                                                    className={`font-medium ${
                                                        record.operation_type === 'inbound' ? 'text-success' : 'text-destructive'
                                                    }`}
                                                >
                                                    {record.operation_type === 'inbound' ? '+ Inbound' : '- Outbound'}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-muted-foreground">Scanned By</p>
                                                <p className="font-medium">{record.scanned_by}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-muted-foreground">Date</p>
                                                <p className="font-medium">{new Date(record.scanned_at).toLocaleString()}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="mt-4 flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setViewingBarcodeHistory(false)}>
                            Close
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Create Modal */}
            <Dialog
                open={creatingProduct}
                onOpenChange={(open) => {
                    if (!open) {
                        resetProductForm();
                    }
                }}
            >
                <DialogContent className="max-h-[88vh] max-w-4xl gap-3 overflow-y-auto p-4 sm:p-5">
                    <DialogHeader className="gap-1">
                        <DialogTitle className="text-xl">Create Product</DialogTitle>
                        <DialogDescription className="text-xs">
                            Add product details. Store name, slug, and code are generated automatically.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2 xl:grid-cols-3">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">Product Name *</label>
                            <Input
                                value={formValues.name || ''}
                                onChange={(e) => setFormValues({ ...formValues, name: e.target.value })}
                                placeholder="Enter product name"
                            />
                        </div>
                        <div>
                            {isGlobalCountryUser && dashboardCountry ? (
                                <Input value={dashboardCountry} readOnly />
                            ) : isGlobalCountryUser ? (
                                <SearchableSelect
                                    label="Country"
                                    placeholder="Select country"
                                    emptyMessage="No country found."
                                    value={String(formValues.country || '')}
                                    options={countryOptions}
                                    onChange={(value) => setFormValues({ ...formValues, country: value })}
                                />
                            ) : (
                                <>
                                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Country</label>
                                    <Input value={userStoreAddress} readOnly placeholder="Country comes from your account" />
                                </>
                            )}
                        </div>
                        <SearchableSelect
                            label="Merchant"
                            placeholder="Select merchant"
                            emptyMessage="No merchant found."
                            value={String(formValues.merchant || '')}
                            options={merchantOptions}
                            onChange={(value) => setFormValues({ ...formValues, merchant: value })}
                        />
                        <SearchableSelect
                            label="Category *"
                            placeholder="Select category"
                            emptyMessage="No category found."
                            value={formValues.category_id ? String(formValues.category_id) : ''}
                            options={categoryOptions}
                            onChange={(value) => setFormValues({ ...formValues, category_id: value ? parseInt(value, 10) : undefined })}
                        />
                        <SearchableSelect
                            label="Unit *"
                            placeholder="Select unit"
                            emptyMessage="No unit found."
                            value={formValues.unit_id ? String(formValues.unit_id) : ''}
                            options={unitOptions}
                            onChange={(value) => setFormValues({ ...formValues, unit_id: value ? parseInt(value, 10) : undefined })}
                        />
                        <div>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">Quantity *</label>
                            <Input
                                type="number"
                                value={formValues.quantity || ''}
                                onChange={(e) => setFormValues({ ...formValues, quantity: parseFloat(e.target.value) || 0 })}
                                placeholder="Enter quantity"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">Buying Price</label>
                            <Input
                                type="number"
                                step="0.01"
                                value={formValues.buying_price || ''}
                                onChange={(e) => setFormValues({ ...formValues, buying_price: parseFloat(e.target.value) || 0 })}
                                placeholder="Enter buying price"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">Selling Price</label>
                            <Input
                                type="number"
                                step="0.01"
                                value={formValues.selling_price || ''}
                                onChange={(e) => setFormValues({ ...formValues, selling_price: parseFloat(e.target.value) || 0 })}
                                placeholder="Enter selling price"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">Quantity Alert</label>
                            <Input
                                type="number"
                                value={formValues.quantity_alert || ''}
                                onChange={(e) => setFormValues({ ...formValues, quantity_alert: parseFloat(e.target.value) || 0 })}
                                placeholder="Enter alert threshold"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">Tax</label>
                            <Input
                                type="number"
                                step="0.01"
                                value={formValues.tax || ''}
                                onChange={(e) => setFormValues({ ...formValues, tax: parseFloat(e.target.value) || 0 })}
                                placeholder="Enter tax amount"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">Tax Type</label>
                            <Input
                                value={formValues.tax_type || ''}
                                onChange={(e) => setFormValues({ ...formValues, tax_type: e.target.value })}
                                placeholder="e.g., VAT, Sales Tax"
                            />
                        </div>
                        <div className="sm:col-span-2 xl:col-span-3">
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
                            <Input
                                value={formValues.notes || ''}
                                onChange={(e) => setFormValues({ ...formValues, notes: e.target.value })}
                                placeholder="Additional notes"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 border-t pt-3">
                        <Button variant="outline" onClick={resetProductForm}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreate} disabled={isCreating} className="gap-2">
                            {isCreating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                            Create
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit Modal */}
            <Dialog
                open={!!editingProduct}
                onOpenChange={(open) => {
                    if (!open) {
                        resetProductForm();
                    }
                }}
            >
                <DialogContent className="max-h-[90vh] max-w-md gap-3 overflow-y-auto p-4">
                    <DialogHeader>
                        <DialogTitle>Edit Product</DialogTitle>
                        <DialogDescription>Update product details below. Code: {editingProduct?.code}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2.5">
                        <div>
                            <label className="text-sm font-medium">Product Name *</label>
                            <Input
                                value={formValues.name || ''}
                                onChange={(e) => setFormValues({ ...formValues, name: e.target.value })}
                                placeholder="Product name"
                            />
                        </div>
                        <SearchableSelect
                            label="Merchant"
                            placeholder="Select merchant"
                            emptyMessage="No merchant found."
                            value={String(formValues.merchant || '')}
                            options={merchantOptions}
                            onChange={(value) => setFormValues({ ...formValues, merchant: value })}
                        />
                        <div>
                            <label className="text-sm font-medium">Buying Price</label>
                            <Input
                                type="number"
                                step="0.01"
                                value={formValues.buying_price || ''}
                                onChange={(e) => setFormValues({ ...formValues, buying_price: parseFloat(e.target.value) || 0 })}
                                placeholder="Buying price"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium">Selling Price</label>
                            <Input
                                type="number"
                                step="0.01"
                                value={formValues.selling_price || ''}
                                onChange={(e) => setFormValues({ ...formValues, selling_price: parseFloat(e.target.value) || 0 })}
                                placeholder="Selling price"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium">Quantity Alert</label>
                            <Input
                                type="number"
                                value={formValues.quantity_alert || ''}
                                onChange={(e) => setFormValues({ ...formValues, quantity_alert: parseFloat(e.target.value) || 0 })}
                                placeholder="Alert threshold"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium">Tax</label>
                            <Input
                                type="number"
                                step="0.01"
                                value={formValues.tax || ''}
                                onChange={(e) => setFormValues({ ...formValues, tax: parseFloat(e.target.value) || 0 })}
                                placeholder="Tax"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium">Tax Type</label>
                            <Input
                                value={formValues.tax_type || ''}
                                onChange={(e) => setFormValues({ ...formValues, tax_type: e.target.value })}
                                placeholder="Tax type"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium">Notes</label>
                            <Input
                                value={formValues.notes || ''}
                                onChange={(e) => setFormValues({ ...formValues, notes: e.target.value })}
                                placeholder="Notes"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={resetProductForm}>
                            Cancel
                        </Button>
                        <Button onClick={handleEditSave} disabled={isSaving} className="gap-2">
                            {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                            Save
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Delete Modal */}
            <Dialog open={!!deletingProduct} onOpenChange={(open) => !open && setDeletingProduct(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Confirm Delete</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete <strong>{deletingProduct?.name}</strong>?
                        </DialogDescription>
                    </DialogHeader>
                    <div className="mt-4 flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setDeletingProduct(null)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={isDeleting} className="gap-2">
                            {isDeleting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                            Delete
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Inventory Logs Modal */}
            <Dialog open={viewingLogs} onOpenChange={(open) => !open && setViewingLogs(false)}>
                <DialogContent className="max-h-[85vh] max-w-2xl gap-3 overflow-hidden p-4 sm:p-5">
                    <DialogHeader className="gap-1">
                        <DialogTitle className="text-lg">Stock movement history</DialogTitle>
                        <DialogDescription>
                            {inventoryLogs[0]?.product_name || 'Product'} · {inventoryLogs.length} {inventoryLogs.length === 1 ? 'record' : 'records'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
                        {inventoryLogs.length === 0 ? (
                            <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                                No stock movements have been recorded for this product.
                            </div>
                        ) : (
                            inventoryLogs.map((log) => (
                                <div key={log.id} className="rounded-lg border bg-card p-3">
                                    <div className="mb-2 flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium">{log.added_by || 'System'}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {new Date(log.date_added || log.created_at).toLocaleString()}
                                            </p>
                                        </div>
                                        <Badge variant={Number(log.updated_quantity) >= 0 ? 'secondary' : 'outline'}>
                                            {Number(log.updated_quantity) >= 0 ? 'Stock added' : 'Stock removed'}
                                        </Badge>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="rounded-md bg-muted/50 px-2.5 py-2">
                                            <p className="text-[11px] text-muted-foreground">Previous</p>
                                            <p className="mt-0.5 text-sm font-semibold tabular-nums">
                                                {Number(log.previous_quantity).toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="rounded-md bg-muted/50 px-2.5 py-2">
                                            <p className="text-[11px] text-muted-foreground">Change</p>
                                            <p className={`mt-0.5 flex items-center gap-1 text-sm font-semibold tabular-nums ${Number(log.updated_quantity) >= 0 ? 'text-success' : 'text-destructive'}`}>
                                                {Number(log.updated_quantity) >= 0 ? (
                                                    <ArrowDownLeft className="size-3.5" />
                                                ) : (
                                                    <ArrowUpRight className="size-3.5" />
                                                )}
                                                {Number(log.updated_quantity) > 0 ? '+' : ''}
                                                {Number(log.updated_quantity).toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="rounded-md bg-muted/50 px-2.5 py-2">
                                            <p className="text-[11px] text-muted-foreground">Current</p>
                                            <p className="mt-0.5 text-sm font-semibold tabular-nums">
                                                {Number(log.current_quantity).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    <div className="flex justify-end border-t pt-3">
                        <Button variant="outline" size="sm" onClick={() => setViewingLogs(false)}>
                            Close
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog
                open={updatingProduct !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setUpdatingProduct(null);
                        setQuantityChange(null);
                        setOperation('add');
                    }
                }}
            >
                <DialogContent className="max-w-sm gap-3 p-4">
                    <DialogHeader>
                        <DialogTitle>Update stock</DialogTitle>
                        <DialogDescription>
                            Adjust stock for <strong>{updatingProduct?.name}</strong>. This change will be recorded in inventory logs.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-[1fr_1.5fr] gap-2">
                        <select
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                            value={operation}
                            onChange={(e) => setOperation(e.target.value as 'add' | 'subtract')}
                            aria-label="Stock operation"
                        >
                            <option value="add">Add</option>
                            <option value="subtract">Subtract</option>
                        </select>
                        <Input
                            type="number"
                            min="0"
                            step="any"
                            value={quantityChange ?? ''}
                            onChange={(e) => setQuantityChange(e.target.value === '' ? null : Number(e.target.value))}
                            placeholder="Quantity"
                            aria-label="Quantity to update"
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Current stock: {Number(updatingProduct?.quantity ?? 0).toLocaleString()}
                    </p>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setUpdatingProduct(null)} disabled={isUpdatingQuantity}>
                            Cancel
                        </Button>
                        <Button onClick={handleUpdateQuantity} disabled={quantityChange === null || quantityChange <= 0 || isUpdatingQuantity}>
                            {isUpdatingQuantity ? <LoaderCircle className="size-4 animate-spin" /> : null}
                            Update stock
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

        </AppLayout>
    );
}
