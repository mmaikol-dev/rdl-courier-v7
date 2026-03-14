"use client";

import AppLayout from "@/layouts/app-layout";
import { Head, usePage, router } from "@inertiajs/react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
    DrawerDescription,
    DrawerFooter,
    DrawerClose,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
    Table,
    TableHeader,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
} from "@/components/ui/table";
import { PlusCircleIcon, TrashIcon, EyeIcon, FilterIcon, XCircleIcon, CalendarIcon, LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";

interface SearchableOption {
    value: string;
    label: string;
    keywords?: string;
}

async function parseJsonResponse(response: Response) {
    const contentType = response.headers.get("content-type") || "";
    const body = await response.text();

    if (!contentType.includes("application/json")) {
        throw new Error(
            body.startsWith("<!DOCTYPE") || body.startsWith("<html")
                ? "The server returned HTML instead of JSON."
                : body || "Unexpected server response.",
        );
    }

    return body ? JSON.parse(body) : {};
}

function SearchableSelect({
    value,
    onChange,
    placeholder,
    searchPlaceholder,
    emptyLabel,
    options,
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    searchPlaceholder: string;
    emptyLabel: string;
    options: SearchableOption[];
}) {
    const [open, setOpen] = useState(false);
    const selectedOption = options.find((option) => option.value === value);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between font-normal"
                >
                    <span className={cn("truncate", !selectedOption && "text-muted-foreground")}>
                        {selectedOption?.label ?? placeholder}
                    </span>
                    <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                    <CommandInput placeholder={searchPlaceholder} />
                    <CommandList>
                        <CommandGroup>
                            {options.length === 0 ? (
                                <div className="px-2 py-3 text-sm text-muted-foreground">{emptyLabel}</div>
                            ) : (
                                options.map((option) => (
                                    <CommandItem
                                        key={option.value}
                                        value={[option.label, option.value, option.keywords].filter(Boolean).join(" ")}
                                        onSelect={() => {
                                            onChange(option.value);
                                            setOpen(false);
                                        }}
                                    >
                                        <CheckIcon
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                value === option.value ? "opacity-100" : "opacity-0",
                                            )}
                                        />
                                        <span className="truncate">{option.label}</span>
                                    </CommandItem>
                                ))
                            )}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

