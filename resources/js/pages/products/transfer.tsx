"use client";

import AppLayout from "@/layouts/app-layout";
import { Head, usePage, router } from "@inertiajs/react";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment"
import { Card, CardContent } from "@/components/ui/card";
import {
  PlusCircleIcon,
  TrashIcon,
  LoaderCircle,
  CheckIcon,
  ChevronsUpDownIcon,
  UsersIcon,
  PackageIcon,
  PhoneIcon,
  MapPinIcon,
  ClockIcon,
  SearchIcon,
  Undo2Icon,
  XIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  ClipboardCopyIcon,
  RepeatIcon,
  BoxesIcon,
  ArrowRightIcon,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** Stable hue per agent so every avatar keeps its own colour. */
function agentHue(name: string) {
  let hash = 0;

  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) % 360;
  }

  return hash;
}

function StatTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: "positive" | "warning";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-transparent bg-muted/50 px-2.5 py-2 transition-colors",
        tone === "positive" && "border-emerald-500/20 bg-emerald-500/5",
        tone === "warning" && "border-amber-500/20 bg-amber-500/5"
      )}
    >
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p
        className={cn(
          "mt-0.5 text-sm font-bold tabular-nums",
          tone === "positive" && "text-emerald-600",
          tone === "warning" && "text-amber-600"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function timeAgo(date: string | null) {
  if (!date) return null;
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

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
  const { auth, products, agents, flash } =
    usePage().props as any;

  const [agentSearch, setAgentSearch] = useState("");

  const filteredAgents = useMemo(() => {
    if (!agentSearch.trim()) return agents || [];
    const q = agentSearch.toLowerCase();
    return agents.filter((a: any) =>
      a.name?.toLowerCase().includes(q)
    );
  }, [agents, agentSearch]);

  const [openTransferModal, setOpenTransferModal] = useState(false);
  const [drawerDirection, setDrawerDirection] = useState<"right" | "bottom">("bottom");
  const [region, setRegion] = useState("");
  const [from, setFrom] = useState("");
  const [rows, setRows] = useState([
    { product_id: "", quantity: "", agent_id: "", merchant: "" },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  /* ------------------------------------------------------------------
   * Returned quantities — an agent sending products back to the office
   * ------------------------------------------------------------------ */
  const [openReturn, setOpenReturn] = useState(false);
  const [returnStep, setReturnStep] = useState<
    "product" | "agents" | "review" | "done"
  >("product");
  const [returnSearch, setReturnSearch] = useState("");
  const [returnProducts, setReturnProducts] = useState<any[]>([]);
  const [returnProduct, setReturnProduct] = useState<any>(null);
  const [returnHolders, setReturnHolders] = useState<any[]>([]);
  const [returnSelected, setReturnSelected] = useState<number[]>([]);
  const [returnAgentFilter, setReturnAgentFilter] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [returnLoading, setReturnLoading] = useState(false);
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [returnResult, setReturnResult] = useState<{
    code: string;
    agents: number;
    units: number;
  } | null>(null);

  const returnHeaders = () => ({
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
    ...csrfHeaders(),
  });

  const loadReturnProducts = async (search: string) => {
    setReturnLoading(true);
    try {
      const res = await fetch(
        `/transfers/returnable-products?search=${encodeURIComponent(search)}`,
        { headers: returnHeaders(), credentials: "same-origin" }
      );
      if (!res.ok) throw new Error("request failed");
      setReturnProducts(await res.json());
    } catch {
      setReturnProducts([]);
    } finally {
      setReturnLoading(false);
    }
  };

  const loadReturnHolders = async (productId: number) => {
    setReturnLoading(true);
    try {
      const res = await fetch(`/transfers/product-holders?product_id=${productId}`, {
        headers: returnHeaders(),
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();
      setReturnHolders(data.agents || []);
      setReturnSelected([]);
    } catch {
      setReturnHolders([]);
      setReturnSelected([]);
    } finally {
      setReturnLoading(false);
    }
  };

  useEffect(() => {
    if (!openReturn || returnStep !== "product") return;

    const timer = setTimeout(() => loadReturnProducts(returnSearch), 250);
    return () => clearTimeout(timer);
  }, [returnSearch, openReturn, returnStep]);

  const openReturnModal = () => {
    setOpenReturn(true);
    setReturnStep("product");
    setReturnSearch("");
    setReturnProduct(null);
    setReturnProducts([]);
    setReturnHolders([]);
    setReturnSelected([]);
    setReturnAgentFilter("");
    setReturnReason("");
    setReturnResult(null);
  };

  const selectReturnProduct = (product: any) => {
    setReturnProduct(product);
    setReturnSearch("");
    setReturnAgentFilter("");
    loadReturnHolders(product.id);
    setReturnStep("agents");
  };

  const toggleReturnAgent = (agentId: number, checked: boolean) => {
    setReturnSelected((current) =>
      checked
        ? current.includes(agentId)
          ? current
          : [...current, agentId]
        : current.filter((id) => id !== agentId)
    );
  };

  const visibleHolders = useMemo(() => {
    const needle = returnAgentFilter.trim().toLowerCase();

    if (!needle) return returnHolders;

    return returnHolders.filter((holder) =>
      `${holder.agent_name ?? ""} ${holder.store_name ?? ""}`
        .toLowerCase()
        .includes(needle)
    );
  }, [returnHolders, returnAgentFilter]);

  const allVisibleSelected =
    visibleHolders.length > 0 &&
    visibleHolders.every((holder) => returnSelected.includes(holder.agent_id));

  const toggleAllVisible = (checked: boolean) => {
    const visibleIds = visibleHolders.map((holder) => holder.agent_id);

    setReturnSelected((current) =>
      checked
        ? [...new Set([...current, ...visibleIds])]
        : current.filter((id) => !visibleIds.includes(id))
    );
  };

  const returnTotalUnits = returnHolders
    .filter((h) => returnSelected.includes(h.agent_id))
    .reduce((sum, h) => sum + Number(h.remaining || 0), 0);

  const copyReturnCode = async () => {
    if (!returnResult) return;

    try {
      await navigator.clipboard.writeText(returnResult.code);
      toast.success("Code copied to clipboard.");
    } catch {
      toast.error("Could not copy the code.");
    }
  };

  const submitReturn = async () => {
    if (returnSubmitting) return;

    if (!returnProduct || returnSelected.length === 0) {
      toast.error("Select at least one agent.");
      return;
    }

    setReturnSubmitting(true);
    try {
      const res = await fetch("/transfers/bulk-deduct", {
        method: "POST",
        headers: returnHeaders(),
        credentials: "same-origin",
        body: JSON.stringify({
          product_id: returnProduct.id,
          agent_ids: returnSelected,
          reason: returnReason,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data.message || "Failed to record the return.");
        return;
      }

      setReturnResult({
        code: data.code,
        agents: Number(data.agents || 0),
        units: Number(data.units || 0),
      });
      setReturnStep("done");
      toast.success(data.message || "Return recorded successfully!");
      router.reload();
    } catch {
      toast.error("Failed to record the return.");
    } finally {
      setReturnSubmitting(false);
    }
  };

  const closeReturnModal = () => {
    setOpenReturn(false);
    router.reload();
  };

  const breadcrumbs = [
    { title: "Transfers", href: "/transfer" },
    { title: "Agents", href: "#" },
  ];

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Transfers" />

      {/* Top bar */}
      <div className="p-4 sm:p-6 pb-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:w-72">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search agents..."
              value={agentSearch}
              onChange={(e) => setAgentSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <Button
            variant="outline"
            onClick={openReturnModal}
            className="flex items-center gap-2"
          >
            <Undo2Icon className="w-4 h-4" />
            Returned Quantities
          </Button>
        </div>
      </div>

      {/* Agent Cards */}
      <div className="p-4 sm:p-6">
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]">
          {filteredAgents?.length > 0 ? (
            filteredAgents.map((agent: any) => {
              const initials = getInitials(agent.name || "?");
              const lastTransfer = timeAgo(agent.transfers_max_created_at);
              const units = Number(agent.transfers_sum_quantity || 0);
              const deducted = Number(agent.deductions_sum_quantity || 0);
              const stock = Math.max(units - deducted, 0);
              const stockRatio = units > 0 ? Math.min(1, stock / units) : 0;
              const hue = agentHue(agent.name || "");

              return (
                <div
                  key={agent.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.get(`/transfers/agent/${agent.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.get(`/transfers/agent/${agent.id}`);
                    }
                  }}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card text-card-foreground shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  <div className="flex items-start gap-3 p-4 pb-3">
                    <span
                      className="flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm"
                      style={{
                        backgroundImage: `linear-gradient(135deg, hsl(${hue} 72% 54%), hsl(${
                          (hue + 45) % 360
                        } 70% 40%))`,
                      }}
                    >
                      {initials}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold leading-tight transition-colors group-hover:text-primary">
                        {agent.name}
                      </p>
                      <div className="mt-1 space-y-0.5">
                        {agent.store_name ? (
                          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <MapPinIcon className="size-3 shrink-0" />
                            <span className="truncate">{agent.store_name}</span>
                          </p>
                        ) : null}
                        {agent.store_phone ? (
                          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <PhoneIcon className="size-3 shrink-0" />
                            <span className="truncate">{agent.store_phone}</span>
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/40 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>

                  <div className="grid grid-cols-3 gap-2 px-4 pb-3">
                    <StatTile
                      icon={<RepeatIcon className="size-3" />}
                      label="Transfers"
                      value={agent.transfers_count || 0}
                    />
                    <StatTile
                      icon={<PackageIcon className="size-3" />}
                      label="Units"
                      value={units}
                    />
                    <StatTile
                      icon={<BoxesIcon className="size-3" />}
                      label="Stock"
                      value={stock}
                      tone={stock > 0 ? "positive" : "warning"}
                    />
                  </div>

                  <div className="px-4 pb-3">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          stock > 0
                            ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
                            : "bg-gradient-to-r from-amber-400 to-amber-500"
                        )}
                        style={{
                          width: `${units > 0 ? Math.max(stockRatio * 100, 6) : 0}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="mt-auto flex items-center justify-between border-t border-border/60 bg-muted/20 px-4 py-2.5 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <ClockIcon className="size-3 shrink-0" />
                      {lastTransfer
                        ? `Last transfer ${lastTransfer}`
                        : "No transfers yet"}
                    </span>
                    <span className="flex items-center gap-1 font-medium text-primary opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                      View
                      <ArrowRightIcon className="size-3" />
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full flex flex-col items-center gap-2 rounded-2xl border border-dashed py-16 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <UsersIcon className="size-7" />
              </span>
              <p className="text-base font-semibold">No agents found</p>
              <p className="text-sm text-muted-foreground">
                No agents are available with transfers in your region.
              </p>
            </div>
          )}
        </div>
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
              Create New Transfer
            </DrawerTitle>
            <DrawerDescription className="text-sm text-muted-foreground">
              Fill in the details below to distribute products to agents.
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

      {/* Returned quantities — products an agent sent back to the main office */}
      <Dialog open={openReturn} onOpenChange={setOpenReturn}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b bg-muted/30 px-6 py-4">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Undo2Icon className="size-4" />
              </span>
              Returned Quantities
            </DialogTitle>
            <DialogDescription className="mt-0.5">
              Record stock an agent sent back to the main office.
            </DialogDescription>

            {returnStep !== "done" ? (
              <ol className="mt-3 flex flex-wrap items-center gap-1">
                {(["product", "agents", "review"] as const).map((step, index) => {
                  const steps = ["product", "agents", "review"] as const;
                  const currentIndex = steps.indexOf(returnStep as (typeof steps)[number]);
                  const isDone = index < currentIndex;
                  const isCurrent = index === currentIndex;

                  return (
                    <li key={step} className="flex items-center gap-1">
                      {index > 0 ? (
                        <ChevronRightIcon className="size-3 text-muted-foreground/50" />
                      ) : null}
                      <button
                        type="button"
                        onClick={() => isDone && setReturnStep(step)}
                        disabled={!isDone && !isCurrent}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors",
                          isCurrent && "bg-primary text-primary-foreground",
                          isDone && "text-muted-foreground hover:bg-muted",
                          !isDone && !isCurrent && "text-muted-foreground/50"
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-4 items-center justify-center rounded-full border text-[10px] leading-none",
                            isCurrent && "border-transparent",
                            isDone && "border-primary/40 bg-primary/10 text-primary"
                          )}
                        >
                          {isDone ? (
                            <CheckIcon className="size-2.5" />
                          ) : (
                            index + 1
                          )}
                        </span>
                        <span className="font-medium">
                          {step === "product"
                            ? "Product"
                            : step === "agents"
                              ? "Agents"
                              : "Confirm"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </DialogHeader>

          <div className="overflow-y-auto px-6 py-5">
            {returnStep === "product" ? (
              <div className="space-y-3 animate-in fade-in-0 slide-in-from-top-2 duration-200">
                <p className="text-sm text-muted-foreground">
                  Search the product that came back. Only products agents still
                  hold are listed.
                </p>
                <Command
                  shouldFilter={false}
                  className="rounded-xl border shadow-sm [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2.5"
                >
                  <CommandInput
                    value={returnSearch}
                    onValueChange={setReturnSearch}
                    placeholder="Search by product name, code or merchant..."
                  />
                  <CommandList className="max-h-72">
                    {returnLoading ? (
                      <div className="space-y-2 p-3">
                        {[0, 1, 2].map((i) => (
                          <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
                        ))}
                      </div>
                    ) : (
                      <>
                        <CommandEmpty>
                          No product with stock held by agents.
                        </CommandEmpty>
                        <CommandGroup>
                          {returnProducts.map((product) => (
                            <CommandItem
                              key={product.id}
                              value={String(product.id)}
                              onSelect={() => selectReturnProduct(product)}
                              className="gap-3"
                            >
                              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                <PackageIcon className="size-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">
                                  {product.name}
                                </span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {product.code}
                                  {product.merchant ? ` · ${product.merchant}` : ""}
                                </span>
                              </span>
                              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                                {product.agents} agent
                                {product.agents === 1 ? "" : "s"} · {product.remaining}{" "}
                                units
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </>
                    )}
                  </CommandList>
                </Command>
              </div>
            ) : null}

            {returnStep === "agents" ? (
              <div className="space-y-3 animate-in fade-in-0 slide-in-from-top-2 duration-200">
                <div className="flex items-center gap-3 rounded-xl border bg-gradient-to-br from-primary/8 via-background to-background p-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <PackageIcon className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {returnProduct?.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {returnProduct?.code}
                      {returnProduct?.merchant ? ` · ${returnProduct.merchant}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setReturnProduct(null);
                      setReturnHolders([]);
                      setReturnSelected([]);
                      setReturnStep("product");
                    }}
                  >
                    <XIcon className="size-4" />
                    Change
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[12rem] flex-1">
                    <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      value={returnAgentFilter}
                      onChange={(e) => setReturnAgentFilter(e.target.value)}
                      placeholder="Filter agents..."
                      className="pl-8 h-9"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleAllVisible(!allVisibleSelected)}
                    disabled={visibleHolders.length === 0}
                  >
                    {allVisibleSelected ? "Clear selection" : "Select all"}
                  </Button>
                </div>

                {returnLoading ? (
                  <div className="space-y-2">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
                    ))}
                  </div>
                ) : visibleHolders.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-10 text-center">
                    <UsersIcon className="size-6 text-muted-foreground/60" />
                    <p className="text-sm font-medium">
                      No agent holds this product
                    </p>
                    <p className="text-xs text-muted-foreground">
                      There is nothing to return for the selected product.
                    </p>
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto rounded-xl border">
                    {visibleHolders.map((holder) => {
                      const checked = returnSelected.includes(holder.agent_id);

                      return (
                        <label
                          key={holder.agent_id}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 border-b px-3 py-2.5 transition-colors last:border-b-0",
                            checked ? "bg-primary/5" : "hover:bg-muted/40"
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) =>
                              toggleReturnAgent(holder.agent_id, value === true)
                            }
                            aria-label={`Select ${holder.agent_name}`}
                          />
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                            {getInitials(holder.agent_name || "?")}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {holder.agent_name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {holder.store_name || "—"} · {holder.transferred}{" "}
                              transferred
                              {holder.deducted
                                ? ` · ${holder.deducted} deducted`
                                : ""}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                              checked
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {holder.remaining} units
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            {returnStep === "review" ? (
              <div className="space-y-4 animate-in fade-in-0 slide-in-from-top-2 duration-200">
                <div className="overflow-hidden rounded-xl border">
                  <div className="flex items-center gap-3 bg-muted/40 px-4 py-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <PackageIcon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {returnProduct?.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {returnProduct?.code}
                      </p>
                    </div>
                  </div>
                  <dl className="divide-y text-sm">
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <dt className="text-muted-foreground">
                        Agents returning stock
                      </dt>
                      <dd className="font-medium tabular-nums">
                        {returnSelected.length}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <dt className="text-muted-foreground">Units returned</dt>
                      <dd className="font-medium tabular-nums">
                        {returnTotalUnits}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <dt className="text-muted-foreground">Deduction code</dt>
                      <dd className="font-mono text-xs text-muted-foreground">
                        generated on save
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Reason
                  </label>
                  <Input
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    placeholder="e.g. Agent returned stock to main office"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      "Product returned to main office",
                      "Damaged goods",
                      "Expired stock",
                      "Wrong delivery",
                    ].map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => setReturnReason(reason)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs transition-colors",
                          returnReason === reason
                            ? "border-primary bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                </div>

                <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
                  One deduction per agent, all sharing a single code
                  (RET-001-{new Date().toLocaleDateString("en-CA")},
                  RET-001-{new Date().toLocaleDateString("en-CA")}-02, …).
                </p>
              </div>
            ) : null}

            {returnStep === "done" && returnResult ? (
              <div className="flex flex-col items-center gap-4 py-8 text-center animate-in fade-in-0 zoom-in-95 duration-200">
                <div className="flex size-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                  <CircleCheckIcon className="size-8" />
                </div>
                <div>
                  <p className="text-base font-semibold">Return recorded</p>
                  <p className="text-sm text-muted-foreground">
                    {returnResult.agents} agent
                    {returnResult.agents === 1 ? "" : "s"} · {returnResult.units}{" "}
                    units returned to the main office.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={copyReturnCode}
                  className="inline-flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm transition-colors hover:bg-muted"
                >
                  {returnResult.code}
                  <ClipboardCopyIcon className="size-4 text-muted-foreground" />
                </button>
              </div>
            ) : null}
          </div>

          <DialogFooter className="border-t bg-muted/20 px-6 py-4 sm:justify-between">
            {returnStep === "product" ? (
              <>
                <span className="mr-auto text-xs text-muted-foreground">
                  Step 1 of 3 — pick the product
                </span>
                <Button variant="outline" onClick={() => setOpenReturn(false)}>
                  Cancel
                </Button>
              </>
            ) : null}

            {returnStep === "agents" ? (
              <>
                <span className="mr-auto text-xs text-muted-foreground">
                  {returnSelected.length} agent
                  {returnSelected.length === 1 ? "" : "s"} · {returnTotalUnits}{" "}
                  units selected
                </span>
                <Button variant="outline" onClick={() => setOpenReturn(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => setReturnStep("review")}
                  disabled={returnSelected.length === 0}
                >
                  Review return
                </Button>
              </>
            ) : null}

            {returnStep === "review" ? (
              <>
                <span className="mr-auto text-xs text-muted-foreground">
                  Step 3 of 3 — confirm
                </span>
                <Button
                  variant="outline"
                  onClick={() => setReturnStep("agents")}
                  disabled={returnSubmitting}
                >
                  Back
                </Button>
                <Button onClick={submitReturn} disabled={returnSubmitting}>
                  {returnSubmitting ? (
                    <LoaderCircle className="size-4 animate-spin mr-2" />
                  ) : null}
                  {returnSubmitting ? "Saving..." : "Confirm return"}
                </Button>
              </>
            ) : null}

            {returnStep === "done" ? (
              <>
                <span className="mr-auto text-xs text-muted-foreground">
                  The agent balances were updated.
                </span>
                <Button onClick={closeReturnModal}>Done</Button>
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
