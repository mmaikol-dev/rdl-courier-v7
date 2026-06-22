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
import {
  PlusCircleIcon,
  TrashIcon,
  EyeIcon,
  ListIcon,
  Grid3x3Icon,
  LoaderCircle,
  CheckIcon,
  ChevronsUpDownIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface SearchableOption {
  value: string;
  label: string;
  keywords?: string;
}

function SearchableSelect({
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  options,
  clearLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  options: SearchableOption[];
  clearLabel?: string;
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
          className="h-auto min-h-10 w-full justify-between gap-2 py-2 font-normal"
        >
          <span
            className={cn(
              "flex-1 whitespace-normal break-words text-left",
              !selectedOption && "text-muted-foreground"
            )}
          >
            {selectedOption?.label ?? placeholder}
          </span>
          <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(32rem,calc(100vw-2rem))] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandGroup>
              {clearLabel ? (
                <CommandItem
                  value={clearLabel}
                  onSelect={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  <CheckIcon
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === "" ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="whitespace-normal break-words">{clearLabel}</span>
                </CommandItem>
              ) : null}
              {options.length === 0 ? (
                <div className="px-2 py-3 text-sm text-muted-foreground">
                  {emptyLabel}
                </div>
              ) : (
                options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={[option.label, option.value, option.keywords]
                      .filter(Boolean)
                      .join(" ")}
                    onSelect={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <CheckIcon
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === option.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="whitespace-normal break-words">
                      {option.label}
                    </span>
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

export default function TransferIndex() {
  const { auth, products, agents, transfers, groupedTransfers, view, flash } =
    usePage().props as any;

  const [openTransferModal, setOpenTransferModal] = useState(false);
  const [drawerDirection, setDrawerDirection] = useState<"right" | "bottom">("bottom");
  const [region, setRegion] = useState("");
  const [from, setFrom] = useState("");
  const [rows, setRows] = useState([
    { product_id: "", quantity: "", agent_id: "", merchant: "" },
  ]);
  const [openFilterModal, setOpenFilterModal] = useState(false);
  const [filterProduct, setFilterProduct] = useState("");
  const [filterAgent, setFilterAgent] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFiltering, setIsFiltering] = useState(false);
  const [isTogglingView, setIsTogglingView] = useState(false);
  const [viewingKey, setViewingKey] = useState<string | null>(null);

  const currentView = view || "grouped";

  // Shows "Product Name (Merchant)" using the merchant column
  const productOptions: SearchableOption[] = (products || []).map(
    (product: any) => ({
      value: String(product.id),
      label: product.merchant
        ? `${product.name} (${product.merchant})`
        : product.name,
      keywords: [product.merchant].filter(Boolean).join(" "),
    })
  );

  const agentOptions: SearchableOption[] = (agents || []).map((agent: any) => ({
    value: String(agent.id),
    label: agent.name,
  }));

  useEffect(() => {
    const handleResize = () => {
      setDrawerDirection(window.innerWidth >= 768 ? "right" : "bottom");
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (flash?.success) toast.success(flash.success);
    if (flash?.error) toast.error(flash.error);
    if (flash?.errors) {
      const firstError = Object.values(flash.errors)[0];
      if (typeof firstError === "string") toast.error(firstError);
    }
  }, [flash]);

  const addRow = () =>
    setRows([...rows, { product_id: "", quantity: "", agent_id: "", merchant: "" }]);

  const removeRow = (index: number) =>
    setRows(rows.filter((_, i) => i !== index));

  const handleChange = (index: number, field: string, value: string) => {
    const updated = [...rows];
    (updated[index] as any)[field] = value;

    if (field === "product_id") {
      const selectedProduct = products.find(
        (p: any) => String(p.id) === value
      );
      (updated[index] as any).merchant = selectedProduct
        ? selectedProduct.merchant || ""
        : "";
    }

    setRows(updated);
  };

  const handleSubmit = () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    router.post(
      "/transfers",
      { region, from, transfers: rows },
      {
        preserveScroll: true,
        onSuccess: () => {
          setOpenTransferModal(false);
          setRegion("");
          setFrom("");
          setRows([{ product_id: "", quantity: "", agent_id: "", merchant: "" }]);
        },
        onError: (errors) => {
          const firstError = Object.values(errors)[0];
          toast.error(
            typeof firstError === "string" ? firstError : "Failed to create transfer"
          );
        },
        onFinish: () => setIsSubmitting(false),
      }
    );
  };

  const toggleView = () => {
    if (isTogglingView) return;
    setIsTogglingView(true);
    const newView = currentView === "grouped" ? "detailed" : "grouped";
    router.get(
      "/transfer",
      { view: newView, product_id: filterProduct, agent_id: filterAgent, date: filterDate },
      {
        preserveState: true,
        preserveScroll: true,
        onError: () => toast.error("Failed to switch transfer view"),
        onFinish: () => setIsTogglingView(false),
      }
    );
  };

  const viewDetails = (productId: number, agentId: number) => {
    const nextViewingKey = `${productId}-${agentId}`;
    if (viewingKey !== null) return;
    setViewingKey(nextViewingKey);
    router.get(
      `/transfers/${productId}/${agentId}`,
      {},
      {
        onError: () => toast.error("Failed to open transfer details"),
        onFinish: () => setViewingKey(null),
      }
    );
  };

  const breadcrumbs = [
    { title: "Transfers", href: "/transfer" },
    { title: "Manage", href: "#" },
  ];

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Transfers" />

      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 p-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button
            variant={currentView === "grouped" ? "default" : "outline"}
            onClick={toggleView}
            disabled={isTogglingView}
            className="flex items-center gap-2"
          >
            {isTogglingView ? (
              <LoaderCircle className="w-4 h-4 animate-spin" />
            ) : null}
            {currentView === "grouped" ? (
              <>
                <Grid3x3Icon className="w-4 h-4" />
                Grouped View
              </>
            ) : (
              <>
                <ListIcon className="w-4 h-4" />
                Detailed View
              </>
            )}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setOpenFilterModal(true)}
            className="flex items-center gap-2"
          >
            Filter
          </Button>
          <Button
            onClick={() => setOpenTransferModal(true)}
            className="flex items-center gap-2 text-white"
          >
            <PlusCircleIcon className="w-4 h-4" />
            New Transfer
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="p-4 sm:p-6 overflow-x-auto">
        <Card className="shadow-sm">
          <CardContent className="p-0">
            {currentView === "grouped" ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Total Transfers</TableHead>
                    <TableHead>Total Quantity</TableHead>
                    <TableHead>First Transfer</TableHead>
                    <TableHead>Last Transfer</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedTransfers?.data?.length > 0 ? (
                    groupedTransfers.data.map((item: any, index: number) => (
                      <TableRow
                        key={`${item.product_id}-${item.agent_id}`}
                        className="hover:bg-gray-50"
                      >
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="font-medium">
                          {item.product?.name}
                        </TableCell>
                        <TableCell>{item.agent?.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-semibold">
                            {item.transfer_count} transfers
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="default" className="font-semibold">
                            {item.total_quantity} units
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {new Date(item.first_transfer_date).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {new Date(item.last_transfer_date).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              viewDetails(item.product_id, item.agent_id)
                            }
                            disabled={
                              viewingKey ===
                              `${item.product_id}-${item.agent_id}`
                            }
                            className="flex items-center gap-1"
                          >
                            {viewingKey ===
                            `${item.product_id}-${item.agent_id}` ? (
                              <LoaderCircle className="w-4 h-4 animate-spin" />
                            ) : (
                              <EyeIcon className="w-4 h-4" />
                            )}
                            {viewingKey ===
                            `${item.product_id}-${item.agent_id}`
                              ? "Opening..."
                              : "View Details"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center text-gray-500 py-6"
                      >
                        No grouped transfers found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transfers?.data?.length > 0 ? (
                    transfers.data.map((transfer: any, index: number) => (
                      <TableRow key={transfer.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>{transfer.product?.name}</TableCell>
                        <TableCell>{transfer.quantity}</TableCell>
                        <TableCell>{transfer.agent?.name}</TableCell>
                        <TableCell>{transfer.region}</TableCell>
                        <TableCell>{transfer.from}</TableCell>
                        <TableCell>{transfer.date}</TableCell>
                        <TableCell>{transfer.transfer_by}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center text-gray-500 py-6"
                      >
                        No transfers found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Create New Transfer Drawer ── */}
      <Drawer
        open={openTransferModal}
        onOpenChange={setOpenTransferModal}
        direction={drawerDirection}
      >
        <DrawerContent
          className={cn(
            "flex flex-col bg-white overflow-hidden",
            // Mobile (bottom sheet): takes up 95% of screen height
            "h-[95vh]",
            // Desktop (right panel): full height, half the viewport width
            "md:h-screen md:w-1/2 md:max-w-none md:right-0 md:left-auto md:rounded-l-2xl"
          )}
        >
          {/* Header */}
          <DrawerHeader className="border-b bg-white sticky top-0 z-10 px-6 py-4">
            <DrawerTitle className="text-xl font-bold text-gray-800">
              Create New Transfer
            </DrawerTitle>
            <DrawerDescription className="text-sm text-muted-foreground">
              Fill in the details below to distribute products to agents.
            </DrawerDescription>
          </DrawerHeader>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 bg-gray-50">

            {/* Transfer meta */}
            <Card className="shadow-sm">
              <CardContent className="p-6">
                <h3 className="text-base font-semibold mb-4 text-gray-800">
                  Transfer Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">
                      Region <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      placeholder="Enter region"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">
                      From <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                      placeholder="e.g. Main Warehouse"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">
                      Initiated By
                    </label>
                    <Input
                      readOnly
                      value={auth?.user?.name || ""}
                      className="bg-gray-100"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Product rows */}
            <Card className="shadow-sm">
              <CardContent className="p-6">
                <div className="flex justify-between items-center mb-5">
                  <h3 className="text-base font-semibold text-gray-800">
                    Products to Transfer
                  </h3>
                  <span className="text-sm text-muted-foreground">
                    {rows.length} product{rows.length !== 1 ? "s" : ""}
                  </span>
                </div>

                <div className="space-y-4">
                  {rows.map((row, i) => (
                    <Card
                      key={i}
                      className="border border-gray-200 border-l-4 border-l-blue-500 bg-white shadow-none"
                    >
                      <CardContent className="p-4">
                        {/* Row label */}
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
                            Product #{i + 1}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeRow(i)}
                            disabled={rows.length === 1}
                            className="text-red-500 hover:text-red-600 hover:bg-red-50 h-7 px-2"
                          >
                            <TrashIcon className="w-3.5 h-3.5 mr-1" />
                            Remove
                          </Button>
                        </div>

                        {/* Fields: 2-col on tablet+, stacked on mobile */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* Product */}
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-700">
                              Product <span className="text-red-500">*</span>
                            </label>
                            <SearchableSelect
                              value={row.product_id}
                              onChange={(val) =>
                                handleChange(i, "product_id", val)
                              }
                              placeholder="Select product"
                              searchPlaceholder="Search products..."
                              emptyLabel="No products found."
                              options={productOptions}
                            />
                          </div>

                          {/* Merchant (auto-filled) */}
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-700">
                              Merchant
                            </label>
                            <Input
                              readOnly
                              value={row.merchant || ""}
                              placeholder="Auto-filled on product select"
                              className="bg-gray-100 text-gray-600"
                            />
                          </div>

                          {/* Quantity */}
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-700">
                              Quantity <span className="text-red-500">*</span>
                            </label>
                            <Input
                              type="number"
                              min="1"
                              value={row.quantity}
                              onChange={(e) =>
                                handleChange(i, "quantity", e.target.value)
                              }
                              placeholder="Enter quantity"
                            />
                          </div>

                          {/* Agent */}
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-700">
                              Agent <span className="text-red-500">*</span>
                            </label>
                            <SearchableSelect
                              value={row.agent_id}
                              onChange={(val) =>
                                handleChange(i, "agent_id", val)
                              }
                              placeholder="Select agent"
                              searchPlaceholder="Search agents..."
                              emptyLabel="No agents found."
                              options={agentOptions}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="flex justify-end mt-5">
                  <Button
                    variant="outline"
                    onClick={addRow}
                    className="flex items-center gap-2"
                  >
                    <PlusCircleIcon className="w-4 h-4" />
                    Add Product
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Footer */}
          <DrawerFooter className="border-t bg-white sticky bottom-0 z-10 flex flex-row justify-end gap-2 py-4 px-6">
            <DrawerClose asChild>
              <Button variant="outline" className="min-w-[100px]">
                Cancel
              </Button>
            </DrawerClose>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="text-white min-w-[140px]"
            >
              {isSubmitting ? (
                <LoaderCircle className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              {isSubmitting ? "Submitting..." : "Submit Transfer"}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Filter Drawer */}
      <Drawer open={openFilterModal} onOpenChange={setOpenFilterModal}>
        <DrawerContent
          className={cn(
            "flex flex-col bg-white overflow-hidden",
            "h-[95vh]",
            "md:h-screen md:w-1/2 md:max-w-none md:right-0 md:left-auto md:rounded-l-2xl"
          )}
        >
          <DrawerHeader className="border-b bg-white sticky top-0 z-10 px-6 py-4">
            <DrawerTitle className="text-lg font-semibold text-gray-800">
              Filter Transfers
            </DrawerTitle>
            <DrawerDescription className="text-sm text-gray-500">
              Filter by product, agent, or date
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Product</label>
              <SearchableSelect
                value={filterProduct}
                onChange={setFilterProduct}
                placeholder="All products"
                searchPlaceholder="Search products..."
                emptyLabel="No products found."
                options={productOptions}
                clearLabel="All products"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Agent</label>
              <SearchableSelect
                value={filterAgent}
                onChange={setFilterAgent}
                placeholder="All agents"
                searchPlaceholder="Search agents..."
                emptyLabel="No agents found."
                options={agentOptions}
                clearLabel="All agents"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Date</label>
              <Input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
              />
            </div>
          </div>

          <DrawerFooter className="border-t flex flex-row justify-end gap-2 bg-white px-6 py-4">
            <DrawerClose asChild>
              <Button variant="outline" className="min-w-[100px]">
                Cancel
              </Button>
            </DrawerClose>
            <Button
              onClick={() => {
                if (isFiltering) return;
                setIsFiltering(true);
                router.get(
                  "/transfer",
                  {
                    product_id: filterProduct,
                    agent_id: filterAgent,
                    date: filterDate,
                    view: currentView,
                  },
                  {
                    preserveState: true,
                    preserveScroll: true,
                    onSuccess: () => {
                      toast.success("Filters applied");
                      setOpenFilterModal(false);
                    },
                    onError: () => toast.error("Failed to apply filters"),
                    onFinish: () => setIsFiltering(false),
                  }
                );
              }}
              disabled={isFiltering}
              className="text-white min-w-[140px]"
            >
              {isFiltering ? (
                <LoaderCircle className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              {isFiltering ? "Applying..." : "Apply Filters"}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </AppLayout>
  );
}