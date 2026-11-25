import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, useForm } from '@inertiajs/react';
import { ArrowLeft, Check, ChevronsUpDown, LoaderCircle, PackagePlus, Trash2 } from 'lucide-react';
import * as React from 'react';
import { toast } from '@/lib/toast';

interface Warehouse {
    code: string;
    name: string;
    country: string;
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
    items: Array<{ product_name: string; product_code: string; expected_quantity: number }>;
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
    const [productName, setProductName] = React.useState('');
    const [productCode, setProductCode] = React.useState('');
    const [productQuantity, setProductQuantity] = React.useState('1');
    const [warehousePickerOpen, setWarehousePickerOpen] = React.useState(false);

    const warehouse = warehouses.find((option) => option.code === data.warehouse_code);

    const addProduct = () => {
        const name = productName.trim();
        const code = productCode.trim();
        const quantity = Number(productQuantity);
        if (!name || !Number.isInteger(quantity) || quantity < 1) return;

        const existing = data.items.find((item) => item.product_code.trim().toLowerCase() === code.toLowerCase() && code !== '');
        setData('items', existing
            ? data.items.map((item) => item === existing ? { ...item, expected_quantity: item.expected_quantity + quantity } : item)
            : [...data.items, { product_name: name, product_code: code, expected_quantity: quantity }]);
        setProductName('');
        setProductCode('');
        setProductQuantity('1');
    };

    const updateItem = (index: number, quantity: number) => {
        setData('items', data.items.map((item, itemIndex) => itemIndex === index ? { ...item, expected_quantity: quantity } : item));
    };

    const removeItem = (index: number) => setData('items', data.items.filter((_, itemIndex) => itemIndex !== index));
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
                            <CardDescription>Enter product details directly. New products are added to inventory when the shipment is created.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9rem_auto]">
                                <div className="space-y-2">
                                    <Label htmlFor="shipment-product-name">Product name</Label>
                                    <Input id="shipment-product-name" value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="Enter product name" disabled={!warehouse} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="shipment-product-code">Product code / SKU <span className="font-normal text-muted-foreground">optional</span></Label>
                                    <Input id="shipment-product-code" value={productCode} onChange={(event) => setProductCode(event.target.value)} placeholder="Enter SKU if available" disabled={!warehouse} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="shipment-product-quantity">Quantity</Label>
                                    <Input id="shipment-product-quantity" type="number" min="1" value={productQuantity} onChange={(event) => setProductQuantity(event.target.value)} disabled={!warehouse} />
                                </div>
                                <div className="flex items-end">
                                    <Button type="button" variant="outline" className="w-full" onClick={addProduct} disabled={!warehouse || !productName.trim() || Number(productQuantity) < 1}><PackagePlus className="mr-2 size-4" />Add product</Button>
                                </div>
                            </div>
                            {errors.items && <p className="text-sm text-destructive">{errors.items}</p>}

                            <div className="overflow-hidden rounded-lg border">
                                <div className="grid grid-cols-[1fr_9rem_2.5rem] gap-3 bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground sm:px-4">
                                    <span>Product</span><span>Quantity</span><span />
                                </div>
                                {data.items.length === 0 ? (
                                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">Enter product details above and add them to this shipment.</div>
                                ) : data.items.map((item, index) => {
                                    return (
                                        <div key={`${item.product_code}-${index}`} className="grid grid-cols-[1fr_9rem_2.5rem] items-center gap-3 border-t px-3 py-2 sm:px-4">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium">{item.product_name}</p>
                                                <p className="text-xs text-muted-foreground">{item.product_code || 'SKU will be generated when created'}</p>
                                            </div>
                                            <Input type="number" min="1" value={item.expected_quantity} onChange={(event) => updateItem(index, Number(event.target.value))} aria-label={`Expected quantity for ${item.product_name}`} />
                                            <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${item.product_name}`} onClick={() => removeItem(index)}><Trash2 className="size-4 text-muted-foreground" /></Button>
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
                                <Popover open={warehousePickerOpen} onOpenChange={setWarehousePickerOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            id="warehouse"
                                            type="button"
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={warehousePickerOpen}
                                            className="w-full justify-between font-normal"
                                        >
                                            <span className={`truncate ${warehouse ? '' : 'text-muted-foreground'}`}>
                                                {warehouse ? `${warehouse.name} (${warehouse.code}) · ${warehouse.country}` : 'Search and choose a warehouse'}
                                            </span>
                                            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
                                        <Command>
                                            <CommandInput placeholder="Search warehouses or countries..." />
                                            <CommandList className="max-h-72">
                                                <CommandEmpty>No warehouse found.</CommandEmpty>
                                                <CommandGroup heading="Available warehouses">
                                                    {warehouses.map((option) => (
                                                        <CommandItem
                                                            key={option.code}
                                                            value={`${option.name} ${option.code} ${option.country}`}
                                                            onSelect={() => {
                                                                setData('warehouse_code', option.code);
                                                                setData('items', []);
                                                                setWarehousePickerOpen(false);
                                                            }}
                                                        >
                                                            <Check className={`mr-2 size-4 ${data.warehouse_code === option.code ? 'opacity-100' : 'opacity-0'}`} />
                                                            <span className="truncate">{option.name} ({option.code}) · {option.country}</span>
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
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
