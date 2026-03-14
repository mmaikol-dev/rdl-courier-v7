"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/layouts/app-layout";
import { type BreadcrumbItem } from "@/types";
import { Head, usePage } from "@inertiajs/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Check,
  ChevronsUpDown,
  LoaderCircle,
  UploadCloud,
} from "lucide-react";
import { cn } from "@/lib/utils";

const breadcrumbs: BreadcrumbItem[] = [
  { title: "Dashboard", href: "/dashboard" },
  { title: "Import Orders", href: "/orders/import" },
];

interface Sheet {
  id: number;
  sheet_id: string;
  sheet_name: string;
  store_name: string;
  country: string;
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

function getCsrfToken() {
  const xsrfCookie = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith("XSRF-TOKEN="))
    ?.split("=")[1];

  if (xsrfCookie) {
    return decodeURIComponent(xsrfCookie);
  }

  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || "";
}

export default function ImportOrdersPage() {
  const { props } = usePage<{ sheets: Sheet[]; flash?: { success?: string; error?: string; errors?: Record<string, string | string[]> } }>();
  const sheets = props.sheets || [];
  const flash = props.flash;

  const [selectedSheet, setSelectedSheet] = useState<Sheet | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

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
    setSheetName("");
    setFile(null);
  };

  const handleImport = async () => {
    if (isImporting) return;

    if (!file) {
      toast.error("Upload a CSV or Excel file first.");
      return;
    }

    if (!selectedSheet) {
      toast.error("Select a merchant before importing.");
      return;
    }

    if (!sheetName.trim()) {
      toast.error("Enter the destination sheet name.");
      return;
    }

    const formData = new FormData();
    formData.append("country", selectedSheet.country);
    formData.append("merchant", selectedSheet.sheet_name);
    formData.append("sheet_id", selectedSheet.sheet_id);
    formData.append("sheet_name", sheetName.trim());
    formData.append("store_name", selectedSheet.store_name);
    formData.append("file", file);

    setIsImporting(true);

    try {
      const response = await fetch("/orders/import", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "X-CSRF-TOKEN": getCsrfToken(),
        },
        body: formData,
      });

      const data = await parseJsonResponse(response);

      if (!response.ok) {
        const message =
          data?.message ||
          Object.values(data?.errors || {})?.flat?.()[0] ||
          "Failed to import orders";
        throw new Error(typeof message === "string" ? message : "Failed to import orders");
      }

      toast.success(data?.message || "Orders imported successfully");
      clearForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to import orders");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Import Orders" />

      <div className="space-y-6 p-4 sm:p-6">
        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <Card className="overflow-hidden border-0 shadow-lg">
            <CardHeader className="border-b bg-slate-50/80">
              <CardTitle className="text-xl">Import Setup</CardTitle>
              <CardDescription>Set the merchant destination, review sheet metadata, and attach the file.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 p-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Merchant</label>
                  <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className="h-auto min-h-11 w-full justify-between gap-2 py-3 text-left font-normal"
                      >
                        <span className={cn("flex-1 whitespace-normal break-words", !selectedSheet && "text-muted-foreground")}>
                          {selectedSheet ? selectedSheet.sheet_name : "Select merchant"}
                        </span>
                        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[min(36rem,calc(100vw-2rem))] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search merchant, store, country, or sheet ID..." />
                        <CommandList>
                          <CommandGroup>
                            {sheets.length > 0 ? (
                              sheets.map((sheet) => (
                                <CommandItem
                                  key={sheet.id}
                                  value={[sheet.sheet_name, sheet.store_name, sheet.country, sheet.sheet_id].join(" ")}
                                  onSelect={() => {
                                    setSelectedSheet(sheet);
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
                                    <div className="whitespace-normal break-words font-medium">{sheet.sheet_name}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {sheet.store_name} · {sheet.country}
                                    </div>
                                  </div>
                                </CommandItem>
                              ))
                            ) : (
                              <div className="p-3 text-sm text-muted-foreground">No merchants found.</div>
                            )}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Destination Sheet Name</label>
                  <Input
                    value={sheetName}
                    onChange={(e) => setSheetName(e.target.value)}
                    placeholder="Enter the target sheet tab name"
                    className="h-11"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Country</label>
                  <Input value={selectedSheet?.country || ""} readOnly placeholder="Auto-filled from merchant" className="h-11 bg-slate-50" />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Sheet ID</label>
                  <Input value={selectedSheet?.sheet_id || ""} readOnly placeholder="Auto-filled from merchant" className="h-11 bg-slate-50" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Store Name</label>
                <Textarea
                  value={selectedSheet?.store_name || ""}
                  readOnly
                  placeholder="Auto-filled from merchant"
                  className="min-h-24 resize-none bg-slate-50"
                />
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-slate-700">Upload File</label>
                <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center transition hover:border-slate-400 hover:bg-slate-100">
                  <div className="rounded-full bg-slate-900 p-3 text-white">
                    <UploadCloud className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="font-medium text-slate-900">Choose CSV or Excel file</div>
                    <div className="text-sm text-slate-500">Accepted formats: `.csv`, `.xlsx`, `.xls`</div>
                  </div>
                  <Input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>

                <div className="rounded-xl border bg-white px-4 py-3 text-sm text-slate-600">
                  {file ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-900">{file.name}</div>
                        <div>{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                      </div>
                      <Badge variant="secondary">Ready</Badge>
                    </div>
                  ) : (
                    <span>No file selected yet.</span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={clearForm} disabled={isImporting}>
                  Clear
                </Button>
                <Button onClick={handleImport} disabled={isImporting} className="gap-2 text-white">
                  {isImporting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                  {isImporting ? "Importing..." : "Import Orders"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg">Import Checklist</CardTitle>
                <CardDescription>Use this before running the import.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-slate-600">
                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="font-medium text-slate-900">1. Confirm merchant mapping</div>
                  <p className="mt-1">Make sure the merchant selection matches the sheet ID and store name shown on the right.</p>
                </div>
                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="font-medium text-slate-900">2. Check the destination tab name</div>
                  <p className="mt-1">The sheet name field is manual. Use the exact target tab you want updated.</p>
                </div>
                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="font-medium text-slate-900">3. Upload the latest file only once</div>
                  <p className="mt-1">This importer updates matching orders and inserts new ones from the uploaded file.</p>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg">Selected Merchant</CardTitle>
                <CardDescription>Quick summary of the current import target.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl bg-slate-950 p-5 text-white">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Merchant</div>
                  <div className="mt-2 text-xl font-semibold">
                    {selectedSheet?.sheet_name || "No merchant selected"}
                  </div>
                  <div className="mt-4 grid gap-3 text-sm text-slate-300">
                    <div>
                      <div className="text-slate-500">Store Name</div>
                      <div>{selectedSheet?.store_name || "Waiting for selection"}</div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="text-slate-500">Country</div>
                        <div>{selectedSheet?.country || "Waiting for selection"}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Sheet ID</div>
                        <div className="break-all">{selectedSheet?.sheet_id || "Waiting for selection"}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  Imported rows are matched by order number, merchant, and sheet ID. Existing rows are updated; missing ones are created.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
