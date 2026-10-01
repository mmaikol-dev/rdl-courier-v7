"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/layouts/app-layout";
import { type BreadcrumbItem } from "@/types";
import { Head, usePage } from "@inertiajs/react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { format } from "date-fns";
import { type DateRange } from "react-day-picker";
import {
  CalendarIcon,
  Check,
  ChevronsUpDown,
  DownloadIcon,
  FileSpreadsheetIcon,
  LoaderCircle,
  Store,
} from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf";
import { toast } from "sonner";

const breadcrumbs: BreadcrumbItem[] = [
  { title: "Dashboard", href: "/dashboard" },
  { title: "Generate Report", href: "/report" },
];

type DateField = "delivery_date" | "order_date";

interface AppliedFilters {
  date_field: DateField;
  date_field_label: string;
  from: string;
  to: string;
  merchant: string;
  statuses: string;
}

interface PreviewRow {
  id: number;
  order_no: string;
  order_date: string | null;
  delivery_date: string | null;
  sort_date: string | null;
  amount: string | null;
  client_name: string | null;
  phone: string | null;
  alt_no: string | null;
  city: string | null;
  country: string | null;
  product_name: string | null;
  quantity: number | null;
  status: string | null;
  merchant: string | null;
  cc_email: string | null;
}

interface OrdersFilterCardProps {
  merchants: string[];
  statuses: string[];
  dateFields: DateField[];
  isMerchantUser: boolean;
}

interface ReportPageProps {
  [key: string]: unknown;
  flash?: {
    success?: string;
    error?: string;
  };
  errors?: Record<string, string[]>;
}

