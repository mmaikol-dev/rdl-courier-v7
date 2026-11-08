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
import { ArrowLeftIcon, ArrowRightIcon, EyeIcon, UsersIcon, LoaderCircle, SearchIcon, PlusCircleIcon, TrashIcon, CalendarDaysIcon, PackageIcon, RepeatIcon, BoxesIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState, useMemo, useEffect } from "react";
import { toast } from "@/lib/toast";
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
import { Switch } from "@/components/ui/switch";

interface SearchableOption {
  value: string;
  label: string;
  keywords?: string;
}

interface DateTransferProduct {
  id: number;
  name: string;
  merchant: string | null;
  quantity: number;
  transfer_count: number;
}

interface DateTransferGroup {
  date: string;
  transfer_count: number;
  total_quantity: number;
  received: boolean;
  received_at: string | null;
  products: DateTransferProduct[];
}

interface AgentTransferRecord {
  product_id: number;
  agent_id: number;
  total_quantity: number;
  total_deducted?: number;
  transfer_count: number;
  first_transfer_date: string | null;
  last_transfer_date: string | null;
  product?: { name: string };
}

interface AgentTransfersPageProps {
  agent: { id: number; name: string; store_phone?: string | null };
  transfers?: {
    data: AgentTransferRecord[];
    search?: string;
    links?: Array<{ active: boolean; url: string | null; label: string }>;
  };
  dateGroups?: DateTransferGroup[];
  isAgentView?: boolean;
  isUngroupedView?: boolean;
  selectedTransferDate?: string | null;
  products: Array<{ id: number; name: string; merchant?: string | null; country?: string | null }>;
  countries?: Array<{ id: number; name: string }>;
  auth?: { user?: { name?: string; roles?: string } };
  flash?: { success?: string; error?: string; errors?: Record<string, string> };
}

