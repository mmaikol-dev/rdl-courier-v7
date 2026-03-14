"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/layouts/app-layout";
import { type BreadcrumbItem } from "@/types";
import { Head, usePage } from "@inertiajs/react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { type DateRange } from "react-day-picker";
import { CalendarIcon, Check, ChevronsUpDown, DownloadIcon, LoaderCircle, Store } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

import { cn } from "@/lib/utils";
import { toast } from "sonner";

const breadcrumbs: BreadcrumbItem[] = [
  { title: "Dashboard", href: "/dashboard" },
  { title: "Generate Report", href: "/report" },
];

interface OrdersFilterCardProps {
  merchants: string[];
}

interface ReportPageProps {
  [key: string]: unknown;
  flash?: {
    success?: string;
    error?: string;
  };
}

export default function OrdersFilterCard({ merchants }: OrdersFilterCardProps) {
    const { flash } = usePage<ReportPageProps>().props;
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const [merchant, setMerchant] = useState<string | null>(null);
  const [status, setStatus] = useState<string[]>([]);
  const [merchantOpen, setMerchantOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (flash?.success) toast.success(flash.success);
    if (flash?.error) toast.error(flash.error);
  }, [flash?.success, flash?.error]);

  const statuses = [
    "Pending",
    "Delivered",
    "Cancelled",
    "Rescheduled",
    "Scheduled",
    "Dispatched",
    "Followup",
    "Returned",
  ];

  const toggleStatus = (s: string) => {
    setStatus((prev) =>
      prev.includes(s) ? prev.filter((st) => st !== s) : [...prev, s]
    );
  };

  const clearFilters = () => {
    setDateRange(undefined);
    setMerchant(null);
    setStatus([]);
    toast.success("Filters cleared");
  };

  const generateReport = () => {
    try {
      setIsGenerating(true);
      const params = new URLSearchParams();

      if (merchant) params.append("merchant", merchant);
      if (status.length) status.forEach((s) => params.append("statuses[]", s));
      if (dateRange?.from) params.append("from", dateRange.from.toISOString());
      if (dateRange?.to) params.append("to", dateRange.to.toISOString());

      const link = document.createElement("a");
      link.href = `/report/download?${params.toString()}`;
      link.setAttribute("download", "orders_report.xlsx");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("Report download started");
    } catch (error) {
      toast.error("Failed to download report");
      console.error("Report download failed", error);
    } finally {
      setTimeout(() => setIsGenerating(false), 600);
    }
  };

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Orders Filter" />

      <div className="space-y-6 p-4 sm:p-6">
        <section className="overflow-hidden rounded-3xl border bg-gradient-to-r from-slate-950 via-slate-900 to-emerald-950 text-white shadow-xl">
          <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Generate clean order reports</h1>
              <p className="mt-1 text-sm text-slate-200/85">Filter by date, merchant, and status, then export to Excel.</p>
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
              <CardDescription>Choose the date window, merchant, and statuses to narrow the exported report.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 p-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Delivery Date</label>
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
                              {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}
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
                        }}
                        numberOfMonths={2}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Merchant</label>
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
                    <PopoverContent className="w-[min(28rem,calc(100vw-2rem))] p-0" align="start">
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
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", merchant === m ? "opacity-100" : "opacity-0")} />
                                {m}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-slate-700">Status</label>
                <div className="flex flex-wrap gap-2">
                  {statuses.map((s) => {
                    const selected = status.includes(s);
                    return (
                      <Button
                        key={s}
                        variant={selected ? "default" : "outline"}
                        size="sm"
                        onClick={() => toggleStatus(s)}
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
              </div>

              <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
                <Button onClick={generateReport} disabled={isGenerating} className="min-w-44">
                  {isGenerating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <DownloadIcon className="h-4 w-4" />}
                  Generate report
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
                    <p className="text-sm font-medium text-slate-900">Date range</p>
                    <p className="text-sm text-slate-500">
                      {dateRange?.from
                        ? dateRange?.to
                          ? `${format(dateRange.from, "LLL dd, y")} to ${format(dateRange.to, "LLL dd, y")}`
                          : format(dateRange.from, "LLL dd, y")
                        : "Any delivery date"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <Store className="h-5 w-5 text-sky-600" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">Merchant</p>
                    <p className="text-sm text-slate-500">{merchant || "All merchants"}</p>
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
                <p className="mt-1 text-sm text-slate-500">The report downloads as an Excel file for sharing and reconciliation.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
