"use client";

import AppLayout from "@/layouts/app-layout";
import { Deferred, Head, usePage, router } from "@inertiajs/react";
import { useState, useEffect, useMemo } from "react";
import { toast } from "@/lib/toast";
import { csrfHeaders } from "@/lib/csrf";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  PlusCircleIcon,
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
        tone === "positive" && "border-primary/30 bg-primary/10",
        tone === "warning" && "border-warning/30 bg-primary"
      )}
    >
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p
        className={cn(
          "mt-0.5 text-sm font-bold tabular-nums",
          tone === "positive" && "text-primary",
          tone === "warning" && "text-warning-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function TransferAgentsSkeleton() {
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]" role="status" aria-label="Loading agents" aria-live="polite">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="space-y-3 overflow-hidden rounded-2xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-11 rounded-xl" />
            <div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" /></div>
          </div>
          <div className="grid grid-cols-3 gap-2">{Array.from({ length: 3 }).map((__, tile) => <Skeleton key={tile} className="h-14 rounded-xl" />)}</div>
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
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

export default function TransferIndex() {
  const { auth, products = [], agents, flash } =
    usePage().props as any;
  const isGod = auth?.user?.roles?.trim?.().toLowerCase() === "g.o.d";
  const isAgent = auth?.user?.roles?.trim?.().toLowerCase() === "agent";

  const [agentSearch, setAgentSearch] = useState("");
  const [transferCountry, setTransferCountry] = useState("");

  const filteredAgents = useMemo(() => {
    if (!agentSearch.trim()) return agents || [];
    const q = agentSearch.toLowerCase();
    return (agents || []).filter((a: any) =>
      a.name?.toLowerCase().includes(q)
    );
  }, [agents, agentSearch]);

  const [openTransferModal, setOpenTransferModal] = useState(false);
  const [transferStep, setTransferStep] = useState<"product" | "agents" | "quantities">("product");
  const [transferProduct, setTransferProduct] = useState<any>(null);
  const [transferSelectedAgents, setTransferSelectedAgents] = useState<number[]>([]);
  const [transferQuantities, setTransferQuantities] = useState<Record<number, string>>({});
  const [transferProductOpen, setTransferProductOpen] = useState(false);
  const [transferAgentSelectOpen, setTransferAgentSelectOpen] = useState(false);
  const [transferProductSearch, setTransferProductSearch] = useState("");
  const [transferAgentSearch, setTransferAgentSearch] = useState("");
  const [region, setRegion] = useState("");
  const [from, setFrom] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const transferAgents = isGod
    ? transferCountry
      ? (agents || []).filter((agent: any) => agent.store_address?.trim().toLowerCase() === transferCountry.trim().toLowerCase())
      : []
    : agents || [];
  const filteredTransferProducts = (products || []).filter((product: any) =>
    `${product.name || ""} ${product.merchant || ""} ${product.code || ""}`
      .toLowerCase()
      .includes(transferProductSearch.trim().toLowerCase())
  );
  const filteredTransferAgents = transferAgents.filter((agent: any) =>
    `${agent.name || ""} ${agent.store_name || ""}`
      .toLowerCase()
      .includes(transferAgentSearch.trim().toLowerCase())
  );
  const selectedTransferAgents = transferSelectedAgents
    .map((id) => transferAgents.find((agent: any) => Number(agent.id) === id))
    .filter(Boolean);
  const transferTotalUnits = transferSelectedAgents.reduce(
    (sum, id) => sum + (Number(transferQuantities[id]) || 0), 0
  );

  useEffect(() => {
    if (flash?.error) toast.error(flash.error);
    if (flash?.errors) {
      const firstError = Object.values(flash.errors)[0];
      if (typeof firstError === "string") toast.error(firstError);
    }
  }, [flash]);

  const handleSubmit = () => {
    if (isSubmitting) return;
    if (!transferProduct) {
      toast.warning("Choose a product before saving the transfer.");
      setTransferStep("product");
      return;
    }
    if (transferSelectedAgents.length === 0) {
      toast.warning("Select at least one agent to receive this product.");
      setTransferStep("agents");
      return;
    }
    if (!region.trim() || !from.trim()) {
      toast.warning(`Complete the transfer details: ${!region.trim() ? "region" : ""}${!region.trim() && !from.trim() ? " and " : ""}${!from.trim() ? "source location" : ""} is required.`);
      setTransferStep("quantities");
      return;
    }
    const invalidQuantityAgent = selectedTransferAgents.find((agent: any) => {
      const quantity = Number(transferQuantities[agent.id]);
      return !Number.isInteger(quantity) || quantity < 1;
    });
    if (invalidQuantityAgent) {
      toast.warning(`Enter a whole number quantity of at least 1 for ${invalidQuantityAgent.name}.`);
      return;
    }
    const allocations = Object.entries(transferQuantities)
      .filter(([agentId]) => transferSelectedAgents.includes(Number(agentId)))
      .filter(([, quantity]) => Number(quantity) > 0)
      .map(([agentId, quantity]) => ({
        product_id: String(transferProduct.id),
        quantity,
        agent_id: agentId,
        merchant: transferProduct.merchant || "",
      }));
    if (allocations.length !== transferSelectedAgents.length) {
      const missing = selectedTransferAgents
        .filter((agent: any) => !(Number(transferQuantities[agent.id]) > 0))
        .map((agent: any) => agent.name)
        .join(", ");
      toast.warning(`Enter a quantity greater than zero for every selected agent. Missing: ${missing || "agent quantity"}.`);
      return;
    }
    setIsSubmitting(true);
    router.post(
      "/transfers",
      { ...(isGod ? { country: transferProduct.country } : {}), region, from, transfers: allocations },
      {
        preserveScroll: true,
        onSuccess: () => {
          const units = allocations.reduce((sum, row) => sum + Number(row.quantity), 0);
          const allocationSummary = allocations.map((row) => {
            const agent = selectedTransferAgents.find((item: any) => String(item.id) === row.agent_id);
            return `${agent?.name || "Agent"}: ${row.quantity}`;
          }).join(", ");
          toast.success(`Transfer saved: ${units} ${transferProduct.name} unit${units === 1 ? "" : "s"} sent to ${allocations.length} agent${allocations.length === 1 ? "" : "s"}. ${allocationSummary}`);
          setOpenTransferModal(false);
          setTransferStep("product");
          setTransferProduct(null);
          setTransferSelectedAgents([]);
          setTransferQuantities({});
          setRegion("");
          setFrom("");
          setTransferCountry("");
        },
        onError: (errors) => {
          const firstError = Object.values(errors)[0];
          toast.error(typeof firstError === "string" ? `Transfer was not saved: ${firstError}` : "Transfer was not saved. Check the product, agent quantities, region, and source location, then try again.");
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
    { title: isAgent ? "Stock" : "Transfers", href: "/transfer" },
    { title: "Agents", href: "#" },
  ];

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title={isAgent ? "Stock" : "Transfers"} />

      {/* Top bar */}
      <div className="p-4 sm:p-6 pb-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-lg font-semibold tracking-tight">{isAgent ? "Stock" : "Transfers"}</h1>
          <div className="relative w-full sm:w-72">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search agents..."
              value={agentSearch}
              onChange={(e) => setAgentSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={openReturnModal}
              className="flex items-center gap-2"
            >
              <Undo2Icon className="w-4 h-4" />
              Returned Quantities
            </Button>
            <Button
              onClick={() => {
                setTransferStep("product");
                setTransferProduct(null);
                setTransferSelectedAgents([]);
                setTransferQuantities({});
                setTransferCountry("");
                setRegion("");
                setFrom("");
                setTransferProductSearch("");
                setTransferAgentSearch("");
                setTransferProductOpen(false);
                setTransferAgentSelectOpen(false);
                setOpenTransferModal(true);
              }}
              className="flex items-center gap-2"
            >
              <PlusCircleIcon className="w-4 h-4" />
              Bulk Transfer
            </Button>
          </div>
        </div>
      </div>

      {/* Agent Cards */}
      <div className="p-4 sm:p-6">
        <Deferred data="agents" fallback={<TransferAgentsSkeleton />}>
        {() => <>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]">
          {filteredAgents?.length > 0 ? (
            filteredAgents.map((agent: any) => {
              const initials = getInitials(agent.name || "?");
              const lastTransfer = timeAgo(agent.transfers_max_created_at);
              const units = Number(agent.transfers_sum_quantity || 0);
              const deducted = Number(agent.deductions_sum_quantity || 0);
              const stock = units - deducted;
              const stockRatio = units > 0 ? Math.max(0, Math.min(1, stock / units)) : 0;

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
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-sm">
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
                            ? "bg-gradient-to-r from-primary/40 to-primary"
                            : "bg-gradient-to-r from-warning/30 to-primary"
                        )}
                        style={{
                          width: `${units > 0 && stock > 0 ? Math.max(stockRatio * 100, 6) : 0}%`,
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
        </>}
        </Deferred>
      </div>

      {/* Guided bulk transfer */}
      <Dialog open={openTransferModal} onOpenChange={setOpenTransferModal}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b bg-muted/30 px-6 py-4">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><PlusCircleIcon className="size-4" /></span>
              Bulk Transfer
            </DialogTitle>
            <DialogDescription className="mt-0.5">Choose a product, select receiving agents, then assign the quantities.</DialogDescription>
            <ol className="mt-3 flex flex-wrap items-center gap-1">
              {(["product", "agents", "quantities"] as const).map((step, index) => {
                const steps = ["product", "agents", "quantities"] as const;
                const currentIndex = steps.indexOf(transferStep);
                const isDone = index < currentIndex;
                const isCurrent = index === currentIndex;
                return <li key={step} className="flex items-center gap-1">
                  {index > 0 && <ChevronRightIcon className="size-3 text-muted-foreground/50" />}
                  <button type="button" onClick={() => isDone && setTransferStep(step)} disabled={!isDone && !isCurrent} className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors", isCurrent && "bg-primary text-primary-foreground", isDone && "text-muted-foreground hover:bg-muted", !isDone && !isCurrent && "text-muted-foreground/50")}>
                    <span className={cn("flex size-4 items-center justify-center rounded-full border text-[10px] leading-none", isCurrent && "border-transparent", isDone && "border-primary/40 bg-primary/10 text-primary")}>{isDone ? <CheckIcon className="size-2.5" /> : index + 1}</span>
                    <span className="font-medium">{step === "product" ? "Product" : step === "agents" ? "Agents" : "Quantities"}</span>
                  </button>
                </li>;
              })}
            </ol>
          </DialogHeader>

          <div className="overflow-y-auto px-6 py-5">
            {transferStep === "product" && <div className="space-y-3 animate-in fade-in-0 slide-in-from-top-2 duration-200">
              <p className="text-sm text-muted-foreground">Search and choose the product you want to send.</p>
              <Popover open={transferProductOpen} onOpenChange={setTransferProductOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" aria-expanded={transferProductOpen} className="h-11 w-full justify-between font-normal">
                    <span className={cn("truncate", !transferProduct && "text-muted-foreground")}>{transferProduct ? `${transferProduct.name}${transferProduct.merchant ? ` · ${transferProduct.merchant}` : ""}` : "Choose a product..."}</span>
                    <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="max-h-[70vh] w-[min(36rem,calc(100vw-2rem))] overflow-hidden p-0" align="start">
                  <Command shouldFilter={false} className="h-auto max-h-[70vh]">
                    <CommandInput value={transferProductSearch} onValueChange={setTransferProductSearch} placeholder="Search product name, code or merchant..." />
                    <CommandList className="h-auto max-h-[min(55vh,22rem)] overflow-y-scroll overscroll-y-contain touch-pan-y">
                      <Deferred data="products" fallback={<div className="space-y-2 p-3">{[0,1,2].map((i) => <Skeleton key={i} className="h-11 w-full rounded-lg" />)}</div>}>
                        {() => <>
                          <CommandEmpty>No matching products found.</CommandEmpty>
                          <CommandGroup>{filteredTransferProducts.map((product: any) => <CommandItem key={product.id} value={String(product.id)} onSelect={() => {
                            setTransferProduct(product);
                            setTransferCountry(product.country || "");
                            setTransferProductSearch("");
                            setTransferAgentSearch("");
                            setTransferSelectedAgents([]);
                            setTransferQuantities({});
                            setTransferStep("agents");
                            setTransferProductOpen(false);
                          }} className="gap-3 px-3 py-2.5">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><PackageIcon className="size-4" /></span>
                            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{product.name}</span><span className="block truncate text-xs text-muted-foreground">{product.code || "No product code"}{product.merchant ? ` · ${product.merchant}` : ""}</span></span>
                            {product.country && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{product.country}</span>}
                          </CommandItem>)}</CommandGroup>
                        </>}
                      </Deferred>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>}

            {transferStep === "agents" && <div className="space-y-4 animate-in fade-in-0 slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-3 rounded-xl border bg-gradient-to-br from-primary/8 via-background to-background p-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><PackageIcon className="size-5" /></div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{transferProduct?.name}</p><p className="truncate text-xs text-muted-foreground">{transferProduct?.code || ""}{transferProduct?.merchant ? ` · ${transferProduct.merchant}` : ""}</p></div>
                <Button variant="ghost" size="sm" onClick={() => { setTransferStep("product"); setTransferSelectedAgents([]); setTransferQuantities({}); }}><XIcon className="size-4" />Change</Button>
              </div>
              <p className="text-sm text-muted-foreground">Select one or more agents who will receive this product.</p>
              <Popover open={transferAgentSelectOpen} onOpenChange={setTransferAgentSelectOpen}>
                <PopoverTrigger asChild><Button variant="outline" role="combobox" aria-expanded={transferAgentSelectOpen} className="h-auto min-h-11 w-full justify-between gap-2 py-2 font-normal"><span className={cn("truncate text-left", selectedTransferAgents.length === 0 && "text-muted-foreground")}>{selectedTransferAgents.length ? `${selectedTransferAgents.length} agent${selectedTransferAgents.length === 1 ? "" : "s"} selected` : "Select receiving agents..."}</span><ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" /></Button></PopoverTrigger>
                <PopoverContent className="max-h-[70vh] w-[min(36rem,calc(100vw-2rem))] overflow-hidden p-0" align="start">
                  <Command shouldFilter={false} className="h-auto max-h-[70vh]">
                    <CommandInput value={transferAgentSearch} onValueChange={setTransferAgentSearch} placeholder="Search agents..." />
                    <CommandList className="h-auto max-h-[min(55vh,22rem)] overflow-y-scroll overscroll-y-contain touch-pan-y">
                      <Deferred data="agents" fallback={<div className="space-y-2 p-3">{[0,1,2,3].map((i) => <Skeleton key={i} className="h-11 w-full rounded-lg" />)}</div>}>
                        {() => <>
                          <CommandEmpty>No agents available for this product’s country.</CommandEmpty>
                          <CommandGroup>{filteredTransferAgents.map((agent: any) => {
                            const selected = transferSelectedAgents.includes(Number(agent.id));
                            return <CommandItem key={agent.id} value={String(agent.id)} onSelect={() => {
                              const id = Number(agent.id);
                              setTransferSelectedAgents((current) => selected ? current.filter((value) => value !== id) : [...current, id]);
                              if (selected) setTransferQuantities((current) => { const next = { ...current }; delete next[id]; return next; });
                            }} className="gap-3 px-3 py-2.5">
                              <Checkbox checked={selected} aria-label={`Select ${agent.name}`} />
                              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{agent.name}</span><span className="block truncate text-xs text-muted-foreground">{agent.store_name || agent.store_address || "—"}</span></span>
                              {selected && <CheckIcon className="size-4 text-primary" />}
                            </CommandItem>;
                          })}</CommandGroup>
                        </>}
                      </Deferred>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedTransferAgents.length > 0 && <div className="flex flex-wrap gap-1.5">{selectedTransferAgents.map((agent: any) => <span key={agent.id} className="rounded-full border bg-muted/50 px-2.5 py-1 text-xs">{agent.name}</span>)}</div>}
            </div>}

            {transferStep === "quantities" && <div className="space-y-4 animate-in fade-in-0 slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-3 rounded-xl border bg-gradient-to-br from-primary/8 via-background to-background p-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><PackageIcon className="size-5" /></div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{transferProduct?.name}</p><p className="truncate text-xs text-muted-foreground">{transferProduct?.code || ""}{transferProduct?.merchant ? ` · ${transferProduct.merchant}` : ""}</p></div>
                <Button variant="ghost" size="sm" onClick={() => setTransferStep("agents")}><XIcon className="size-4" />Agents</Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><label className="text-sm font-medium">Region <span className="text-destructive">*</span></label><Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Enter region" /></div>
                <div className="space-y-1.5"><label className="text-sm font-medium">From <span className="text-destructive">*</span></label><Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="e.g. Main Warehouse" /></div>
              </div>
              <div className="space-y-2">
                <div><p className="text-sm font-medium">Assign quantities</p><p className="text-xs text-muted-foreground">Enter the quantity to send to each selected agent.</p></div>
                <div className="overflow-hidden rounded-xl border">
                  {selectedTransferAgents.map((agent: any) => <div key={agent.id} className="flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0 hover:bg-muted/30">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">{getInitials(agent.name || "?")}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{agent.name}</span><span className="block truncate text-xs text-muted-foreground">{agent.store_name || agent.store_address || "—"}</span></span>
                    <Input className="w-28" type="number" min="1" step="1" value={transferQuantities[agent.id] || ""} onChange={(e) => setTransferQuantities((current) => ({ ...current, [agent.id]: e.target.value }))} placeholder="Quantity" aria-label={`Quantity for ${agent.name}`} />
                  </div>)}
                </div>
                <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">{selectedTransferAgents.length} agent{selectedTransferAgents.length === 1 ? "" : "s"} · {transferTotalUnits} total units to transfer.</p>
              </div>
            </div>}
          </div>

          <DialogFooter className="border-t bg-muted/20 px-6 py-4 sm:justify-between">
            {transferStep === "product" && <><span className="mr-auto text-xs text-muted-foreground">Step 1 of 3 — choose a product</span><Button variant="outline" onClick={() => setOpenTransferModal(false)}>Cancel</Button></>}
            {transferStep === "agents" && <><span className="mr-auto text-xs text-muted-foreground">Step 2 of 3 — {transferSelectedAgents.length} agent{transferSelectedAgents.length === 1 ? "" : "s"} selected</span><Button variant="outline" onClick={() => setOpenTransferModal(false)}>Cancel</Button><Button onClick={() => {
              if (transferSelectedAgents.length === 0) { toast.warning("Select at least one receiving agent to continue."); return; }
              setTransferStep("quantities");
            }} disabled={transferSelectedAgents.length === 0}>Assign quantities</Button></>}
            {transferStep === "quantities" && <><span className="mr-auto text-xs text-muted-foreground">Step 3 of 3 — {transferTotalUnits} units assigned</span><Button variant="outline" onClick={() => setTransferStep("agents")} disabled={isSubmitting}>Back</Button><Button onClick={handleSubmit} disabled={isSubmitting}>{isSubmitting && <LoaderCircle className="size-4 animate-spin mr-2" />}{isSubmitting ? "Saving..." : "Save transfer"}</Button></>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  <label className="text-sm font-medium text-foreground">
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
                <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
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
