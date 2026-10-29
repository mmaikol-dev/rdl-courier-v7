import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, useForm } from '@inertiajs/react';
import { ArrowLeft, LoaderCircle, PackagePlus, ScanBarcode, Trash2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

interface Warehouse {
    code: string;
    name: string;
    country: string;
}

interface ProductOption {
    id: number;
    name: string;
    code: string | null;
    quantity: number;
}

interface ShipmentForm {
    supplier: string;
    supplier_reference: string;
    carrier: string;
    tracking_number: string;
    expected_on: string;
    cartons: string;
    warehouse_code: string;
    note: string;
    items: Array<{ product_id: number; expected_quantity: number }>;
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Inventory', href: '/products' },
    { title: 'Shipments', href: '/shipments' },
    { title: 'New shipment', href: '/shipments/create' },
];

export default function CreateShipment({ warehouses, defaultWarehouseCode }: { warehouses: Warehouse[]; defaultWarehouseCode: string | null }) {
    const { data, setData, post, processing, errors } = useForm<ShipmentForm>({
        supplier: '',
        supplier_reference: '',
        carrier: '',
        tracking_number: '',
        expected_on: '',
        cartons: '',
        warehouse_code: defaultWarehouseCode ?? '',
        note: '',
        items: [],
    });
    const [products, setProducts] = React.useState<ProductOption[]>([]);
    const [chosenProducts, setChosenProducts] = React.useState<Record<number, ProductOption>>({});
    const [productSearch, setProductSearch] = React.useState('');
    const [selectedProductId, setSelectedProductId] = React.useState('');
    const [sku, setSku] = React.useState('');
    const [loadingProducts, setLoadingProducts] = React.useState(false);

    const warehouse = warehouses.find((option) => option.code === data.warehouse_code);

    React.useEffect(() => {
        if (!data.warehouse_code) {
            setProducts([]);
            return;
        }

        const abortController = new AbortController();
        const timeout = window.setTimeout(async () => {
            setLoadingProducts(true);
            try {
                const query = new URLSearchParams({ warehouse_code: data.warehouse_code, search: productSearch });
                const response = await fetch(`/shipments/products?${query.toString()}`, { signal: abortController.signal });
                if (!response.ok) throw new Error('Could not load products for this warehouse.');
                const result = await response.json();
                setProducts(result.products ?? []);
            } catch (error) {
                if ((error as Error).name !== 'AbortError') toast.error((error as Error).message || 'Could not load products.');
            } finally {
                if (!abortController.signal.aborted) setLoadingProducts(false);
            }
        }, 180);

        return () => {
            window.clearTimeout(timeout);
            abortController.abort();
        };
    }, [data.warehouse_code, productSearch]);

    const addProduct = (product: ProductOption) => {
        setChosenProducts((current) => ({ ...current, [product.id]: product }));
        const existing = data.items.find((item) => item.product_id === product.id);
        setData('items', existing
            ? data.items.map((item) => item.product_id === product.id ? { ...item, expected_quantity: item.expected_quantity + 1 } : item)
            : [...data.items, { product_id: product.id, expected_quantity: 1 }]);
        setSelectedProductId('');
        setSku('');
        setProductSearch('');
    };

    const addSelectedProduct = () => {
        const product = products.find((option) => String(option.id) === selectedProductId);
        if (product) addProduct(product);
    };

    const scanSku = async (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const code = sku.trim();
        if (!code || !data.warehouse_code) return;

        try {
            const query = new URLSearchParams({ warehouse_code: data.warehouse_code, search: code });
            const response = await fetch(`/shipments/products?${query.toString()}`);
            const result = await response.json();
            const product = (result.products as ProductOption[] | undefined)?.find((option) => option.code?.toLowerCase() === code.toLowerCase());
            if (!product) {
                toast.error(`No product found for SKU ${code} in this warehouse country.`);
                return;
            }
            addProduct(product);
            toast.success(`${product.code} added to shipment.`);
        } catch {
            toast.error('Could not look up that product code.');
        }
    };

    const updateItem = (productId: number, quantity: number) => {
        setData('items', data.items.map((item) => item.product_id === productId ? { ...item, expected_quantity: quantity } : item));
    };

    const removeItem = (productId: number) => setData('items', data.items.filter((item) => item.product_id !== productId));
    const totalUnits = data.items.reduce((sum, item) => sum + (Number(item.expected_quantity) || 0), 0);

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        post('/shipments', {
            onError: () => toast.error('Check the shipment details and product quantities.'),
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="New shipment" />
            <div className="mx-auto w-full max-w-5xl space-y-5 p-4 md:p-6">
                <div className="flex items-center gap-3">
                    <Button asChild variant="outline" size="icon" aria-label="Back to shipments"><Link href="/shipments"><ArrowLeft className="size-4" /></Link></Button>
                    <div>
                        <p className="text-sm font-medium text-primary">Shipments</p>
                        <h1 className="text-2xl font-semibold tracking-tight">New shipment</h1>
                        <p className="mt-1 text-sm text-muted-foreground">Tell the warehouse what is coming. It stays Inbound until receipt is completed.</p>
                    </div>
                </div>

                <form onSubmit={submit} className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Where it comes from</CardTitle>
                            <CardDescription>The supplier or sourcing origin and its reference.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="supplier">Supplier or origin</Label>
                                <Input id="supplier" value={data.supplier} onChange={(event) => setData('supplier', event.target.value)} placeholder="Supplier, city, or market" required />
                                {errors.supplier && <p className="text-xs text-destructive">{errors.supplier}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="supplier_reference">Supplier reference <span className="font-normal text-muted-foreground">optional</span></Label>
                                <Input id="supplier_reference" value={data.supplier_reference} onChange={(event) => setData('supplier_reference', event.target.value)} placeholder="Purchase order or reference" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">How it travels</CardTitle>
                            <CardDescription>Carrier details and the date the warehouse should expect it.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="space-y-2">
                                <Label htmlFor="carrier">Carrier <span className="font-normal text-muted-foreground">optional</span></Label>
                                <Input id="carrier" value={data.carrier} onChange={(event) => setData('carrier', event.target.value)} placeholder="Carrier or courier" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="tracking_number">Tracking number <span className="font-normal text-muted-foreground">optional</span></Label>
                                <Input id="tracking_number" value={data.tracking_number} onChange={(event) => setData('tracking_number', event.target.value)} placeholder="Tracking reference" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="expected_on">Expected on</Label>
                                <Input id="expected_on" type="date" value={data.expected_on} onChange={(event) => setData('expected_on', event.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="cartons">Cartons</Label>
                                <Input id="cartons" type="number" min="0" value={data.cartons} onChange={(event) => setData('cartons', event.target.value)} placeholder="0" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">What is inside</CardTitle>
                            <CardDescription>Scan a SKU label or find products by name or code, then enter the expected quantity.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                                <div className="space-y-2">
                                    <Label htmlFor="sku-scan">Scan SKU</Label>
                                    <div className="relative">
                                        <ScanBarcode className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                        <Input id="sku-scan" className="pl-9" value={sku} onChange={(event) => setSku(event.target.value)} onKeyDown={scanSku} placeholder="Scan or enter product code, then press Enter" disabled={!warehouse} />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Pick a product</Label>
                                    <Input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search name or SKU" disabled={!warehouse} />
                                    <Select value={selectedProductId} onValueChange={setSelectedProductId} disabled={!warehouse || loadingProducts}>
                                        <SelectTrigger><SelectValue placeholder={loadingProducts ? 'Loading products…' : 'Pick a product…'} /></SelectTrigger>
                                        <SelectContent>
                                            {products.map((product) => (
                                                <SelectItem key={product.id} value={String(product.id)}>
                                                    {product.code || 'No SKU'} — {product.name} ({Number(product.quantity).toLocaleString()} in stock)
                                                </SelectItem>
                                            ))}
                                            {products.length === 0 && <div className="px-3 py-4 text-center text-sm text-muted-foreground">No products found for this warehouse country.</div>}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-end">
                                    <Button type="button" variant="outline" className="w-full" onClick={addSelectedProduct} disabled={!selectedProductId}><PackagePlus className="mr-2 size-4" />Add product</Button>
                                </div>
                            </div>
                            {errors.items && <p className="text-sm text-destructive">{errors.items}</p>}

                            <div className="overflow-hidden rounded-lg border">
                                <div className="grid grid-cols-[1fr_9rem_2.5rem] gap-3 bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground sm:px-4">
                                    <span>Product</span><span>Quantity</span><span />
                                </div>
                                {data.items.length === 0 ? (
                                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">Scan or choose a product to add it to this shipment.</div>
                                ) : data.items.map((item) => {
                                    const product = chosenProducts[item.product_id] ?? products.find((option) => option.id === item.product_id);
                                    return (
                                        <div key={item.product_id} className="grid grid-cols-[1fr_9rem_2.5rem] items-center gap-3 border-t px-3 py-2 sm:px-4">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium">{product?.name ?? `Product #${item.product_id}`}</p>
                                                <p className="text-xs text-muted-foreground">{product?.code ?? ''}{product ? ` · ${Number(product.quantity).toLocaleString()} in stock` : ''}</p>
                                            </div>
                                            <Input type="number" min="1" value={item.expected_quantity} onChange={(event) => updateItem(item.product_id, Number(event.target.value))} aria-label={`Expected quantity for ${product?.name ?? 'product'}`} />
                                            <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${product?.name ?? 'product'}`} onClick={() => removeItem(item.product_id)}><Trash2 className="size-4 text-muted-foreground" /></Button>
                                        </div>
                                    );
                                })}
                            </div>
                            <p className="text-sm text-muted-foreground">{data.items.length} product{data.items.length === 1 ? '' : 's'} · <strong className="text-foreground">{totalUnits.toLocaleString()}</strong> units</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Receive at</CardTitle>
                            <CardDescription>The warehouse that counts the shipment in.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="warehouse">Warehouse</Label>
                            <Select value={data.warehouse_code} onValueChange={(value) => { setData('warehouse_code', value); setData('items', []); setChosenProducts({}); }}>
                                    <SelectTrigger id="warehouse"><SelectValue placeholder="Choose a warehouse" /></SelectTrigger>
                                    <SelectContent>
                                        {warehouses.map((option) => <SelectItem key={option.code} value={option.code}>{option.name} ({option.code}) · {option.country}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                {errors.warehouse_code && <p className="text-xs text-destructive">{errors.warehouse_code}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="shipment-note">Note <span className="font-normal text-muted-foreground">optional</span></Label>
                                <Textarea id="shipment-note" rows={2} value={data.note} onChange={(event) => setData('note', event.target.value)} placeholder="Anything the receiving team should know" />
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button type="button" variant="outline" asChild><Link href="/shipments">Cancel</Link></Button>
                        <Button type="submit" disabled={processing || !warehouse || data.items.length === 0}>
                            {processing ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : null}
                            Create shipment
                        </Button>
                    </div>
                </form>
            </div>
        </AppLayout>
    );
}