function TransferStatTile({
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
        "rounded-xl border border-transparent bg-muted/50 px-2.5 py-2",
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
  const { agent, transfers, dateGroups = [], isAgentView = false, isUngroupedView = false, selectedTransferDate = null, products, countries = [], auth, flash } =
    usePage<AgentTransfersPageProps>().props;
  const isGod = auth?.user?.roles?.trim().toLowerCase() === "g.o.d";
  const [viewingKey, setViewingKey] = useState<string | null>(null);
  const [search, setSearch] = useState(transfers?.search || "");
  const [confirmingDate, setConfirmingDate] = useState<string | null>(null);

  const [openTransferModal, setOpenTransferModal] = useState(false);
  const [drawerDirection, setDrawerDirection] = useState<"right" | "bottom">("bottom");
  const [region, setRegion] = useState("");
  const [fromField, setFromField] = useState("");
  const [transferCountry, setTransferCountry] = useState("");
  const [rows, setRows] = useState([
    { product_id: "", quantity: "", merchant: "" },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filtered = useMemo(() => {
    if (!transfers?.data) return [];
    return transfers.data;
  }, [transfers]);

  const handleSearch = () => {
    const params: Record<string, string> = {};
    if (search.trim()) params.search = search.trim();
    if (isAgentView && isUngroupedView) params.view = "all";
    router.get(`/transfers/agent/${agent.id}`, params, { preserveState: true, preserveScroll: true });
  };

  const availableProducts = isGod
    ? transferCountry
      ? products.filter((product) => product.country?.trim().toLowerCase() === transferCountry.trim().toLowerCase())
      : []
    : products;

  const productOptions: SearchableOption[] = availableProducts.map(
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
      ...(isGod ? { country: transferCountry } : {}),
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
        setTransferCountry("");
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

  const confirmReceived = (date: string) => {
    if (confirmingDate) return;
    setConfirmingDate(date);
    router.post(
      "/transfers/receive-date",
      { date },
      {
        preserveScroll: true,
        onError: (errors) => {
          const firstError = Object.values(errors)[0];
          toast.error(typeof firstError === "string" ? firstError : "Could not confirm receipt");
        },
        onFinish: () => setConfirmingDate(null),
      }
    );
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

  const isGroupedAgentView = isAgentView && !selectedTransferDate && !isUngroupedView;
  const totalUnits = isGroupedAgentView
    ? dateGroups.reduce((sum, group) => sum + Number(group.total_quantity || 0), 0)
    : transfers?.data?.reduce((sum, transfer) => sum + (Number(transfer.total_quantity) || 0), 0) || 0;
  const productCount = isGroupedAgentView
    ? dateGroups.reduce((sum, group) => sum + group.products.length, 0)
    : transfers?.data?.length || 0;

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title={agent?.name ? `${agent.name} - Transfers` : "Agent Transfers"} />

      <div className="mx-auto w-full max-w-[1600px] px-3 py-2 sm:px-5 sm:py-3 lg:px-7">
        {(!isAgentView || selectedTransferDate) && (
        <div className="mb-2 flex min-h-8 items-center justify-between gap-3">
          {isAgentView ? (
            selectedTransferDate ? (
              <Button
                variant="outline"
                onClick={() => router.get(`/transfers/agent/${agent.id}`)}
                className="flex items-center gap-2"
              >
                <ArrowLeftIcon className="w-4 h-4" />
                Back to dates
              </Button>
            ) : null
          ) : (
            <Button
              variant="outline"
              onClick={() => router.get("/transfer")}
              className="flex items-center gap-2"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              Back
            </Button>
          )}
          {!isAgentView && (
            <Button
              onClick={() => {
                if (isGod) {
                  setTransferCountry("");
                  setRows([{ product_id: "", quantity: "", merchant: "" }]);
                }
                setOpenTransferModal(true);
              }}
              className="flex items-center gap-2 text-primary-foreground"
            >
              <PlusCircleIcon className="w-4 h-4" />
              New Transfer
            </Button>
          )}
        </div>
        )}

        {agent && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border bg-card px-3 py-2.5 sm:px-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UsersIcon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{agent.name}</p>
                {agent.store_phone && (
                  <p className="truncate text-xs text-muted-foreground">{agent.store_phone}</p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
                <span className="font-semibold tabular-nums text-foreground">{productCount}</span>
                {" "}products
              </div>
              <div className="rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
                <span className="font-semibold tabular-nums text-foreground">{totalUnits}</span>
                {" "}units
              </div>
              {isAgentView && !selectedTransferDate && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.get(
                    `/transfers/agent/${agent.id}`,
                    isUngroupedView ? {} : { view: "all" }
                  )}
                  className="h-8 gap-1.5 px-2.5"
                >
                  {isUngroupedView ? (
                    <>
                      <CalendarDaysIcon className="size-3.5" />
                      Group by date
                    </>
                  ) : (
                    <>
                      <BoxesIcon className="size-3.5" />
                      Ungroup
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}

        {isGroupedAgentView ? (
          <section aria-label="Transfers grouped by date" className="grid grid-cols-2 gap-3 2xl:grid-cols-3">
            {dateGroups.length > 0 ? dateGroups.map((group) => {
              const isConfirming = confirmingDate === group.date;
              return (
                <Card key={group.date} className="group relative flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm transition-colors hover:border-primary/40">
                  <button
                    type="button"
                    onClick={() => router.get(`/transfers/agent/${agent.id}`, { date: group.date })}
                    className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    <div className="flex items-start gap-2.5 px-2.5 py-2 pb-1.5">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <CalendarDaysIcon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold leading-tight transition-colors group-hover:text-primary">
                          {new Date(`${group.date}T00:00:00`).toLocaleDateString(undefined, {
                            weekday: "long",
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {group.transfer_count} transfer{group.transfer_count === 1 ? "" : "s"}
                        </p>
                      </div>
                      <Badge variant={group.received ? "default" : "secondary"} className="shrink-0 text-[10px]">
                        {group.received ? "Received" : "Awaiting"}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 px-3 pb-2.5">
                      <TransferStatTile
                        icon={<PackageIcon className="size-3" />}
                        label="Products"
                        value={group.products.length}
                      />
                      <TransferStatTile
                        icon={<RepeatIcon className="size-3" />}
                        label="Transfers"
                        value={group.transfer_count}
                      />
                      <TransferStatTile
                        icon={<BoxesIcon className="size-3" />}
                        label="Units"
                        value={group.total_quantity}
                        tone="positive"
                      />
                    </div>
                    <div className="px-3 pb-2.5">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-500",
                            group.received
                              ? "w-full bg-gradient-to-r from-primary/40 to-primary"
                              : "w-1/3 bg-gradient-to-r from-warning/30 to-warning"
                          )}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                      <span>
                        {group.received
                          ? "Received"
                          : "Receipt confirmation needed"}
                      </span>
                      <span className="flex items-center gap-1 font-medium text-primary transition-opacity duration-300 group-hover:underline">
                        View products
                        <ArrowRightIcon className="size-3" />
                      </span>
                    </div>
                  </button>
                  {!group.received && (
                    <CardContent className="border-t border-border/60 bg-card p-3">
                      <div className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">Confirm received</p>
                          <p className="text-xs text-muted-foreground">
                            Mark all products for this date as received
                          </p>
                        </div>
                        <Switch
                          aria-label={`Confirm receipt for ${group.date}`}
                          checked={false}
                          disabled={isConfirming}
                          onCheckedChange={(checked) => {
                            if (checked) confirmReceived(group.date);
                          }}
                        />
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            }) : (
              <Card className="md:col-span-2 xl:col-span-3">
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  No transfers have been assigned to you yet.
                </CardContent>
              </Card>
            )}
          </section>
        ) : (
        <>
        {isAgentView && selectedTransferDate && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <PackageIcon className="size-4" />
              Transfers for {new Date(`${selectedTransferDate}T00:00:00`).toLocaleDateString(undefined, {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </div>
          </div>
        )}
        <Card className="overflow-hidden rounded-xl border shadow-sm">
          <CardHeader className="flex flex-col gap-1 border-b bg-muted/20 px-2 py-1 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm">
              {isAgentView ? "Products transferred to you" : "Transfers by Product"}
            </CardTitle>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search product..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSearch();
                  }}
                  className="h-8 pl-8"
                />
              </div>
              <Button size="sm" onClick={handleSearch} className="h-8 shrink-0">
                Search
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="w-12 whitespace-nowrap px-2 py-1.5">#</TableHead>
                    <TableHead className="min-w-40 px-2 py-1.5">Product</TableHead>
                    <TableHead className="whitespace-nowrap px-2 py-1.5">Transfers</TableHead>
                    <TableHead className="whitespace-nowrap px-2 py-1.5">Quantity</TableHead>
                    <TableHead className="whitespace-nowrap px-2 py-1.5">Deducted</TableHead>
                    <TableHead className="whitespace-nowrap px-2 py-1.5">Remaining</TableHead>
                    <TableHead className="whitespace-nowrap px-2 py-1.5">First transfer</TableHead>
                    <TableHead className="whitespace-nowrap px-2 py-1.5">Last transfer</TableHead>
                    <TableHead className="whitespace-nowrap px-2 py-1.5">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length > 0 ? (
                    filtered.map((item: any, index: number) => (
                      <TableRow
                        key={`${item.product_id}-${item.agent_id}`}
                        className="transition-colors hover:bg-muted/50"
                      >
                        <TableCell className="px-2 py-1.5 text-muted-foreground">{index + 1}</TableCell>
                        <TableCell className="px-2 py-1.5 font-medium">
                          {item.product?.name}
                        </TableCell>
                        <TableCell className="px-2 py-1.5">
                          <Badge variant="secondary" className="font-medium">
                            {item.transfer_count}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-2 py-1.5">
                          <Badge variant="default" className="font-medium">
                            {item.total_quantity}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-2 py-1.5">
                          <Badge variant="destructive" className="font-medium">
                            {Number(item.total_deducted || 0)}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-2 py-1.5">
                          <Badge variant="secondary" className="font-medium">
                            {Number(item.total_quantity) - Number(item.total_deducted || 0)}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-1.5 text-xs text-muted-foreground">
                          {item.first_transfer_date
                            ? new Date(item.first_transfer_date).toLocaleDateString()
                            : "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-1.5 text-xs text-muted-foreground">
                          {item.last_transfer_date
                            ? new Date(item.last_transfer_date).toLocaleDateString()
                            : "—"}
                        </TableCell>
                        <TableCell className="px-2 py-1.5">
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
                      <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
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
                onClick={() => {
                  if (!link.url) return;
                  const url = new URL(link.url, window.location.origin);
                  if (search.trim()) url.searchParams.set("search", search.trim());
                  router.get(url.toString(), {}, { preserveState: true, preserveScroll: true });
                }}
                dangerouslySetInnerHTML={{ __html: link.label }}
              />
            ))}
          </div>
        )}
        </>
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
            "flex flex-col bg-card overflow-hidden",
            "h-[95vh]",
            "md:h-screen md:w-1/2 md:max-w-none md:right-0 md:left-auto md:rounded-l-2xl"
          )}
        >
          <DrawerHeader className="border-b bg-card sticky top-0 z-10 px-6 py-4">
            <DrawerTitle className="text-xl font-bold text-foreground">
              New Transfer — {agent?.name}
            </DrawerTitle>
            <DrawerDescription className="text-sm text-muted-foreground">
              Transfer products to this agent.
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 bg-muted">
            <Card className="shadow-sm">
              <CardContent className="p-6">
                <h3 className="text-base font-semibold mb-4 text-foreground">
                  Transfer Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {isGod && (
                    <div className="space-y-1.5 sm:col-span-3">
                      <label className="text-sm font-medium text-foreground">
                        Country <span className="text-destructive">*</span>
                      </label>
                      <SearchableSelect
                        value={transferCountry}
                        onChange={(value) => {
                          setTransferCountry(value);
                          setRows([{ product_id: "", quantity: "", merchant: "" }]);
                        }}
                        placeholder="Select country before adding transfer details"
                        searchPlaceholder="Search countries..."
                        emptyLabel="No countries found."
                        options={countries.map((country) => ({
                          value: country.name,
                          label: country.name,
                        }))}
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">
                      Region <span className="text-destructive">*</span>
                    </label>
                    <Input
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      placeholder="Enter region"
                      disabled={isGod && !transferCountry}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">
                      From <span className="text-destructive">*</span>
                    </label>
                    <Input
                      value={fromField}
                      onChange={(e) => setFromField(e.target.value)}
                      placeholder="e.g. Main Warehouse"
                      disabled={isGod && !transferCountry}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">
                      Initiated By
                    </label>
                    <Input
                      readOnly
                      value={auth?.user?.name || ""}
                      className="bg-muted"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="p-6">
                <div className="flex justify-between items-center mb-5">
                  <h3 className="text-base font-semibold text-foreground">
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
                      className="border border-border border-l-4 border-l-border bg-card shadow-none"
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Product #{i + 1}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeRow(i)}
                            disabled={rows.length === 1}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 px-2"
                          >
                            <TrashIcon className="w-3.5 h-3.5 mr-1" />
                            Remove
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">
                              Product <span className="text-destructive">*</span>
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
                            <label className="text-sm font-medium text-foreground">
                              Merchant
                            </label>
                            <Input
                              readOnly
                              value={row.merchant || ""}
                              placeholder="Auto-filled on product select"
                              className="bg-muted text-muted-foreground"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">
                              Quantity <span className="text-destructive">*</span>
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

          <DrawerFooter className="border-t bg-card sticky bottom-0 z-10 flex flex-row justify-end gap-2 py-4 px-6">
            <DrawerClose asChild>
              <Button variant="outline" className="min-w-[100px]">
                Cancel
              </Button>
            </DrawerClose>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || (isGod && !transferCountry)}
              className="text-primary-foreground min-w-[140px]"
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
