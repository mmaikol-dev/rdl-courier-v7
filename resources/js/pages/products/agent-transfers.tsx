"use client";

import AppLayout from "@/layouts/app-layout";
import { Head, usePage, router } from "@inertiajs/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import { ArrowLeftIcon, EyeIcon, UsersIcon, LoaderCircle, SearchIcon, PlusCircleIcon, TrashIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
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
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
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

export default function AgentTransfers() {
  const { agent, transfers, products, auth, flash } = usePage().props as any;
  const [viewingKey, setViewingKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [openTransferModal, setOpenTransferModal] = useState(false);
  const [drawerDirection, setDrawerDirection] = useState<"right" | "bottom">("bottom");
  const [region, setRegion] = useState("");
  const [fromField, setFromField] = useState("");
  const [rows, setRows] = useState([
    { product_id: "", quantity: "", merchant: "" },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filtered = useMemo(() => {
    if (!transfers?.data) return [];
    if (!search.trim()) return transfers.data;
    const q = search.toLowerCase();
    return transfers.data.filter((t: any) =>
      t.product?.name?.toLowerCase().includes(q)
    );
  }, [transfers, search]);

  const productOptions: SearchableOption[] = (products || []).map(
    (product: any) => ({
      value: String(product.id),
      label: product.merchant
        ? `${product.name} (${product.merchant})`
        : product.name,
      keywords: [product.merchant].filter(Boolean).join(" "),
    })
  );

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
    setRows([...rows, { product_id: "", quantity: "", merchant: "" }]);

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
    const payload = {
      region,
      from: fromField,
      transfers: rows.map((r) => ({
        product_id: r.product_id,
        quantity: r.quantity,
        agent_id: String(agent.id),
      })),
    };
    router.post("/transfers", payload, {
      preserveScroll: true,
      onSuccess: () => {
        toast.success("Transfer created successfully!");
        setOpenTransferModal(false);
        setRegion("");
        setFromField("");
        setRows([{ product_id: "", quantity: "", merchant: "" }]);
      },
      onError: (errors) => {
        const firstError = Object.values(errors)[0];
        toast.error(
          typeof firstError === "string" ? firstError : "Failed to create transfer"
        );
      },
      onFinish: () => setIsSubmitting(false),
    });
  };

  const viewDetails = (productId: number, agentId: number) => {
    const key = `${productId}-${agentId}`;
    if (viewingKey !== null) return;
    setViewingKey(key);
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
    { title: agent?.name || "Agent", href: "#" },
  ];

  const totalUnits = transfers?.data?.reduce?.((sum: number, t: any) => sum + (Number(t.total_quantity) || 0), 0) || 0;
  const productCount = transfers?.data?.length || 0;

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title={agent?.name ? `${agent.name} - Transfers` : "Agent Transfers"} />

      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="outline"
            onClick={() => router.get("/transfer")}
            className="flex items-center gap-2"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back
          </Button>
          <Button
            onClick={() => setOpenTransferModal(true)}
            className="flex items-center gap-2 text-white"
          >
            <PlusCircleIcon className="w-4 h-4" />
            New Transfer
          </Button>
        </div>

        {agent && (
          <div className="flex items-center justify-between text-sm text-muted-foreground mb-5 pb-4 border-b">
            <div className="flex items-center gap-2">
              <UsersIcon className="w-4 h-4" />
              <span className="font-semibold text-foreground">{agent.name}</span>
              {agent.store_phone && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span>{agent.store_phone}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-4">
              <span>
                <span className="font-bold text-foreground tabular-nums">{productCount}</span>
                {" "}products
              </span>
              <span>
                <span className="font-bold text-foreground tabular-nums">{totalUnits}</span>
                {" "}units
              </span>
            </div>
          </div>
        )}

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Transfers by Product</CardTitle>
            <div className="relative w-64">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search product..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Total Transfers</TableHead>
                    <TableHead>Total Quantity</TableHead>
                    <TableHead>Deducted</TableHead>
                    <TableHead>Remaining</TableHead>
                    <TableHead>First Transfer</TableHead>
                    <TableHead>Last Transfer</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length > 0 ? (
                    filtered.map((item: any, index: number) => (
                      <TableRow
                        key={`${item.product_id}-${item.agent_id}`}
                        className="hover:bg-gray-50"
                      >
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="font-medium">
                          {item.product?.name}
                        </TableCell>
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
                        <TableCell>
                          <Badge variant="destructive" className="font-semibold">
                            {Number(item.total_deducted || 0)} units
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-semibold">
                            {Number(item.total_quantity) - Number(item.total_deducted || 0)} units
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {item.first_transfer_date
                            ? new Date(item.first_transfer_date).toLocaleDateString()
                            : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {item.last_transfer_date
                            ? new Date(item.last_transfer_date).toLocaleDateString()
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => viewDetails(item.product_id, item.agent_id)}
                            disabled={viewingKey === `${item.product_id}-${item.agent_id}`}
                            className="flex items-center gap-1"
                          >
                            {viewingKey === `${item.product_id}-${item.agent_id}` ? (
                              <LoaderCircle className="w-4 h-4 animate-spin" />
                            ) : (
                              <EyeIcon className="w-4 h-4" />
                            )}
                            {viewingKey === `${item.product_id}-${item.agent_id}`
                              ? "Opening..."
                              : "View Details"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        {search ? "No products match your search." : "No transfers found for this agent."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {transfers?.links && (
          <div className="flex justify-center gap-2 mt-4">
            {transfers.links.map((link: any, index: number) => (
              <Button
                key={index}
                variant={link.active ? "default" : "outline"}
                size="sm"
                disabled={!link.url}
                onClick={() => link.url && router.get(link.url)}
                dangerouslySetInnerHTML={{ __html: link.label }}
              />
            ))}
          </div>
        )}
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
            "h-[95vh]",
            "md:h-screen md:w-1/2 md:max-w-none md:right-0 md:left-auto md:rounded-l-2xl"
          )}
        >
          <DrawerHeader className="border-b bg-white sticky top-0 z-10 px-6 py-4">
            <DrawerTitle className="text-xl font-bold text-gray-800">
              New Transfer — {agent?.name}
            </DrawerTitle>
            <DrawerDescription className="text-sm text-muted-foreground">
              Transfer products to this agent.
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 bg-gray-50">
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
                      value={fromField}
                      onChange={(e) => setFromField(e.target.value)}
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

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
    </AppLayout>
  );
}
