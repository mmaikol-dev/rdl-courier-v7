"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppLayout from "@/layouts/app-layout";
import { type BreadcrumbItem } from "@/types";
import { Deferred, Head, usePage } from "@inertiajs/react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CsvImport, type CsvField, type CsvRequiredGroup } from "@/components/csv-import";
import { toCsv } from "@/components/csv-parse";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Check,
  ChevronsUpDown,
  LoaderCircle,
  UploadCloud,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf";
import { Skeleton } from "@/components/ui/skeleton";

const breadcrumbs: BreadcrumbItem[] = [
  { title: "Dashboard", href: "/dashboard" },
  { title: "Import Orders", href: "/orders/import" },
];

const orderCsvFields: CsvField[] = [
  { key: "order_no", label: "Order number", match: ["order no", "order number", "order #", "orderno"] },
  { key: "order_date", label: "Order date", required: true, match: ["date ordered"] },
  { key: "amount", label: "Amount", required: true, match: ["total", "price"] },
  { key: "client_name", label: "Customer name", match: ["client name", "customer", "name"] },
  { key: "address", label: "Address", match: ["delivery address"] },
  { key: "phone", label: "Phone", match: ["telephone", "mobile"] },
  { key: "alt_no", label: "Alternate phone", match: ["alternate phone", "alt phone"] },
  { key: "city", label: "City" },
  { key: "product_name", label: "Product name", required: true, match: ["product", "item"] },
  { key: "quantity", label: "Quantity", required: true, match: ["qty"] },
  { key: "status", label: "Status", match: ["order status"] },
  { key: "delivery_date", label: "Delivery date" },
  { key: "instructions", label: "Instructions", match: ["notes", "comments"] },
  { key: "cc_email", label: "Call center email", match: ["cc email"] },
];

const orderCsvRequiredGroups: CsvRequiredGroup[] = [{ keys: ["address", "city"], label: "Address or City" }];
const orderCsvTemplate = `data:text/csv;charset=utf-8,${encodeURIComponent(orderCsvFields.map((field) => field.key).join(","))}`;
const orderCsvPositionalMapping: Record<string, number> = {
  order_date: 0,
  order_no: 1,
  amount: 2,
  client_name: 3,
  address: 4,
  phone: 5,
  alt_no: 6,
  city: 8,
  product_name: 9,
  quantity: 10,
  status: 11,
  delivery_date: 12,
  instructions: 14,
  cc_email: 15,
};

interface Sheet {
  id: number;
  sheet_id: string;
  sheet_name: string;
  store_name: string;
  country: string;
  auto_pickup_tabs?: string[] | null;
}

interface Country {
  id: number;
  name: string;
  code: string;
  iso_code?: string | null;
  currency: string;
}

interface ImportDestination {
  sheet: Sheet;
  country: string;
  sheetName: string;
}

function getCsrfToken() {
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || "";
}