export default function RequisitionsIndex() {
    const { auth, requisitions, categories, users, filters = {}, flash } = usePage().props as any;
    const currentUserRole = String(auth?.user?.roles ?? "").trim().toLowerCase();

    const [openRequisitionModal, setOpenRequisitionModal] = useState(false);
    const [drawerDirection, setDrawerDirection] = useState<"right" | "bottom">("bottom");
    const [requisitionRows, setRequisitionRows] = useState<any[]>(requisitions?.data || []);
    const [formData, setFormData] = useState({
        category_id: "",
        user_id: "",
        description: "",
        requisition_date: new Date().toISOString().split('T')[0],
    });
    const [items, setItems] = useState([
        { item_name: "", description: "", quantity: 1, unit_price: 0 }
    ]);
    const [openFilterModal, setOpenFilterModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isFiltering, setIsFiltering] = useState(false);
    const [statusLoadingId, setStatusLoadingId] = useState<number | null>(null);
    const [viewingId, setViewingId] = useState<number | null>(null);
    const [openViewModal, setOpenViewModal] = useState(false);
    const [selectedRequisition, setSelectedRequisition] = useState<any | null>(null);
    const [selectedDuplicateItemsByName, setSelectedDuplicateItemsByName] = useState<Record<string, any[]>>({});

    // Filter states - Initialize from props
    const [filterStatus, setFilterStatus] = useState(filters?.status || "");
    const [filterCategory, setFilterCategory] = useState(filters?.category_id || "");
    const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
        from: filters?.date_from ? new Date(filters.date_from) : undefined,
        to: filters?.date_to ? new Date(filters.date_to) : undefined,
    });

    useEffect(() => {
        const handleResize = () => {
            setDrawerDirection(window.innerWidth >= 768 ? "right" : "bottom");
        };
        handleResize();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    // Update filter states when props change
    useEffect(() => {
        if (filters) {
            setFilterStatus(filters.status || "");
            setFilterCategory(filters.category_id || "");
            setDateRange({
                from: filters.date_from ? new Date(filters.date_from) : undefined,
                to: filters.date_to ? new Date(filters.date_to) : undefined,
            });
        }
    }, [filters]);

    useEffect(() => {
        if (flash?.success) toast.success(flash.success);
        if (flash?.error) toast.error(flash.error);
    }, [flash?.success, flash?.error]);

    useEffect(() => {
        setRequisitionRows(requisitions?.data || []);
    }, [requisitions]);

    const addItem = () => {
        setItems([...items, { item_name: "", description: "", quantity: 1, unit_price: 0 }]);
    };

    const removeItem = (index: number) => {
        if (items.length > 1) {
            setItems(items.filter((_, i) => i !== index));
        }
    };

    const handleItemChange = (index: number, field: string, value: any) => {
        const updated = [...items];
        (updated[index] as any)[field] = value;
        setItems(updated);
    };

    const calculateTotal = () => {
        return items.reduce((sum, item) => {
            return sum + (item.quantity * item.unit_price);
        }, 0);
    };

    const handleSubmit = () => {
        if (isSubmitting) return;

        setIsSubmitting(true);

        router.post("/requisitions", {
            ...formData,
            items,
        }, {
            preserveScroll: true,
            onSuccess: () => {
                toast.success("Requisition submitted successfully");
                setOpenRequisitionModal(false);
                resetForm();
            },
            onError: (errors) => {
                const firstError = Object.values(errors)[0];
                toast.error(typeof firstError === "string" ? firstError : "Failed to submit requisition");
            },
            onFinish: () => setIsSubmitting(false),
        });
    };

    const resetForm = () => {
        setFormData({
            category_id: "",
            user_id: "",
            description: "",
            requisition_date: new Date().toISOString().split('T')[0],
        });
        setItems([{ item_name: "", description: "", quantity: 1, unit_price: 0 }]);
    };

    const updateStatus = (id: number, status: string) => {
        if (statusLoadingId !== null) return;

        setStatusLoadingId(id);
        router.patch(`/requisitions/${id}/status`, { status }, {
            onSuccess: () => {
                toast.success(`Requisition marked as ${status}`);
            },
            onError: () => {
                toast.error("Failed to update requisition status");
            },
            onFinish: () => setStatusLoadingId(null),
        });
    };

    const viewDetails = (id: number) => {
        if (viewingId !== null) return;

        setViewingId(id);
        router.get(`/requisitions/${id}`, {}, {
            preserveScroll: true,
            onError: () => {
                toast.error("Failed to open requisition details");
            },
            onFinish: () => setViewingId(null),
        });
    };

    const applyFilters = () => {
        setIsFiltering(true);
        const params: any = {};

        if (filterStatus) params.status = filterStatus;
        if (filterCategory) params.category_id = filterCategory;
        if (dateRange.from) params.date_from = format(dateRange.from, "yyyy-MM-dd");
        if (dateRange.to) params.date_to = format(dateRange.to, "yyyy-MM-dd");

        router.get("/requisitions", params, {
            onSuccess: () => {
                toast.success("Filters applied");
                setOpenFilterModal(false);
            },
            onError: () => {
                toast.error("Failed to apply filters");
            },
            onFinish: () => setIsFiltering(false),
        });
    };

    const clearFilters = () => {
        setIsFiltering(true);
        setFilterStatus("");
        setFilterCategory("");
        setDateRange({ from: undefined, to: undefined });
        router.get("/requisitions", {}, {
            onSuccess: () => {
                toast.success("Filters cleared");
                setOpenFilterModal(false);
            },
            onError: () => {
                toast.error("Failed to clear filters");
            },
            onFinish: () => setIsFiltering(false),
        });
    };

    const removeFilter = (filterName: string) => {
        const params: any = {
            status: filterStatus,
            category_id: filterCategory,
            date_from: dateRange.from ? format(dateRange.from, "yyyy-MM-dd") : undefined,
            date_to: dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : undefined,
        };

        if (filterName === 'status') {
            setFilterStatus("");
            delete params.status;
        }
        if (filterName === 'category_id') {
            setFilterCategory("");
            delete params.category_id;
        }
        if (filterName === 'date_range') {
            setDateRange({ from: undefined, to: undefined });
            delete params.date_from;
            delete params.date_to;
        }

        setIsFiltering(true);
        router.get("/requisitions", params, {
            onSuccess: () => {
                toast.success("Filter updated");
            },
            onError: () => {
                toast.error("Failed to update filter");
            },
            onFinish: () => setIsFiltering(false),
        });
    };

    const getStatusBadge = (status: string) => {
        const statusConfig: any = {
            pending: { variant: "secondary", label: "Pending" },
            approved: { variant: "default", label: "Approved" },
            rejected: { variant: "destructive", label: "Rejected" },
            paid: { variant: "default", label: "Paid" },
        };
        const config = statusConfig[status] || statusConfig.pending;
        return <Badge variant={config.variant}>{config.label}</Badge>;
    };

    const hasActiveFilters = filterStatus || filterCategory || dateRange.from || dateRange.to;
    const categoryOptions: SearchableOption[] =
        categories?.map((cat: any) => ({
            value: String(cat.id),
            label: cat.name,
            keywords: cat.description || "",
        })) || [];
    const userOptions: SearchableOption[] =
        users?.map((user: any) => ({
            value: String(user.id),
            label: `${user.name} (${user.email})`,
            keywords: `${user.name} ${user.email}`,
        })) || [];
    const statusOptions: SearchableOption[] = [
        { value: "pending", label: "Pending" },
        { value: "approved", label: "Approved" },
        { value: "rejected", label: "Rejected" },
        { value: "paid", label: "Paid" },
    ];

    const breadcrumbs = [
        { title: "Requisitions", href: "/requisitions" },
        { title: "Manage", href: "#" },
    ];

    const normalizeItemName = (value: string) => value.trim().toLowerCase();

    const duplicateLookup = new Map<string, string[]>();

    requisitionRows.forEach((requisition: any) => {
        requisition.items?.forEach((existingItem: any) => {
            const key = normalizeItemName(existingItem.item_name || "");
            if (!key) return;

            const matches = duplicateLookup.get(key) || [];
            const requisitionNumber = requisition.requisition_number || `#${requisition.id}`;

            if (!matches.includes(requisitionNumber)) {
                matches.push(requisitionNumber);
                duplicateLookup.set(key, matches);
            }
        });
    });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Requisitions" />

            <div className="flex items-center justify-between gap-2 p-3 flex-wrap">
                <h1 className="text-xl font-bold text-gray-800">Requisitions</h1>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => setOpenFilterModal(true)}
                        className="flex items-center gap-2"
                    >
                        <FilterIcon className="w-4 h-4" />
                        Filter
                        {hasActiveFilters && (
                            <Badge variant="secondary" className="ml-1">
                                Active
                            </Badge>
                        )}
                    </Button>

                    <Button
                        onClick={() => setOpenRequisitionModal(true)}
                        className="flex items-center gap-2 text-white"
                    >
                        <PlusCircleIcon className="w-4 h-4" />
                        New Requisition
                    </Button>
                </div>
            </div>

            {/* Active Filters Display */}
            {hasActiveFilters && (
                <div className="px-3 pb-3">
                    <Card>
                        <CardContent className="p-3">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-gray-700">Active Filters:</span>

                                {filterStatus && (
                                    <Badge variant="secondary" className="flex items-center gap-1">
                                        Status: {filterStatus}
                                        <XCircleIcon
                                            className="w-3 h-3 cursor-pointer hover:text-red-600"
                                            onClick={() => removeFilter('status')}
                                        />
                                    </Badge>
                                )}

                                {filterCategory && (
                                    <Badge variant="secondary" className="flex items-center gap-1">
                                        Category: {categories?.find((c: any) => String(c.id) === filterCategory)?.name}
                                        <XCircleIcon
                                            className="w-3 h-3 cursor-pointer hover:text-red-600"
                                            onClick={() => removeFilter('category_id')}
                                        />
                                    </Badge>
                                )}

                                {(dateRange.from || dateRange.to) && (
                                    <Badge variant="secondary" className="flex items-center gap-1">
                                        Date: {dateRange.from ? format(dateRange.from, "MMM dd, yyyy") : "..."} - {dateRange.to ? format(dateRange.to, "MMM dd, yyyy") : "..."}
                                        <XCircleIcon
                                            className="w-3 h-3 cursor-pointer hover:text-red-600"
                                            onClick={() => removeFilter('date_range')}
                                        />
                                    </Badge>
                                )}

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={clearFilters}
                                    className="text-xs text-red-600 hover:text-red-700"
                                >
                                    Clear All
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Table Section */}
            <div className="p-4 sm:p-6 overflow-x-auto">
                <Card className="shadow-sm">
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>#</TableHead>
                                    <TableHead>Requisition No.</TableHead>
                                    <TableHead>Title</TableHead>
                                    <TableHead>Category</TableHead>
                                    <TableHead>Total Amount</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Requested By</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {requisitionRows.length > 0 ? (
                                    requisitionRows.map((req: any, index: number) => (
                                        <TableRow key={req.id} className="hover:bg-gray-50">
                                            <TableCell>{index + 1}</TableCell>
                                            <TableCell className="font-medium">{req.requisition_number}</TableCell>
                                            <TableCell>{req.title}</TableCell>
                                            <TableCell>{req.category?.name}</TableCell>
                                            <TableCell className="font-semibold">
                                                KES {parseFloat(req.total_amount).toFixed(2)}
                                            </TableCell>
                                            <TableCell>{getStatusBadge(req.status)}</TableCell>
                                            <TableCell className="text-sm text-gray-600">
                                                {new Date(req.requisition_date).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell>{req.user?.name}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => viewDetails(req.id)}
                                                        disabled={viewingId === req.id}
                                                        className="flex items-center gap-1"
                                                    >
                                                        {viewingId === req.id ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <EyeIcon className="w-4 h-4" />}
                                                        {viewingId === req.id ? "Opening..." : "View"}
                                                    </Button>
                                                    {req.status === 'approved' && currentUserRole === 'finance' && (
                                                        <Button
                                                            size="sm"
                                                            onClick={() => updateStatus(req.id, 'paid')}
                                                            disabled={statusLoadingId === req.id}
                                                            className="text-white"
                                                        >
                                                            {statusLoadingId === req.id && <LoaderCircle className="w-4 h-4 animate-spin" />}
                                                            {statusLoadingId === req.id ? "Updating..." : "Mark Paid"}
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={9} className="text-center text-gray-500 py-6">
                                            {hasActiveFilters
                                                ? "No requisitions found matching your filters."
                                                : "No requisitions found."}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>

            {/* Create Requisition Drawer */}
            <Drawer open={openRequisitionModal} onOpenChange={setOpenRequisitionModal} direction={drawerDirection}>
                <DrawerContent
                    className={`
            md:max-w-[900px] w-full h-[90vh] md:h-screen
            md:right-0 md:left-auto md:rounded-l-2xl
            flex flex-col overflow-hidden bg-white
          `}
                >
                    <DrawerHeader className="border-b bg-white sticky top-0 z-10 p-4">
                        <DrawerTitle className="text-xl font-bold text-gray-800">Create New Requisition</DrawerTitle>
                        <DrawerDescription className="text-sm text-muted-foreground">
                            Fill in the details below to create a requisition request.
                        </DrawerDescription>
                    </DrawerHeader>

                    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-6 bg-gray-50">
                        <Card className="shadow-sm">
                            <CardContent className="p-4 sm:p-6">
                                <h3 className="text-base sm:text-lg font-semibold mb-4 text-gray-800">
                                    Requisition Information
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-700">Category *</label>
                                        <SearchableSelect
                                            value={formData.category_id}
                                            onChange={(value) => setFormData({ ...formData, category_id: value })}
                                            placeholder="Select category"
                                            searchPlaceholder="Search category..."
                                            emptyLabel="No categories found."
                                            options={categoryOptions}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-700">Date *</label>
                                        <Input
                                            type="date"
                                            value={formData.requisition_date}
                                            onChange={(e) => setFormData({ ...formData, requisition_date: e.target.value })}
                                        />
                                    </div>

                                    <div className="space-y-2 sm:col-span-2">
                                        <label className="text-sm font-medium text-gray-700">User *</label>
                                        <SearchableSelect
                                            value={formData.user_id}
                                            onChange={(value) => setFormData({ ...formData, user_id: value })}
                                            placeholder="Select user"
                                            searchPlaceholder="Search user..."
                                            emptyLabel="No users found."
                                            options={userOptions}
                                        />
                                    </div>

                                    <div className="space-y-2 sm:col-span-2">
                                        <label className="text-sm font-medium text-gray-700">Description</label>
                                        <Textarea
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            placeholder="Enter description"
                                            rows={3}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-700">Requested By</label>
                                        <Input readOnly value={auth?.user?.name || ""} className="bg-gray-100" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="shadow-sm">
                            <CardContent className="p-4 sm:p-6">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-base sm:text-lg font-semibold text-gray-800">
                                        Requisition Items
                                    </h3>
                                    <span className="text-xs sm:text-sm text-muted-foreground">
                                        {items.length} item{items.length !== 1 ? "s" : ""}
                                    </span>
                                </div>

                                <div className="space-y-4">
                                    {items.map((item, i) => {
                                        const duplicateRequisitions = duplicateLookup.get(normalizeItemName(item.item_name || "")) || [];
                                        const isDuplicateItem = duplicateRequisitions.length > 0;

                                        return (
                                        <Card
                                            key={i}
                                            className={cn(
                                                "border-l-4 bg-white",
                                                isDuplicateItem
                                                    ? "border-l-red-500 border-red-200 bg-red-50/40"
                                                    : "border-l-blue-500"
                                            )}
                                        >
                                            <CardContent className="p-4">
                                                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                                                    <div className="space-y-2 md:col-span-2">
                                                        <div className="flex items-center gap-2">
                                                            <label className="text-sm font-medium text-gray-700">Item Name *</label>
                                                            {isDuplicateItem && (
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <span className="inline-flex cursor-help items-center rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
                                                                            Duplicate
                                                                        </span>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent className="max-w-xs">
                                                                        <p>
                                                                            Found in requisition{duplicateRequisitions.length > 1 ? "s" : ""}: {duplicateRequisitions.join(", ")}
                                                                        </p>
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            )}
                                                        </div>
                                                        <Input
                                                            value={item.item_name}
                                                            onChange={(e) => handleItemChange(i, "item_name", e.target.value)}
                                                            placeholder="Enter item name"
                                                            className={isDuplicateItem ? "border-red-400 bg-red-50 text-red-700 placeholder:text-red-400" : ""}
                                                        />
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium text-gray-700">Quantity *</label>
                                                        <Input
                                                            type="number"
                                                            min="1"
                                                            value={item.quantity}
                                                            onChange={(e) => handleItemChange(i, "quantity", parseInt(e.target.value) || 0)}
                                                            placeholder="Enter quantity"
                                                        />
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium text-gray-700">Unit Price *</label>
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            value={item.unit_price}
                                                            onChange={(e) => handleItemChange(i, "unit_price", parseFloat(e.target.value) || 0)}
                                                            placeholder="Enter price"
                                                        />
                                                    </div>

                                                    <Button
                                                        variant="outline"
                                                        onClick={() => removeItem(i)}
                                                        disabled={items.length === 1}
                                                        className="flex items-center justify-center"
                                                    >
                                                        <TrashIcon className="w-4 h-4 mr-1" /> Remove
                                                    </Button>
                                                </div>

                                                <div className="mt-3 space-y-2">
                                                    <label className="text-sm font-medium text-gray-700">Description</label>
                                                    <Textarea
                                                        value={item.description}
                                                        onChange={(e) => handleItemChange(i, "description", e.target.value)}
                                                        placeholder="Enter item description"
                                                        rows={2}
                                                    />
                                                </div>

                                                <div className="mt-3 text-right">
                                                    <span className="text-sm text-gray-600">
                                                        Subtotal: <span className="font-semibold">KES {(item.quantity * item.unit_price).toFixed(2)}</span>
                                                    </span>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )})}
                                </div>

                                <div className="flex justify-between items-center mt-4">
                                    <Button onClick={addItem} disabled={isSubmitting} className="flex items-center gap-2">
                                        <PlusCircleIcon className="w-4 h-4" /> Add Item
                                    </Button>
                                    <div className="text-right">
                                        <span className="text-lg font-bold text-gray-800">
                                            Total: KES {calculateTotal().toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <DrawerFooter className="border-t bg-white sticky bottom-0 z-10 flex justify-end gap-2 py-4 px-4 sm:px-6">
                        <DrawerClose asChild><Button variant="outline" disabled={isSubmitting}>Cancel</Button></DrawerClose>
                        <Button onClick={handleSubmit} disabled={isSubmitting} className="text-white">
                            {isSubmitting && <LoaderCircle className="w-4 h-4 animate-spin" />}
                            {isSubmitting ? "Submitting..." : "Submit Requisition"}
                        </Button>
                    </DrawerFooter>
                </DrawerContent>
            </Drawer>

            {/* Filter Modal */}
            <Drawer open={openFilterModal} onOpenChange={setOpenFilterModal} direction={drawerDirection}>
                <DrawerContent className={`
            md:max-w-[500px] w-full h-[90vh] md:h-screen
            md:right-0 md:left-auto md:rounded-l-2xl
            flex flex-col overflow-hidden bg-white
          `}>
                    <DrawerHeader className="border-b bg-white sticky top-0 z-10 p-4">
                        <DrawerTitle className="text-lg font-semibold text-gray-800">Filter Requisitions</DrawerTitle>
                        <DrawerDescription className="text-sm text-gray-500">
                            Filter by status, category, requested user, or date range
                        </DrawerDescription>
                    </DrawerHeader>

                    <div className="p-6 space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Status</label>
                            <SearchableSelect
                                value={filterStatus}
                                onChange={setFilterStatus}
                                placeholder="Select status"
                                searchPlaceholder="Search status..."
                                emptyLabel="No statuses found."
                                options={statusOptions}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Category</label>
                            <SearchableSelect
                                value={filterCategory}
                                onChange={setFilterCategory}
                                placeholder="Select category"
                                searchPlaceholder="Search category..."
                                emptyLabel="No categories found."
                                options={categoryOptions}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Date Range</label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className={cn(
                                            "w-full justify-start text-left font-normal",
                                            !dateRange.from && !dateRange.to && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {dateRange.from ? (
                                            dateRange.to ? (
                                                <>
                                                    {format(dateRange.from, "LLL dd, y")} -{" "}
                                                    {format(dateRange.to, "LLL dd, y")}
                                                </>
                                            ) : (
                                                format(dateRange.from, "LLL dd, y")
                                            )
                                        ) : (
                                            <span>Pick a date range</span>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        initialFocus
                                        mode="range"
                                        defaultMonth={dateRange.from}
                                        selected={{ from: dateRange.from, to: dateRange.to }}
                                        onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                                        numberOfMonths={2}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>

                    <DrawerFooter className="border-t flex justify-between gap-2 bg-white p-4">
                        <Button
                            variant="outline"
                            onClick={clearFilters}
                            disabled={!hasActiveFilters || isFiltering}
                        >
                            {isFiltering && <LoaderCircle className="w-4 h-4 animate-spin" />}
                            Clear All
                        </Button>
                        <div className="flex gap-2">
                            <DrawerClose asChild>
                                <Button variant="outline" disabled={isFiltering}>Cancel</Button>
                            </DrawerClose>
                            <Button
                                onClick={applyFilters}
                                disabled={isFiltering}
                                className="text-white"
                            >
                                {isFiltering && <LoaderCircle className="w-4 h-4 animate-spin" />}
                                {isFiltering ? "Applying..." : "Apply Filters"}
                            </Button>
                        </div>
                    </DrawerFooter>
                </DrawerContent>
            </Drawer>

            <Drawer
                open={openViewModal}
                onOpenChange={(open) => {
                    setOpenViewModal(open);
                    if (!open) {
                        setSelectedRequisition(null);
                        setSelectedDuplicateItemsByName({});
                    }
                }}
                direction={drawerDirection}
            >
                <DrawerContent
                    className={`
            md:max-w-[900px] w-full h-[90vh] md:h-screen
            md:right-0 md:left-auto md:rounded-l-2xl
            flex flex-col overflow-hidden bg-white
          `}
                >
                    <DrawerHeader className="border-b bg-white sticky top-0 z-10 p-4">
                        <DrawerTitle className="text-xl font-bold text-gray-800">
                            {selectedRequisition?.requisition_number || "Requisition Details"}
                        </DrawerTitle>
                        <DrawerDescription className="text-sm text-muted-foreground">
                            View requisition details without leaving this page.
                        </DrawerDescription>
                    </DrawerHeader>

                    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-6 bg-gray-50">
                        {selectedRequisition ? (
                            <>
                                <Card className="shadow-sm">
                                    <CardContent className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-sm text-gray-600">Title</p>
                                            <p className="font-semibold text-gray-800">{selectedRequisition.title}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600">Category</p>
                                            <p className="font-semibold text-gray-800">{selectedRequisition.category?.name || "-"}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600">Status</p>
                                            <div className="mt-1">{getStatusBadge(selectedRequisition.status)}</div>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600">Requisition Date</p>
                                            <p className="font-semibold text-gray-800">
                                                {new Date(selectedRequisition.requisition_date).toLocaleDateString()}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600">Requested By</p>
                                            <p className="font-semibold text-gray-800">{selectedRequisition.user?.name || "-"}</p>
                                            <p className="text-sm text-gray-600">{selectedRequisition.user?.email || ""}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600">Total Amount</p>
                                            <p className="font-semibold text-gray-800">
                                                KES {Number(selectedRequisition.total_amount || 0).toFixed(2)}
                                            </p>
                                        </div>
                                        {selectedRequisition.description && (
                                            <div className="md:col-span-2">
                                                <p className="text-sm text-gray-600">Description</p>
                                                <p className="text-gray-800">{selectedRequisition.description}</p>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>

                                <Card className="shadow-sm">
                                    <CardContent className="p-0">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>#</TableHead>
                                                    <TableHead>Item Name</TableHead>
                                                    <TableHead>Description</TableHead>
                                                    <TableHead className="text-right">Qty</TableHead>
                                                    <TableHead className="text-right">Unit Price</TableHead>
                                                    <TableHead className="text-right">Total</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {selectedRequisition.items?.map((item: any, index: number) => {
                                                    const duplicateEntries = selectedDuplicateItemsByName[normalizeItemName(item.item_name || "")] || [];
                                                    const isDuplicateItem = duplicateEntries.length > 0;

                                                    return (
                                                    <TableRow key={item.id} className={isDuplicateItem ? "bg-red-50/40" : undefined}>
                                                        <TableCell>{index + 1}</TableCell>
                                                        <TableCell className="font-medium">
                                                            <div className="flex items-center gap-2">
                                                                <span className={isDuplicateItem ? "text-red-700" : undefined}>{item.item_name}</span>
                                                                {isDuplicateItem && (
                                                                    <Tooltip>
                                                                        <TooltipTrigger asChild>
                                                                            <span className="inline-flex cursor-help items-center rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
                                                                                Duplicate
                                                                            </span>
                                                                        </TooltipTrigger>
                                                                        <TooltipContent className="max-w-xs">
                                                                            <p>
                                                                                Found in requisition{duplicateEntries.length > 1 ? "s" : ""}: {duplicateEntries.map((entry: any) => entry.requisition_number).join(", ")}
                                                                            </p>
                                                                        </TooltipContent>
                                                                    </Tooltip>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>{item.description || "-"}</TableCell>
                                                        <TableCell className="text-right">{item.quantity}</TableCell>
                                                        <TableCell className="text-right">
                                                            KES {Number(item.unit_price || 0).toFixed(2)}
                                                        </TableCell>
                                                        <TableCell className="text-right font-semibold">
                                                            KES {Number(item.total_price || 0).toFixed(2)}
                                                        </TableCell>
                                                    </TableRow>
                                                )})}
                                            </TableBody>
                                        </Table>
                                    </CardContent>
                                </Card>
                            </>
                        ) : (
                            <Card className="shadow-sm">
                                <CardContent className="p-6 text-sm text-gray-500">No requisition selected.</CardContent>
                            </Card>
                        )}
                    </div>

                    <DrawerFooter className="border-t bg-white sticky bottom-0 z-10 flex justify-end gap-2 py-4 px-4 sm:px-6">
                        <DrawerClose asChild>
                            <Button variant="outline">Close</Button>
                        </DrawerClose>
                    </DrawerFooter>
                </DrawerContent>
            </Drawer>
        </AppLayout>
    );
}