export default function OrdersFilterCard({
  merchants,
  statuses,
  dateFields,
  isMerchantUser,
}: OrdersFilterCardProps) {
  const { flash, errors } = usePage<ReportPageProps>().props;
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [dateField, setDateField] = useState<DateField>(
    dateFields.includes("delivery_date") ? "delivery_date" : dateFields[0]
  );
  const [merchant, setMerchant] = useState<string | null>(null);
  const [status, setStatus] = useState<string[]>([]);
  const [merchantOpen, setMerchantOpen] = useState(false);

  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [applied, setApplied] = useState<AppliedFilters | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewed, setPreviewed] = useState(false);

  useEffect(() => {
    if (flash?.success) toast.success(flash.success);
    if (flash?.error) toast.error(flash.error);
    Object.values(errors ?? {}).forEach((messages) => messages.forEach((m) => toast.error(m)));
  }, [flash?.success, flash?.error, errors]);

  // A merchant-role operator only ever sees their own merchant names.
  useEffect(() => {
    if (isMerchantUser && merchants.length === 1 && merchant === null) {
      setMerchant(merchants[0]);
    }
  }, [isMerchantUser, merchants, merchant]);

  const dateFieldLabel = useMemo(
    () => (dateField === "order_date" ? "Order Date" : "Delivery Date"),
    [dateField]
  );

  // An empty selection means "every status", so the All chip is the active one.
  const allStatusesSelected = status.length === 0;

  // Any filter change invalidates the current preview, so Generate is re-gated.
  const resetPreview = () => {
    setRows([]);
    setTotal(0);
    setApplied(null);
    setPreviewed(false);
  };

  const toggleStatus = (s: string) => {
    setStatus((prev) => (prev.includes(s) ? prev.filter((st) => st !== s) : [...prev, s]));
  };

  const selectAllStatuses = () => {
    setStatus([]);
  };

  const clearFilters = () => {
    setDateRange(undefined);
    setMerchant(isMerchantUser && merchants.length === 1 ? merchants[0] : null);
    setStatus([]);
    resetPreview();
    toast.success("Filters cleared");
  };

  const buildPayload = (overrides?: { page?: number; from?: string; to?: string }) => {
    const from =
      overrides?.from ?? (dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "");
    const to = overrides?.to ?? (dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : "");

    return {
      from,
      to,
      date_field: dateField,
      merchant: merchant ?? "",
      statuses: status,
      page: overrides?.page ?? 1,
    };
  };

  const runPreview = async (targetPage: number, append: boolean) => {
    const payload = buildPayload({ page: targetPage });

    if (!payload.from) {
      toast.error("Select a start date for the date window");
      return;
    }

    setIsPreviewing(true);

    try {
      const response = await fetch("/report/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          ...csrfHeaders(),
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        toast.error(data.message ?? "Could not build the preview");
        return;
      }

      setRows((prev) => (append ? [...prev, ...data.rows] : data.rows));
      setTotal(data.total);
      setPage(targetPage);
      setHasMore(Boolean(data.has_more));
      setApplied(data.applied);
      setPreviewed(true);

      if (!append && data.total === 0) {
        toast.info("No orders match these filters");
      }
    } catch (error) {
      console.error("Report preview failed", error);
      toast.error("Could not build the preview");
    } finally {
      setIsPreviewing(false);
    }
  };

  const previewReport = () => runPreview(1, false);

  const generateReport = () => {
    const payload = buildPayload();

    if (!payload.from) {
      toast.error("Select a start date for the date window");
      return;
    }

    const params = new URLSearchParams();
    params.append("from", payload.from);
    if (payload.to) params.append("to", payload.to);
    params.append("date_field", payload.date_field);
    if (payload.merchant) params.append("merchant", payload.merchant);
    payload.statuses.forEach((s) => params.append("statuses[]", s));

    setIsGenerating(true);

    try {
      const link = document.createElement("a");
      link.href = `/report/download?${params.toString()}`;
      link.setAttribute("download", "orders_report.xlsx");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(`Report download started (${total} order${total === 1 ? "" : "s"})`);
    } catch (error) {
      toast.error("Failed to download report");
      console.error("Report download failed", error);
    } finally {
      setTimeout(() => setIsGenerating(false), 600);
    }
  };

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Generate Report" />

      <div className="space-y-6 p-4 sm:p-6">
        <section className="overflow-hidden rounded-3xl border bg-gradient-to-r from-slate-950 via-slate-900 to-emerald-950 text-white shadow-xl">
          <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                Generate clean order reports
              </h1>
              <p className="mt-1 text-sm text-slate-200/85">
                Filter by date basis, merchant, and status, preview the matching orders, then export to
                Excel.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 lg:justify-end">
              <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2 backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-300">Merchants</p>
                <p className="text-sm font-semibold text-white">{merchants.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2 backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-300">Statuses</p>
                <p className="text-sm font-semibold text-white">{statuses.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2 backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-300">Output</p>
                <p className="text-sm font-semibold text-white">Excel</p>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="overflow-hidden border-0 shadow-lg">
            <CardHeader className="border-b bg-slate-50/80">
              <CardTitle className="text-xl">Report Filters</CardTitle>
              <CardDescription>
                Choose whether the date window filters on delivery date or order date, then preview
                the matching orders.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 p-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Filter dates by</label>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={dateField}
                  onValueChange={(value) => {
                    if (value) {
                      setDateField(value as DateField);
                      resetPreview();
                    }
                  }}
                  className="w-full justify-start gap-2 sm:w-auto"
                >
                  {dateFields.map((field) => (
                    <ToggleGroupItem key={field} value={field} className="px-4">
                      {field === "order_date" ? "Order Date" : "Delivery Date"}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <p className="text-xs text-slate-500">
                  The selected basis controls which order timestamp the date range below is applied
                  to. Both dates are still included as columns in the export.
                </p>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">{dateFieldLabel}</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "h-auto min-h-11 w-full justify-start py-3 text-left font-normal",
                          !dateRange?.from && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange?.from ? (
                          dateRange?.to ? (
                            <>
                              {format(dateRange.from, "LLL dd, y")} -{" "}
                              {format(dateRange.to, "LLL dd, y")}
                            </>
                          ) : (
                            format(dateRange.from, "LLL dd, y")
                          )
                        ) : (
                          <span>Select a date range</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="range"
                        selected={dateRange}
                        onSelect={(range) => {
                          setDateRange(range);
                          resetPreview();
                        }}
                        numberOfMonths={2}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Merchant</label>
                  {isMerchantUser ? (
                    <div className="flex min-h-11 items-center rounded-lg border bg-slate-50 px-3 py-2 text-sm">
                      {merchant ?? "Your merchant"}
                    </div>
                  ) : (
                    <Popover open={merchantOpen} onOpenChange={setMerchantOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="h-auto min-h-11 w-full justify-between py-3"
                        >
                          <span className={cn("truncate", !merchant && "text-muted-foreground")}>
                            {merchant || "Select merchant"}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-[min(28rem,calc(100vw-2rem))] p-0"
                        align="start"
                      >
                        <Command>
                          <CommandInput placeholder="Search merchant..." />
                          <CommandList>
                            <CommandEmpty>No merchant found.</CommandEmpty>
                            <CommandGroup>
                              {merchants.map((m) => (
                                <CommandItem
                                  key={m}
                                  value={m}
                                  onSelect={() => {
                                    setMerchant(m === merchant ? null : m);
                                    setMerchantOpen(false);
                                    resetPreview();
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      merchant === m ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {m}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}
                  {isMerchantUser ? (
                    <p className="text-xs text-slate-500">
                      Your account is limited to your own merchant name or username.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-slate-700">Status</label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={allStatusesSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      selectAllStatuses();
                      resetPreview();
                    }}
                    className={cn(
                      "rounded-full px-4",
                      allStatusesSelected && "bg-slate-900 text-white hover:bg-slate-800"
                    )}
                  >
                    {allStatusesSelected ? <Check className="h-4 w-4" /> : null}
                    All statuses
                  </Button>

                  {statuses.map((s) => {
                    const selected = status.includes(s);
                    return (
                      <Button
                        key={s}
                        variant={selected ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          toggleStatus(s);
                          resetPreview();
                        }}
                        className={cn(
                          "rounded-full px-4",
                          selected && "bg-slate-900 text-white hover:bg-slate-800"
                        )}
                      >
                        {selected ? <Check className="h-4 w-4" /> : null}
                        {s}
                      </Button>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-500">
                  Leave every status unselected, or pick &quot;All statuses&quot;, to include orders in
                  any status — including orders with no status set.
                </p>
              </div>

              <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
                <Button onClick={previewReport} disabled={isPreviewing} className="min-w-44">
                  {isPreviewing ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileSpreadsheetIcon className="h-4 w-4" />
                  )}
                  Preview orders
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b bg-emerald-50/70">
              <CardTitle className="text-xl">Selection Summary</CardTitle>
              <CardDescription>Review the active export scope before downloading.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-6">
              <div className="rounded-2xl border bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <CalendarIcon className="h-5 w-5 text-emerald-600" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">Date basis</p>
                    <p className="text-sm text-slate-500">{dateFieldLabel}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <CalendarIcon className="h-5 w-5 text-emerald-600" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">{dateFieldLabel} range</p>
                    <p className="text-sm text-slate-500">
                      {dateRange?.from
                        ? dateRange?.to
                          ? `${format(dateRange.from, "LLL dd, y")} to ${format(
                              dateRange.to,
                              "LLL dd, y"
                            )}`
                          : `${format(dateRange.from, "LLL dd, y")} onwards`
                        : `Any ${dateFieldLabel.toLowerCase()}`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <Store className="h-5 w-5 text-sky-600" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">Merchant</p>
                    <p className="text-sm text-slate-500">
                      {applied?.merchant ?? merchant ?? "All merchants"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-900">Statuses</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {status.length > 0 ? (
                    status.map((item) => (
                      <span
                        key={item}
                        className="inline-flex rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white"
                      >
                        {item}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">All statuses</span>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-dashed bg-white p-4">
                <p className="text-sm font-medium text-slate-900">Export format</p>
                <p className="mt-1 text-sm text-slate-500">
                  The report downloads as an Excel file for sharing and reconciliation.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden border-0 shadow-lg">
          <CardHeader className="border-b bg-slate-50/80">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-xl">Matching orders</CardTitle>
                <CardDescription>
                  {previewed
                    ? `${total} order${total === 1 ? "" : "s"} match the current filters${
                        applied ? ` on ${applied.date_field_label.toLowerCase()} from ${applied.from} to ${applied.to}` : ""
                      }. Showing ${rows.length}.`
                    : "Set your filters and click Preview orders to see exactly what will be exported."}
                </CardDescription>
              </div>

              <Button
                onClick={generateReport}
                disabled={!previewed || total === 0 || isGenerating}
                className="min-w-44 shrink-0"
              >
                {isGenerating ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <DownloadIcon className="h-4 w-4" />
                )}
                Generate report
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {!previewed ? (
              <div className="px-6 py-14 text-center">
                <FileSpreadsheetIcon className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 text-sm text-slate-500">No preview yet.</p>
              </div>
            ) : rows.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <p className="text-sm text-slate-500">
                  No orders match these filters. Widen the date range or clear some statuses.
                </p>
              </div>
            ) : (
              <>
                <div className="max-h-[32rem] overflow-auto">
                  <Table>
                    <TableHeader className="bg-slate-50 sticky top-0 z-10">
                      <TableRow>
                        <TableHead className="w-28">Order No</TableHead>
                        <TableHead className="w-28">Order Date</TableHead>
                        <TableHead className="w-28">Delivery Date</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead className="w-28">Phone</TableHead>
                        <TableHead className="w-28">Alt No</TableHead>
                        <TableHead className="w-32">City</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="w-16 text-right">Qty</TableHead>
                        <TableHead className="w-28 text-right">Amount</TableHead>
                        <TableHead className="w-32">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.order_no}</TableCell>
                          <TableCell>{row.order_date ?? "—"}</TableCell>
                          <TableCell>{row.delivery_date ?? "—"}</TableCell>
                          <TableCell className="max-w-56 truncate">{row.client_name ?? "—"}</TableCell>
                          <TableCell>{row.phone ?? "—"}</TableCell>
                          <TableCell>{row.alt_no || "—"}</TableCell>
                          <TableCell className="max-w-40 truncate">{row.city ?? "—"}</TableCell>
                          <TableCell className="max-w-72 truncate">{row.product_name ?? "—"}</TableCell>
                          <TableCell className="text-right">{row.quantity ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            {row.amount != null ? Number(row.amount).toLocaleString() : "—"}
                          </TableCell>
                          <TableCell>
                            {row.status ? (
                              <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                                {row.status}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">New</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {hasMore ? (
                  <div className="flex justify-center border-t p-4">
                    <Button
                      variant="outline"
                      onClick={() => runPreview(page + 1, true)}
                      disabled={isPreviewing}
                    >
                      {isPreviewing ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : null}
                      Load more ({rows.length} of {total})
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}