export default function ImportOrdersPage() {
  const { props } = usePage<{
    sheets: Sheet[];
    countries?: Country[];
    userCountry?: string | null;
    selectedCountry?: string | null;
    auth?: {
      user: {
        name?: string;
        username?: string;
        roles?: string;
        store_address?: string | null;
        country?: { name?: string } | null;
      };
    };
    flash?: { success?: string; error?: string; errors?: Record<string, string | string[]> };
  }>();
  const sheets = props.sheets || [];
  const countries = props.countries || [];
  const flash = props.flash;

  const role = (props.auth?.user?.roles || "").trim().toLowerCase();
  const isMerchant = role === "merchant";
  // Mirrors CountryAccess::userCountryName(): store_address wins, country.name is the fallback.
  const userCountry =
    props.userCountry || props.auth?.user?.store_address || props.auth?.user?.country?.name || "";
  const canPickCountry = role === "g.o.d";

  const normalizeCountry = (value?: string | null) => (value || "").trim().toLowerCase();

  const countryOptions = useMemo(() => {
    const names = new Map<string, string>();
    countries.forEach((c) => names.set(normalizeCountry(c.name), c.name));
    sheets.forEach((s) => {
      if (!names.has(normalizeCountry(s.country))) {
        names.set(normalizeCountry(s.country), s.country);
      }
    });
    return Array.from(names.values()).sort((a, b) => a.localeCompare(b));
  }, [countries, sheets]);

  // Sheet records store countries with inconsistent casing (UGANDA vs Uganda), while
  // Radix Select matches option values exactly. Always map onto the canonical option
  // so the control renders instead of falling back to the placeholder.
  const matchCountryOption = useCallback((raw?: string | null) => {
    const key = normalizeCountry(raw);
    if (!key) return "";
    return countryOptions.find((c) => normalizeCountry(c) === key) ?? (raw as string);
  }, [countryOptions]);

  const [selectedSheet, setSelectedSheet] = useState<Sheet | null>(null);
  const [sheetName, setSheetName] = useState("orders");
  const getDefaultCountry = () => isMerchant ? "" : canPickCountry
    ? matchCountryOption(props.selectedCountry)
    : matchCountryOption(userCountry);
  const [country, setCountry] = useState(getDefaultCountry);
  useEffect(() => {
    if (!canPickCountry) return;
    setCountry(matchCountryOption(props.selectedCountry));
    setSelectedSheet(null);
  }, [canPickCountry, matchCountryOption, props.selectedCountry]);
  const [file, setFile] = useState<File | null>(null);
  const [workbookInputKey, setWorkbookInputKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const csvImportDestination = useRef<ImportDestination | null>(null);
  const generatedOrderContext = useRef<{ prefix: string } | null>(null);
  const autoNumberDecision = useRef<((accepted: boolean) => void) | null>(null);
  const [autoNumberPrompt, setAutoNumberPrompt] = useState<{ count: number; prefix: string } | null>(null);

  const confirmAutoGeneratedOrderNumbers = async (rows: Record<string, string>[]) => {
    try {
      const destination = validateDestination();
      csvImportDestination.current = destination;
      const merchantLetters = destination.sheet.sheet_name.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const consonants = merchantLetters.replace(/[AEIOU]/g, "");
      const merchantPrefix = (consonants.length >= 3 ? consonants : merchantLetters).slice(0, 3) || "ORD";
      const selectedCountry = destination.country.trim();
      const selectedCountryCode = countries.find((item) =>
        normalizeCountry(item.name) === normalizeCountry(selectedCountry)
        || normalizeCountry(item.iso_code) === normalizeCountry(selectedCountry),
      )?.iso_code;
      const countryCode = selectedCountryCode
        ?? (/^[A-Za-z]{2}$/.test(selectedCountry) ? selectedCountry : selectedCountry.replace(/[^A-Za-z]/g, "").slice(0, 2));
      const prefix = `${merchantPrefix.padEnd(3, "X")}${countryCode.toUpperCase()}`;
      const generatedPattern = new RegExp(`^${prefix}\\d+$`, "i");
      const count = rows.filter((row) => !generatedPattern.test(row.order_no?.trim() ?? "")).length;
      if (!count) {
        generatedOrderContext.current = { prefix };
        return true;
      }

      return new Promise<boolean>((resolve) => {
        autoNumberDecision.current = (accepted) => {
          generatedOrderContext.current = accepted ? { prefix } : null;
          if (!accepted) csvImportDestination.current = null;
          autoNumberDecision.current = null;
          setAutoNumberPrompt(null);
          resolve(accepted);
        };
        setAutoNumberPrompt({ count, prefix });
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare generated order numbers.");
      return false;
    }
  };

  const answerAutoNumberPrompt = (accepted: boolean) => {
    autoNumberDecision.current?.(accepted);
  };

  const sheetsForCountry = useMemo(() => {
    // Merchants legitimately trade across countries, so they are never country-filtered.
    if (isMerchant) return sheets;
    if (!normalizeCountry(country)) return sheets;
    return sheets.filter((s) => normalizeCountry(s.country) === normalizeCountry(country));
  }, [sheets, country, isMerchant]);
  const destinationSheetNames = useMemo(() => {
    if (!selectedSheet) return [];
    return Array.from(new Set(sheets
      .filter((sheet) => normalizeCountry(sheet.sheet_name) === normalizeCountry(selectedSheet.sheet_name))
      .flatMap((sheet) => sheet.auto_pickup_tabs ?? [])
      .map((name) => name.trim())
      .filter(Boolean)));
  }, [sheets, selectedSheet]);
  const [sheetNameOpen, setSheetNameOpen] = useState(false);

  const handleCountryChange = (nextCountry: string) => {
    setCountry(nextCountry);
    const firstSheet = sheetsForCountry.find(
      (s) => normalizeCountry(s.country) === normalizeCountry(nextCountry),
    );
    setSelectedSheet(firstSheet ?? null);
    setSheetName(firstSheet?.auto_pickup_tabs?.[0] ?? "orders");
  };

  const handleSheetChange = (sheet: Sheet) => {
    setSelectedSheet(sheet);
    setCountry(matchCountryOption(sheet.country));
    setSheetName(sheet.auto_pickup_tabs?.[0] ?? "orders");
  };

  useEffect(() => {
    if (flash?.success) {
      toast.success(flash.success);
    }

    if (flash?.error) {
      toast.error(flash.error);
    }

    if (flash?.errors) {
      const firstError = Object.values(flash.errors).flat()[0];
      if (typeof firstError === "string") {
        toast.error(firstError);
      }
    }
  }, [flash]);

  const clearForm = () => {
    setSelectedSheet(null);
    setSheetName("orders");
    setCountry(getDefaultCountry());
    setFile(null);
    setWorkbookInputKey((key) => key + 1);
    generatedOrderContext.current = null;
    csvImportDestination.current = null;
  };

  const validateDestination = (): ImportDestination => {
    if (!selectedSheet) {
      throw new Error("Select a merchant before importing.");
    }

    if (!country.trim()) {
      throw new Error("Select a country.");
    }

    if (!sheetName.trim()) {
      throw new Error("Enter the destination sheet name.");
    }

    return { sheet: selectedSheet, country, sheetName: sheetName.trim() };
  };

  const uploadImportFile = async (
    uploadFile: File,
    signal?: AbortSignal,
    destination: ImportDestination = validateDestination(),
    generatedOrderNumbers: { source: string | null; target: string }[] = [],
  ) => {
    const formData = new FormData();
    formData.append("country", destination.country);
    formData.append("merchant", destination.sheet.sheet_name);
    formData.append("sheet_id", destination.sheet.sheet_id);
    formData.append("sheet_name", destination.sheetName);
    formData.append("store_name", destination.sheet.store_name);
    if (generatedOrderNumbers.length) formData.append("generated_order_numbers", JSON.stringify(generatedOrderNumbers));
    formData.append("file", uploadFile);
    setUploadProgress(0);

    const progressToastId = "import-upload-progress";
    toast.loading("Uploading orders...", { id: progressToastId, description: "0% complete" });

    const response = await new Promise<{ status: number; body: unknown }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const abortUpload = () => xhr.abort();
      const cleanUp = () => signal?.removeEventListener("abort", abortUpload);

      xhr.open("POST", "/orders/import", true);
      xhr.responseType = "text";
      xhr.withCredentials = true;
      xhr.setRequestHeader("Accept", "application/json");
      xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");

      const csrf = csrfHeaders();
      if (csrf["X-XSRF-TOKEN"]) {
        xhr.setRequestHeader("X-XSRF-TOKEN", csrf["X-XSRF-TOKEN"]);
      } else {
        xhr.setRequestHeader("X-CSRF-TOKEN", csrf["X-CSRF-TOKEN"] ?? getCsrfToken());
      }

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
        setUploadProgress(percent);
        toast.loading("Uploading orders...", {
          id: progressToastId,
          description: (
            <div className="space-y-2">
              <div className="text-sm">{percent}% complete</div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
              </div>
            </div>
          ),
        });
      };

      xhr.onload = () => {
        cleanUp();
        try {
          const contentType = xhr.getResponseHeader("content-type") || "";
          const body = xhr.responseText || "";
          if (!contentType.includes("application/json")) {
            reject(new Error(body.startsWith("<!DOCTYPE") || body.startsWith("<html") ? "The server returned HTML instead of JSON." : body || "Unexpected server response."));
            return;
          }
          resolve({ status: xhr.status, body: body ? JSON.parse(body) : {} });
        } catch (error) {
          reject(error instanceof Error ? error : new Error("Failed to parse server response."));
        }
      };
      xhr.onerror = () => {
        cleanUp();
        reject(new Error("Upload failed. Please check your connection and try again."));
      };
      xhr.onabort = () => {
        cleanUp();
        reject(new Error("Upload was cancelled."));
      };
      signal?.addEventListener("abort", abortUpload, { once: true });
      if (signal?.aborted) {
        abortUpload();
        return;
      }
      xhr.send(formData);
    });

    const data = response.body as { message?: string; errors?: Record<string, string | string[]> };
    if (response.status < 200 || response.status >= 300) {
      const message = data?.message || Object.values(data?.errors || {}).flat()[0] || "Failed to import orders";
      throw new Error(typeof message === "string" ? message : "Failed to import orders");
    }

    setUploadProgress(100);
    return data?.message || "Orders imported successfully";
  };

  const handleImport = async () => {
    if (isImporting || !file) return;
    setIsImporting(true);
    try {
      const message = await uploadImportFile(file);
      toast.success(message, { id: "import-upload-progress" });
      clearForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to import orders", { id: "import-upload-progress" });
    } finally {
      setIsImporting(false);
      setUploadProgress(0);
    }
  };

  const importCsvBatch = async (rows: Record<string, string>[], { signal, start }: { signal: AbortSignal; start: number }) => {
    if (start === 0 && !csvImportDestination.current) csvImportDestination.current = validateDestination();
    const destination = csvImportDestination.current;
    if (!destination) throw new Error("The import destination is unavailable. Please start the import again.");
    const orderContext = generatedOrderContext.current;
    const mappedFields = orderCsvFields.filter((field) =>
      field.key === "order_no" && orderContext
        ? true
        : Object.hasOwn(rows[0] ?? {}, field.key),
    );
    const generatedOrderNumbers: { source: string | null; target: string }[] = [];
    const csvRows = [
      mappedFields.map((field) => field.key),
      ...rows.map((row, index) => mappedFields.map((field) => {
        if (field.key === "order_no" && orderContext) {
          const source = row.order_no?.trim() || null;
          const sourceSequence = source?.match(/(\d+)$/)?.[1];
          const orderNumber = `${orderContext.prefix}${sourceSequence ?? start + index + 1}`;
          generatedOrderNumbers.push({ source, target: orderNumber });
          return orderNumber;
        }
        return row[field.key] ?? "";
      })),
    ];
    const csvFile = new File([toCsv(csvRows)], "orders-mapped.csv", { type: "text/csv" });
    if (start === 0) setIsImporting(true);
    try {
      const message = await uploadImportFile(csvFile, signal, destination, generatedOrderNumbers);
      toast.success(message, { id: "import-upload-progress" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import orders";
      toast.error(message, { id: "import-upload-progress" });
      throw error;
    }
  };

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Import Orders" />

      <Deferred data="sheets" fallback={<div className="grid gap-3 p-2 sm:p-3 xl:grid-cols-[1.5fr_0.85fr]" role="status" aria-label="Loading import setup" aria-live="polite"><div className="space-y-4 rounded-xl border p-4"><Skeleton className="h-6 w-40" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-32 w-full" /><Skeleton className="h-10 w-32" /></div><div className="space-y-3 rounded-xl border p-4"><Skeleton className="h-6 w-36" /><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div></div>}>
      {() => <>
      <div className="space-y-3 p-2 sm:p-3">
        <div className="grid items-start gap-3 xl:grid-cols-[1.5fr_0.85fr]">
          <Card className="overflow-hidden border-border/70 shadow-sm">
            <CardHeader className="gap-0.5 border-b bg-muted/30 px-3 py-2">
              <CardTitle className="text-base">Import Setup</CardTitle>
              <CardDescription className="text-xs leading-tight">Choose a merchant destination and upload the order file.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">
                    Merchant <span className="text-destructive">*</span>
                  </label>
                  <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        disabled={isImporting}
                        className="h-auto min-h-10 w-full justify-between gap-2 py-2 text-left font-normal"
                      >
                        <span
                          className={cn(
                            "flex-1 whitespace-normal break-words",
                            !selectedSheet && "text-muted-foreground",
                          )}
                        >
                          {selectedSheet
                            ? [selectedSheet.sheet_name, selectedSheet.country]
                                .filter(Boolean)
                                .join(" · ")
                            : "Select merchant"}
                        </span>
                        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[min(36rem,calc(100vw-2rem))] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search merchant, store, or country..." />
                        <CommandList>
                          <CommandGroup>
                            {sheetsForCountry.length > 0 ? (
                              sheetsForCountry.map((sheet) => (
                                <CommandItem
                                  key={sheet.id}
                                  value={[sheet.sheet_name, sheet.store_name, sheet.country].join(" ")}
                                  onSelect={() => {
                                    handleSheetChange(sheet);
                                    setOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4 shrink-0",
                                      selectedSheet?.id === sheet.id ? "opacity-100" : "opacity-0",
                                    )}
                                  />
                                  <div className="min-w-0">
                                    <div className="whitespace-normal break-words font-medium">
                                      {sheet.sheet_name}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {[sheet.store_name, sheet.country].filter(Boolean).join(" · ")}
                                    </div>
                                  </div>
                                </CommandItem>
                              ))
                            ) : (
                              <div className="p-3 text-sm text-muted-foreground">
                                No merchants found{country ? ` for ${country}` : ""}.
                              </div>
                            )}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {isMerchant && (
                    <p className="text-xs text-muted-foreground">Showing merchants linked to your account.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="import_sheet_name" className="text-sm font-medium text-foreground">
                    Destination Sheet Name
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id="import_sheet_name"
                      value={sheetName}
                      onChange={(e) => setSheetName(e.target.value)}
                      disabled={isImporting}
                      placeholder="Choose or type a sheet tab name"
                      className="h-10 min-w-0 flex-1"
                    />
                    <Popover open={sheetNameOpen} onOpenChange={setSheetNameOpen}>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" aria-label="Show saved sheet names" aria-expanded={sheetNameOpen} disabled={isImporting || !selectedSheet} className="h-10 shrink-0 px-3">
                          <ChevronsUpDown className="size-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[min(24rem,calc(100vw_-_2rem))] p-0" align="end">
                        <Command>
                          <CommandInput placeholder="Search saved sheet names..." />
                          <CommandList>
                            <CommandGroup heading="Saved sheet names">
                              {destinationSheetNames.length > 0 ? destinationSheetNames.map((name) => (
                                <CommandItem key={name} value={name} onSelect={() => { setSheetName(name); setSheetNameOpen(false); }}>
                                  <Check className={cn("mr-2 size-4", sheetName === name ? "opacity-100" : "opacity-0")} />
                                  {name}
                                </CommandItem>
                              )) : <CommandItem disabled value="no-saved-sheet-names">No saved sheet names for this merchant</CommandItem>}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <p className="text-xs text-muted-foreground">Choose a saved tab or type a new name. Defaults to &quot;orders&quot;.</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="import_country" className="text-sm font-medium text-foreground">
                    Country <span className="text-destructive">*</span>
                  </label>
                  <Select
                    value={country}
                    onValueChange={handleCountryChange}
                    disabled={isImporting || !canPickCountry || Boolean(props.selectedCountry)}
                  >
                    <SelectTrigger id="import_country" className="h-10">
                      <SelectValue placeholder="Select a country" />
                    </SelectTrigger>
                    <SelectContent>
                      {countryOptions.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {canPickCountry
                      ? props.selectedCountry
                        ? "Using the country selected in the dashboard header."
                        : "Select a country to load its default sheet ID."
                      : isMerchant
                        ? "Set from the merchant you select — merchants trade across all countries."
                        : "Fixed to your assigned country."}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Sheet ID</label>
                  <Input value={selectedSheet?.sheet_id || ""} readOnly placeholder="Auto-filled from the selected country/sheet" className="h-10 bg-muted" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Store Name</label>
                <Textarea
                  value={selectedSheet?.store_name || ""}
                  readOnly
                  placeholder="Auto-filled from merchant"
                  className="min-h-16 resize-none bg-muted"
                />
              </div>

              <CsvImport
                fields={orderCsvFields}
                requiredGroups={orderCsvRequiredGroups}
                onBeforeImport={confirmAutoGeneratedOrderNumbers}
                onImport={importCsvBatch}
                onDone={() => {
                  csvImportDestination.current = null;
                  generatedOrderContext.current = null;
                  setIsImporting(false);
                  setUploadProgress(0);
                }}
                positionalMapping={orderCsvPositionalMapping}
                batchSize={250}
                maxRows={50_000}
                noun={{ one: "order", many: "orders" }}
                title="Import orders"
                description="Match your file’s columns, check every order, then import the valid rows."
                templateHref={orderCsvTemplate}
              />

              <div className="space-y-3 border-t pt-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Have an Excel workbook?</p>
                    <p className="text-xs text-muted-foreground">CSV files use the mapper above. Excel files keep the existing upload flow.</p>
                  </div>
                  <Button type="button" size="sm" variant="outline" disabled={isImporting} onClick={() => document.getElementById("import-workbook")?.click()}>
                    <UploadCloud className="mr-2 size-4" />
                    Choose Excel file
                  </Button>
                  <Input
                    key={workbookInputKey}
                    id="import-workbook"
                    type="file"
                    accept=".xlsx,.xls"
                    className="sr-only"
                    disabled={isImporting}
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  />
                </div>
                {file && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                    <p className="min-w-0 truncate text-xs text-muted-foreground">{file.name}</p>
                    <Button type="button" size="sm" onClick={handleImport} disabled={isImporting} className="gap-2">
                      {isImporting ? <LoaderCircle className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
                      {isImporting ? `Importing... ${uploadProgress}%` : "Import workbook"}
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex justify-end border-t pt-3">
                <Button variant="outline" size="sm" onClick={clearForm} disabled={isImporting}>
                  Clear destination
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <Card className="border-border/70 shadow-sm">
              <CardHeader className="gap-1 px-4 py-3">
                <CardTitle className="text-base">Import Checklist</CardTitle>
                <CardDescription className="text-xs">Quick checks before importing.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 px-4 pb-4 pt-0 text-sm text-muted-foreground">
                <div className="rounded-lg border bg-muted p-3">
                  <div className="font-medium text-foreground">1. Confirm the merchant</div>
                  <p className="mt-1">Pick the merchant first. Its store name and country fill in automatically.</p>
                </div>
                <div className="rounded-lg border bg-muted p-3">
                  <div className="font-medium text-foreground">2. Check the destination tab name</div>
                  <p className="mt-1">It defaults to &quot;orders&quot;. Change it only if you want orders written to a different tab.</p>
                </div>
                <div className="rounded-lg border bg-muted p-3">
                  <div className="font-medium text-foreground">3. Upload the latest file only once</div>
                  <p className="mt-1">This importer updates matching orders and inserts new ones from the uploaded file.</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-sm">
              <CardHeader className="gap-1 px-4 py-3">
                <CardTitle className="text-base">Selected Merchant</CardTitle>
                <CardDescription className="text-xs">Current import destination.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 px-4 pb-4 pt-0">
                <div className="rounded-xl bg-primary p-4 text-primary-foreground">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Merchant</div>
                  <div className="mt-1 text-lg font-semibold">
                    {selectedSheet?.sheet_name || "No merchant selected"}
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                    <div>
                      <div className="text-muted-foreground">Store Name</div>
                      <div>{selectedSheet?.store_name || "Waiting for selection"}</div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <div className="text-muted-foreground">Country</div>
                        <div>{selectedSheet?.country || "Waiting for selection"}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Sheet ID</div>
                        <div className="break-all">{selectedSheet?.sheet_id || "Waiting for selection"}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning-foreground">
                  Imported rows are matched by order number, merchant, and sheet ID. Existing rows are updated; missing ones are created.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <AlertDialog
        open={Boolean(autoNumberPrompt)}
        onOpenChange={(open) => {
          if (!open) answerAutoNumberPrompt(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Standardize imported order numbers?</AlertDialogTitle>
            <AlertDialogDescription>
              {autoNumberPrompt?.count ?? 0} order number(s) need the merchant and country prefix. They will use a format such as {autoNumberPrompt?.prefix ?? "BYSKE"}345, keeping the current numeric ending where possible. If a number is already in use, the importer will find an available one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => answerAutoNumberPrompt(false)}>Cancel import</AlertDialogCancel>
            <AlertDialogAction onClick={() => answerAutoNumberPrompt(true)}>Generate and import</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </>}
      </Deferred>
    </AppLayout>
  );
}
