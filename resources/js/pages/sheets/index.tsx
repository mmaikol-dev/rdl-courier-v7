'use client';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EAST_AFRICAN_COUNTRIES } from '@/lib/east-african-countries';
import { csrfHeaders } from '@/lib/csrf';
import { ChevronLeft, ChevronRight, Download, Edit, EyeIcon, Loader2, Maximize2, Minimize2, Plus, Search, Trash2, X } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/dashboard' },
    { title: 'Sheets', href: '/sheets' },
];

interface Sheet {
    id: number;
    sheet_id: string;
    sheet_name: string;
    store_name: string;
    shopify_name: string;
    country: string;
    cc_agents: string;
    sku: string;
}

/** Counts returned by POST /sheets/{id}/import-orders. */
interface ImportSummary {
    tab: string;
    scanned: number;
    eligible: number;
    queued: number;
    requeued: number;
    already_staged: number;
    remaining: number;
    truncated: boolean;
    skipped: {
        has_status: number;
        existing_order: number;
        duplicate_in_sheet: number;
        blank_order_no: number;
    };
    skipped_total: number;
    errors: { row: number; order_no: string | null; reason: string }[];
    errors_total: number;
    order_nos: string[];
}

interface ImportResult {
    success: boolean;
    message: string;
    summary?: ImportSummary;
}

interface PageProps extends Record<string, unknown> {
    sheets: Sheet[];
    ccUsers: string[];
    auth: { user: { roles: string } };
    filters?: { country?: string };
    flash?: { success?: string; error?: string };
}

interface SheetDataDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    sheetId: string;
}

function SheetDataDrawer({ open, onOpenChange, sheetId }: SheetDataDrawerProps) {
    const [sheetData, setSheetData] = React.useState<string[][]>([]);
    const [availableSheets, setAvailableSheets] = React.useState<string[]>([]);
    const [activeSheet, setActiveSheet] = React.useState<string>('');
    const [loading, setLoading] = React.useState(false);
    const [isFullScreen, setIsFullScreen] = React.useState(false);

    const fetchData = (sheetName?: string) => {
        setLoading(true);
        const url = sheetName ? `/sheets/${sheetId}/view?sheetName=${encodeURIComponent(sheetName)}` : `/sheets/${sheetId}/view`;
        fetch(url)
            .then((res) => res.json())
            .then((data) => {
                setSheetData(data.sheetData || []);
                setAvailableSheets(data.availableSheets || []);
                setActiveSheet(sheetName || data.availableSheets?.[0] || '');
                setLoading(false);
            })
            .catch(() => {
                setLoading(false);
                toast.error('Failed to load sheet data');
            });
    };

    React.useEffect(() => {
        if (!open) return;
        fetchData();
    }, [open, sheetId]);

    const handlePrev = () => {
        if (!availableSheets.length) return;
        const idx = availableSheets.indexOf(activeSheet);
        if (idx > 0) {
            fetchData(availableSheets[idx - 1]);
        }
    };

    const handleNext = () => {
        if (!availableSheets.length) return;
        const idx = availableSheets.indexOf(activeSheet);
        if (idx < availableSheets.length - 1) {
            fetchData(availableSheets[idx + 1]);
        }
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className={`w-full sm:max-w-full ${isFullScreen ? 'h-screen' : 'h-[95vh]'} flex flex-col p-0`}>
                {/* Header */}
                <div className="flex items-center justify-between border-b p-4">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="h-8 w-8">
                            <X className="h-4 w-4" />
                        </Button>
                        <div>
                            <SheetTitle className="text-lg">Sheet Data</SheetTitle>
                            <SheetDescription className="text-sm">Navigating: {activeSheet || 'Loading...'}</SheetDescription>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setIsFullScreen(!isFullScreen)} className="h-8">
                            {isFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>

                {/* Navigation Controls */}
                <div className="border-b bg-gray-50 p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handlePrev}
                                disabled={availableSheets.indexOf(activeSheet) <= 0}
                                className="h-8"
                            >
                                <ChevronLeft className="mr-1 h-4 w-4" />
                                Previous
                            </Button>

                            <Select value={activeSheet} onValueChange={(value) => fetchData(value)}>
                                <SelectTrigger className="h-8 w-[200px]">
                                    <SelectValue placeholder="Select sheet" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableSheets.map((name) => (
                                        <SelectItem key={name} value={name}>
                                            {name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleNext}
                                disabled={availableSheets.indexOf(activeSheet) >= availableSheets.length - 1}
                                className="h-8"
                            >
                                Next
                                <ChevronRight className="ml-1 h-4 w-4" />
                            </Button>
                        </div>

                        <div className="text-sm text-muted-foreground">
                            {availableSheets.length > 0 && (
                                <>
                                    Sheet {availableSheets.indexOf(activeSheet) + 1} of {availableSheets.length}
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Table Content - Flex container to fill remaining space */}
                <div className="flex-1 overflow-hidden">
                    {loading ? (
                        <div className="flex h-full items-center justify-center">
                            <div className="text-center">
                                <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900"></div>
                                <p className="text-muted-foreground">Loading sheet data...</p>
                            </div>
                        </div>
                    ) : sheetData.length === 0 ? (
                        <div className="flex h-full items-center justify-center">
                            <div className="text-center">
                                <p className="text-muted-foreground">No data found in this sheet.</p>
                                <Button variant="outline" size="sm" onClick={() => fetchData()} className="mt-2">
                                    Retry
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full overflow-auto p-2">
                            <div className="inline-block min-w-full align-middle">
                                <table className="min-w-full divide-y divide-gray-200 border">
                                    <thead className="sticky top-0 z-10 bg-gray-50">
                                        <tr>
                                            {sheetData[0].map((header, i) => (
                                                <th
                                                    key={i}
                                                    className="border px-3 py-2 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
                                                >
                                                    <div className="max-w-[200px] truncate" title={header}>
                                                        {header}
                                                    </div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 bg-white">
                                        {sheetData.slice(1).map((row, rowIndex) => (
                                            <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                                {row.map((cell, cellIndex) => (
                                                    <td key={cellIndex} className="border px-3 py-2 text-sm">
                                                        <div className="max-w-[200px] truncate" title={cell}>
                                                            {cell}
                                                        </div>
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <div className="mt-2 text-center text-xs text-muted-foreground">
                                    Showing {sheetData.length - 1} rows • {sheetData[0]?.length || 0} columns
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}

function parseCcAgentsMap(ccAgentsRaw: string | undefined): Record<string, string[]> {
    if (!ccAgentsRaw) return {};
    try {
        const parsed = JSON.parse(ccAgentsRaw);
        if (parsed && typeof parsed === 'object') {
            const entries = Object.entries(parsed).filter(([, value]) => Array.isArray(value));
            return Object.fromEntries(entries.map(([key, value]) => [key, value as string[]]));
        }
    } catch {
        // ignore
    }
    return {};
}

function ccAgentsSummary(ccAgentsRaw: string | undefined): string {
    const map = parseCcAgentsMap(ccAgentsRaw);
    const entries = Object.entries(map);

    if (!entries.length) return '-';

    const uniqueAgents = new Set(entries.flatMap(([, agents]) => agents.map((agent) => agent.trim()))).size;
    const tabLabel = `${entries.length} tab${entries.length === 1 ? '' : 's'}`;
    const agentLabel = `${uniqueAgents} agent${uniqueAgents === 1 ? '' : 's'}`;

    if (uniqueAgents === 0) return tabLabel;

    return `${tabLabel} · ${agentLabel}`;
}

function humanizeField(field: string): string {
    return field.replaceAll('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function buildCcAgentsJson(existingRaw: string | undefined, selections: Record<string, string[]>): string {
    const base: Record<string, string[]> = {};

    if (existingRaw) {
        try {
            const parsed = JSON.parse(existingRaw);
            if (parsed && typeof parsed === 'object') {
                Object.assign(base, parsed);
            }
        } catch {
            // ignore invalid JSON, will rebuild from scratch
        }
    }

    Object.entries(selections).forEach(([key, agents]) => {
        const name = key.trim();
        if (!name) return;
        base[name] = agents;
    });

    return JSON.stringify(base, null, 2);
}

interface ImportOrdersDialogProps {
    sheet: Sheet | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * Pulls new orders out of a merchant's Google Sheet on demand.
 *
 * Two rules are stated up front because they decide what the button actually
 * does: only rows with a blank status are taken, and only order numbers that do
 * not already exist are accepted. Everything left behind is counted and shown,
 * so a run that "imported nothing" is never ambiguous.
 */
function ImportOrdersDialog({ sheet, open, onOpenChange }: ImportOrdersDialogProps) {
    const [tabs, setTabs] = React.useState<string[]>([]);
    const [tab, setTab] = React.useState('');
    const [loadingTabs, setLoadingTabs] = React.useState(false);
    const [importing, setImporting] = React.useState(false);
    const [result, setResult] = React.useState<ImportResult | null>(null);

    // Pulled out of the object so the effect depends on values, not identity —
    // the dialog is handed a fresh Sheet reference on every parent render.
    const sheetId = sheet?.id;
    const registeredTab = sheet?.sheet_name;

    // Reset per sheet so a previous run's numbers are never attributed to a
    // different spreadsheet.
    React.useEffect(() => {
        if (!open || !sheetId || !registeredTab) return;

        setResult(null);
        setTab('');
        setTabs([]);
        setLoadingTabs(true);

        fetch(`/sheets/${sheetId}/tabs`)
            .then(async (res) => {
                const data = await res.json().catch(() => ({}));

                if (!res.ok || !data.success) {
                    throw new Error(data.message || 'Could not read the spreadsheet.');
                }

                return data.tabs as string[];
            })
            .then((list) => {
                setTabs(list);
                // Prefer the tab this sheet is registered against, so the common
                // case needs no interaction at all.
                setTab(list.includes(registeredTab) ? registeredTab : (list[0] ?? ''));
            })
            .catch((error: Error) => {
                // Non-fatal: the server falls back to the sheet's own tab name.
                setTab(registeredTab);
                toast.error(error.message);
            })
            .finally(() => setLoadingTabs(false));
    }, [open, sheetId, registeredTab]);

    const runImport = () => {
        if (!sheet || importing) return;

        setImporting(true);
        setResult(null);

        fetch(`/sheets/${sheet.id}/import-orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                ...csrfHeaders(),
            },
            body: JSON.stringify(tab ? { tab } : {}),
        })
            .then(async (res) => {
                const data = await res.json().catch(() => ({}));

                if (!res.ok || !data.success) {
                    throw new Error(data.message || 'The import could not be completed.');
                }

                return data as ImportResult;
            })
            .then((data) => {
                setResult(data);

                if (data.summary && data.summary.errors_total > 0) {
                    toast.warning(data.message);
                } else {
                    toast.success(data.message);
                }
            })
            .catch((error: Error) => {
                setResult({ success: false, message: error.message });
                toast.error(error.message);
            })
            .finally(() => setImporting(false));
    };

    const summary = result?.summary;

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!importing) onOpenChange(next);
            }}
        >
            <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Import Orders</DialogTitle>
                    <DialogDescription>
                        Pull new orders from the Google Sheet for{' '}
                        <span className="font-medium">{sheet?.sheet_name}</span>.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <ul className="space-y-1 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                        <li>• Only rows whose status is blank are imported.</li>
                        <li>• Order numbers that already exist are skipped, never duplicated.</li>
                        <li>• Rows are read from the top each run, so running it twice is safe.</li>
                    </ul>

                    <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-[200px] flex-1 space-y-1.5">
                            <Label htmlFor="import-tab">Sheet tab</Label>
                            {loadingTabs ? (
                                <div className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Reading spreadsheet…
                                </div>
                            ) : tabs.length > 0 ? (
                                <Select value={tab} onValueChange={setTab}>
                                    <SelectTrigger id="import-tab">
                                        <SelectValue placeholder="Select a tab" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {tabs.map((name) => (
                                            <SelectItem key={name} value={name}>
                                                {name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <Input
                                    id="import-tab"
                                    value={tab}
                                    onChange={(e) => setTab(e.target.value)}
                                    placeholder={sheet?.sheet_name ?? 'Sheet name'}
                                />
                            )}
                        </div>

                        <Button onClick={runImport} disabled={importing}>
                            {importing ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing…
                                </>
                            ) : (
                                <>
                                    <Download size={16} className="mr-2" /> Import orders
                                </>
                            )}
                        </Button>
                    </div>

                    {result && (
                        <div
                            className={`space-y-3 rounded-md border p-3 text-sm ${
                                result.success ? 'bg-green-50/50' : 'bg-destructive/10'
                            }`}
                        >
                            <p className={result.success ? 'text-green-700' : 'text-destructive'}>{result.message}</p>

                            {summary && (
                                <>
                                    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                                        {[
                                            { label: 'Rows read', value: summary.scanned },
                                            { label: 'Imported', value: summary.queued + summary.requeued },
                                            { label: 'Skipped', value: summary.skipped_total },
                                            { label: 'Needs fixing', value: summary.errors_total },
                                        ].map((stat) => (
                                            <div key={stat.label} className="rounded border bg-background p-2">
                                                <div className="text-muted-foreground">{stat.label}</div>
                                                <div className="text-lg font-semibold">{stat.value}</div>
                                            </div>
                                        ))}
                                    </div>

                                    {summary.skipped_total > 0 && (
                                        <ul className="space-y-0.5 text-xs text-muted-foreground">
                                            <li>• {summary.skipped.has_status} skipped — already have a status</li>
                                            <li>• {summary.skipped.existing_order} skipped — order number already exists</li>
                                            <li>• {summary.skipped.duplicate_in_sheet} skipped — repeated order number in the sheet</li>
                                            <li>• {summary.skipped.blank_order_no} skipped — no order number</li>
                                        </ul>
                                    )}

                                    {summary.errors.length > 0 && (
                                        <div className="space-y-1">
                                            <p className="text-xs font-medium">
                                                Rows that could not be imported:
                                            </p>
                                            <div className="max-h-40 overflow-y-auto rounded border bg-background">
                                                <table className="w-full text-left text-xs">
                                                    <thead className="sticky top-0 bg-muted">
                                                        <tr>
                                                            <th className="px-2 py-1">Row</th>
                                                            <th className="px-2 py-1">Order No</th>
                                                            <th className="px-2 py-1">Reason</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {summary.errors.map((error) => (
                                                            <tr key={`${error.row}-${error.order_no ?? ''}`} className="border-t">
                                                                <td className="px-2 py-1">{error.row}</td>
                                                                <td className="px-2 py-1">{error.order_no ?? '—'}</td>
                                                                <td className="px-2 py-1">{error.reason}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                            {summary.errors_total > summary.errors.length && (
                                                <p className="text-xs text-muted-foreground">
                                                    Showing {summary.errors.length} of {summary.errors_total}.
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {summary.order_nos.length > 0 && (
                                        <p className="break-all text-xs text-muted-foreground">
                                            Imported: {summary.order_nos.join(', ')}
                                            {summary.order_nos.length >= 50 ? ' …' : ''}
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default function SheetsView() {
    const { sheets, flash, ccUsers, filters } = usePage<PageProps>().props;

    const [filter, setFilter] = React.useState('');
    const [selectedCountry, setSelectedCountry] = React.useState(filters?.country || 'all');
    const [editingSheet, setEditingSheet] = React.useState<Sheet | null>(null);
    const [editValues, setEditValues] = React.useState<Partial<Sheet>>({});
    const [editCcAgents, setEditCcAgents] = React.useState<Record<string, string[]>>({});
    const [editKeyInput, setEditKeyInput] = React.useState('');
    const [isUpdating, setIsUpdating] = React.useState(false);
    const [deletingSheet, setDeletingSheet] = React.useState<Sheet | null>(null);
    const [creatingSheet, setCreatingSheet] = React.useState(false);
    const [createValues, setCreateValues] = React.useState<Partial<Sheet>>({});
    const [createCcAgents, setCreateCcAgents] = React.useState<Record<string, string[]>>({});
    const [createKeyInput, setCreateKeyInput] = React.useState('');
    const [viewDrawerOpen, setViewDrawerOpen] = React.useState(false);
    const [viewSheetId, setViewSheetId] = React.useState<string | null>(null);
    const [ccSelectOpen, setCcSelectOpen] = React.useState<string | null>(null);
    const [importSheet, setImportSheet] = React.useState<Sheet | null>(null);
    const [importOpen, setImportOpen] = React.useState(false);
    const [createCcSelectOpen, setCreateCcSelectOpen] = React.useState<string | null>(null);
    const [isCreating, setIsCreating] = React.useState(false);
    const [page, setPage] = React.useState(1);
    const PAGE_SIZE = 12;

    React.useEffect(() => {
        if (flash?.success) toast.success(flash.success);
        if (flash?.error) toast.error(flash.error);
    }, [flash?.success, flash?.error]);

    const filteredSheets = React.useMemo(() => {
        if (!sheets) return [];
        return sheets.filter(
            (sheet) =>
                ((sheet.sheet_name?.toLowerCase() || '').includes(filter.toLowerCase()) ||
                    (sheet.shopify_name?.toLowerCase() || '').includes(filter.toLowerCase()) ||
                    (sheet.country?.toLowerCase() || '').includes(filter.toLowerCase())) &&
                (selectedCountry === 'all' || (sheet.country || '').toLowerCase() === selectedCountry.toLowerCase()),
        );
    }, [sheets, filter, selectedCountry]);

    const pageCount = Math.max(1, Math.ceil(filteredSheets.length / PAGE_SIZE));
    const safePage = Math.min(page, pageCount);
    const visibleSheets = filteredSheets.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
    const rangeStart = filteredSheets.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
    const rangeEnd = Math.min(safePage * PAGE_SIZE, filteredSheets.length);

    const clearFilters = () => {
        setFilter('');
        setSelectedCountry('all');
        setPage(1);
        router.get('/sheets', {}, { preserveState: true, preserveScroll: true, replace: true });
    };

    const toggleEditCcAgent = (key: string, agent: string) => {
        setEditCcAgents((current) => {
            const list = current[key] ?? [];
            const next = list.includes(agent) ? list.filter((item) => item !== agent) : [...list, agent];
            return { ...current, [key]: next };
        });
    };

    const toggleCreateCcAgent = (key: string, agent: string) => {
        setCreateCcAgents((current) => {
            const list = current[key] ?? [];
            const next = list.includes(agent) ? list.filter((item) => item !== agent) : [...list, agent];
            return { ...current, [key]: next };
        });
    };

    const removeEditCcAgent = (key: string, agent: string) => {
        setEditCcAgents((current) => {
            const list = current[key] ?? [];
            return { ...current, [key]: list.filter((item) => item !== agent) };
        });
    };

    const removeCreateCcAgent = (key: string, agent: string) => {
        setCreateCcAgents((current) => {
            const list = current[key] ?? [];
            return { ...current, [key]: list.filter((item) => item !== agent) };
        });
    };

    const addEditCcKey = () => {
        const key = editKeyInput.trim();
        if (!key) return;
        setEditCcAgents((current) => (key in current ? current : { ...current, [key]: [] }));
        setEditKeyInput('');
    };

    const addCreateCcKey = () => {
        const key = createKeyInput.trim();
        if (!key) return;
        setCreateCcAgents((current) => (key in current ? current : { ...current, [key]: [] }));
        setCreateKeyInput('');
    };

    const removeEditCcKey = (key: string) => {
        setEditCcAgents((current) => {
            const next = { ...current };
            delete next[key];
            return next;
        });
    };

    const removeCreateCcKey = (key: string) => {
        setCreateCcAgents((current) => {
            const next = { ...current };
            delete next[key];
            return next;
        });
    };

    const handleEditOpen = (sheet: Sheet) => {
        setEditingSheet(sheet);
        setEditValues(sheet);
        setEditCcAgents(parseCcAgentsMap(sheet.cc_agents));
        setEditKeyInput('');
    };

    const handleEditSave = () => {
        if (!editingSheet) return;
        setIsUpdating(true);
        const ccAgentsPayload = buildCcAgentsJson(editValues.cc_agents as string | undefined, editCcAgents);
        router.put(
            `/sheets/${editingSheet.id}`,
            {
                ...editValues,
                cc_agents: ccAgentsPayload,
            },
            {
                onSuccess: () => {
                    toast.success('Sheet updated successfully');
                    setEditingSheet(null);
                    setEditCcAgents({});
                    setEditKeyInput('');
                },
                onError: () => {
                    toast.error('Failed to update sheet');
                },
                onFinish: () => {
                    setIsUpdating(false);
                },
            },
        );
    };

    const handleDelete = () => {
        if (!deletingSheet) return;
        router.delete(`/sheets/${deletingSheet.id}`, {
            onSuccess: () => {
                toast.success('Sheet deleted successfully');
                setDeletingSheet(null);
            },
            onError: () => {
                toast.error('Failed to delete sheet');
            },
        });
    };

    const handleCreateSave = () => {
        setIsCreating(true);
        const ccAgentsPayload = buildCcAgentsJson(createValues.cc_agents as string | undefined, createCcAgents);
        router.post(
            `/sheets`,
            {
                ...createValues,
                cc_agents: ccAgentsPayload,
            },
            {
                onSuccess: () => {
                    toast.success('Sheet created successfully');
                    setCreatingSheet(false);
                    setCreateValues({});
                    setCreateCcAgents({});
                    setCreateKeyInput('');
                },
                onError: () => {
                    toast.error('Failed to create sheet');
                },
                onFinish: () => {
                    setIsCreating(false);
                },
            },
        );
    };

    const openSheetView = (sheetId: string) => {
        setViewSheetId(sheetId);
        setViewDrawerOpen(true);
    };

    const openImport = (sheet: Sheet) => {
        setImportSheet(sheet);
        setImportOpen(true);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Sheets" />

            <div className="flex flex-col gap-4 p-4">
                {/* Top Controls */}
                <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                    <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                        <div className="relative flex-1">
                            <Search className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Filter by name, Shopify, or country"
                                value={filter}
                                onChange={(e) => {
                                    setFilter(e.target.value);
                                    setPage(1);
                                }}
                                className="pl-8"
                            />
                            {filter && (
                                <button
                                    type="button"
                                    aria-label="Clear search"
                                    onClick={() => {
                                        setFilter('');
                                        setPage(1);
                                    }}
                                    className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                        <Select
                            value={selectedCountry}
                            onValueChange={(value) => {
                                setSelectedCountry(value);
                                setPage(1);
                                router.get('/sheets', value === 'all' ? {} : { country: value }, {
                                    preserveState: true,
                                    preserveScroll: true,
                                    replace: true,
                                });
                            }}
                        >
                            <SelectTrigger className="sm:w-[220px]">
                                <SelectValue placeholder="Filter by country" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All countries</SelectItem>
                                {EAST_AFRICAN_COUNTRIES.map((country) => (
                                    <SelectItem key={country} value={country}>
                                        {country}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button size="sm" onClick={() => setCreatingSheet(true)} className="flex items-center gap-1">
                        <Plus size={16} /> Create New Sheet
                    </Button>
                </div>

                {/* Sheets Grid */}
                {filteredSheets.length === 0 ? (
                    <div className="rounded-xl border border-dashed py-20 text-center">
                        <p className="text-muted-foreground">
                            {sheets?.length ? 'No sheets match your filters.' : 'No sheets available.'}
                        </p>
                        {(filter || selectedCountry !== 'all') && (
                            <Button variant="outline" size="sm" onClick={clearFilters} className="mt-3">
                                Clear filters
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="grid auto-rows-min grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                        {visibleSheets.map((sheet) => (
                            <Card
                                key={sheet.id}
                                className="flex flex-col justify-between gap-3 rounded-lg border p-4 shadow-sm transition-shadow hover:shadow-md"
                            >
                                <CardHeader className="gap-2 px-0 pt-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <Badge variant="secondary" className="text-[11px]">
                                            {sheet.country || '—'}
                                        </Badge>
                                        <span className="truncate text-xs text-muted-foreground" title={sheet.store_name}>
                                            Store: {sheet.store_name || '-'}
                                        </span>
                                    </div>
                                    <CardTitle className="truncate text-sm" title={sheet.sheet_name}>
                                        {sheet.sheet_name}
                                    </CardTitle>
                                    <CardDescription className="truncate text-xs" title={sheet.shopify_name}>
                                        Shopify: {sheet.shopify_name || '-'}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-1.5 px-0 pb-0 text-xs text-muted-foreground">
                                    <div className="truncate" title={sheet.sheet_id}>
                                        <span className="font-mono text-[11px]">{sheet.sheet_id}</span>
                                    </div>
                                    <div className="truncate">
                                        <strong className="font-medium text-foreground">CC:</strong> {ccAgentsSummary(sheet.cc_agents)}
                                    </div>
                                    <div className="truncate">
                                        <strong className="font-medium text-foreground">SKU:</strong> {sheet.sku || '-'}
                                    </div>
                                </CardContent>
                                <CardFooter className="grid grid-cols-[1fr_auto] gap-2 px-0">
                                    <Button size="sm" onClick={() => openImport(sheet)} className="flex items-center gap-1">
                                        <Download size={16} />
                                        Import Orders
                                    </Button>
                                    <div className="flex items-center gap-1">
                                        <Button size="sm" variant="outline" aria-label="View sheet data" onClick={() => openSheetView(sheet.sheet_id)}>
                                            <EyeIcon size={16} />
                                        </Button>
                                        <Button size="sm" variant="outline" aria-label="Edit sheet" onClick={() => handleEditOpen(sheet)}>
                                            <Edit size={16} />
                                        </Button>
                                        <Button size="sm" variant="outline" aria-label="Delete sheet" onClick={() => setDeletingSheet(sheet)}>
                                            <Trash2 size={16} />
                                        </Button>
                                    </div>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                )}

                {/* Pagination */}
                {filteredSheets.length > PAGE_SIZE && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-sm text-muted-foreground">
                        <span>
                            Showing <strong className="font-medium text-foreground">{rangeStart}</strong>–
                            <strong className="font-medium text-foreground">{rangeEnd}</strong> of{' '}
                            <strong className="font-medium text-foreground">{filteredSheets.length}</strong>
                        </span>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={safePage <= 1}
                                onClick={() => setPage(safePage - 1)}
                                className="flex items-center gap-1"
                            >
                                <ChevronLeft className="h-4 w-4" /> Previous
                            </Button>
                            <span>
                                Page <strong className="font-medium text-foreground">{safePage}</strong> of {pageCount}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={safePage >= pageCount}
                                onClick={() => setPage(safePage + 1)}
                                className="flex items-center gap-1"
                            >
                                Next <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Create Sheet Modal */}
            <Dialog
                open={creatingSheet}
                onOpenChange={(open) => {
                    if (!open) {
                        setCreatingSheet(false);
                        setCreateCcAgents({});
                    }
                }}
            >
                <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Create New Sheet</DialogTitle>
                        <DialogDescription>Fill in the details for the new sheet below.</DialogDescription>
                    </DialogHeader>
                    <div className="mt-2 space-y-3">
                        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                            {(['sheet_id', 'sheet_name', 'store_name', 'shopify_name', 'country', 'sku'] as const).map((field) => (
                                <div key={field} className="space-y-1.5">
                                    <Label htmlFor={`create-${field}`}>{humanizeField(field)}</Label>
                                    <Input
                                        id={`create-${field}`}
                                        value={createValues[field] ?? ''}
                                        onChange={(e) => setCreateValues({ ...createValues, [field]: e.target.value })}
                                        placeholder={humanizeField(field)}
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="space-y-3">
                            <label className="text-sm font-medium">Sheet Tabs → Agents</label>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <Input placeholder="Add sheet tab name" value={createKeyInput} onChange={(e) => setCreateKeyInput(e.target.value)} />
                                <Button type="button" onClick={addCreateCcKey}>
                                    Add Tab
                                </Button>
                            </div>

                            {Object.keys(createCcAgents).length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                    Add a sheet tab name, then choose the call center agents for that tab.
                                </p>
                            ) : (
                                <div className="space-y-3">
                                    {Object.entries(createCcAgents).map(([key, agents]) => (
                                        <div key={key} className="rounded-md border p-3">
                                            <div className="flex items-center justify-between">
                                                <div className="font-medium">{key}</div>
                                                <Button variant="ghost" size="sm" onClick={() => removeCreateCcKey(key)}>
                                                    Remove
                                                </Button>
                                            </div>

                                            {agents.length > 0 && (
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {agents.map((agent) => (
                                                        <Badge key={agent} variant="secondary" className="pr-1 pl-2">
                                                            {agent}
                                                            <button
                                                                onClick={() => removeCreateCcAgent(key, agent)}
                                                                className="ml-1 rounded-full p-0.5 hover:bg-muted"
                                                            >
                                                                <X className="h-3 w-3" />
                                                            </button>
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}

                                            <Popover
                                                open={createCcSelectOpen === key}
                                                onOpenChange={(open) => setCreateCcSelectOpen(open ? key : null)}
                                            >
                                                <PopoverTrigger asChild>
                                                    <Button variant="outline" role="combobox" className="mt-3 w-full justify-between">
                                                        {agents.length === 0 ? 'Select call center agents' : `${agents.length} agent(s) selected`}
                                                        <ChevronRight className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-[360px] p-0">
                                                    <Command>
                                                        <CommandInput placeholder="Search agent..." />
                                                        <CommandList>
                                                            <CommandEmpty>No agent found.</CommandEmpty>
                                                            <CommandGroup>
                                                                {ccUsers.map((cc, idx) => (
                                                                    <CommandItem key={idx} value={cc} onSelect={() => toggleCreateCcAgent(key, cc)}>
                                                                        <div className="flex w-full items-center">
                                                                            <Checkbox checked={agents.includes(cc)} className="mr-2" />
                                                                            {cc}
                                                                        </div>
                                                                    </CommandItem>
                                                                ))}
                                                            </CommandGroup>
                                                        </CommandList>
                                                    </Command>
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <p className="text-xs text-muted-foreground">This will be saved as JSON with each tab name as the key.</p>
                        </div>
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setCreatingSheet(false)} disabled={isCreating}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreateSave} disabled={isCreating}>
                            {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isCreating ? 'Creating...' : 'Create'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit Modal */}
            <Dialog
                open={!!editingSheet}
                onOpenChange={(open) => {
                    if (!open) {
                        setEditingSheet(null);
                        setEditCcAgents({});
                        setIsUpdating(false);
                    }
                }}
            >
                <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Edit Sheet</DialogTitle>
                        <DialogDescription>Update the sheet information below.</DialogDescription>
                    </DialogHeader>
                    <div className="mt-2 space-y-3">
                        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                            {(['sheet_id', 'sheet_name', 'store_name', 'shopify_name', 'country', 'sku'] as const).map((field) => (
                                <div key={field} className="space-y-1.5">
                                    <Label htmlFor={`edit-${field}`}>{humanizeField(field)}</Label>
                                    <Input
                                        id={`edit-${field}`}
                                        value={editValues[field] ?? ''}
                                        onChange={(e) => setEditValues({ ...editValues, [field]: e.target.value })}
                                        placeholder={humanizeField(field)}
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="space-y-3">
                            <label className="text-sm font-medium">Sheet Tabs → Agents</label>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <Input placeholder="Add sheet tab name" value={editKeyInput} onChange={(e) => setEditKeyInput(e.target.value)} />
                                <Button type="button" onClick={addEditCcKey}>
                                    Add Tab
                                </Button>
                            </div>

                            {Object.keys(editCcAgents).length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                    Add a sheet tab name, then choose the call center agents for that tab.
                                </p>
                            ) : (
                                <div className="space-y-3">
                                    {Object.entries(editCcAgents).map(([key, agents]) => (
                                        <div key={key} className="rounded-md border p-3">
                                            <div className="flex items-center justify-between">
                                                <div className="font-medium">{key}</div>
                                                <Button variant="ghost" size="sm" onClick={() => removeEditCcKey(key)}>
                                                    Remove
                                                </Button>
                                            </div>

                                            {agents.length > 0 && (
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {agents.map((agent) => (
                                                        <Badge key={agent} variant="secondary" className="pr-1 pl-2">
                                                            {agent}
                                                            <button
                                                                onClick={() => removeEditCcAgent(key, agent)}
                                                                className="ml-1 rounded-full p-0.5 hover:bg-muted"
                                                            >
                                                                <X className="h-3 w-3" />
                                                            </button>
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}

                                            <Popover open={ccSelectOpen === key} onOpenChange={(open) => setCcSelectOpen(open ? key : null)}>
                                                <PopoverTrigger asChild>
                                                    <Button variant="outline" role="combobox" className="mt-3 w-full justify-between">
                                                        {agents.length === 0 ? 'Select call center agents' : `${agents.length} agent(s) selected`}
                                                        <ChevronRight className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-[360px] p-0">
                                                    <Command>
                                                        <CommandInput placeholder="Search agent..." />
                                                        <CommandList>
                                                            <CommandEmpty>No agent found.</CommandEmpty>
                                                            <CommandGroup>
                                                                {ccUsers.map((cc, idx) => (
                                                                    <CommandItem key={idx} value={cc} onSelect={() => toggleEditCcAgent(key, cc)}>
                                                                        <div className="flex w-full items-center">
                                                                            <Checkbox checked={agents.includes(cc)} className="mr-2" />
                                                                            {cc}
                                                                        </div>
                                                                    </CommandItem>
                                                                ))}
                                                            </CommandGroup>
                                                        </CommandList>
                                                    </Command>
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <p className="text-xs text-muted-foreground">These agents will be used for round-robin assignment for each tab.</p>
                        </div>
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setEditingSheet(null)} disabled={isUpdating}>
                            Cancel
                        </Button>
                        <Button onClick={handleEditSave} disabled={isUpdating}>
                            {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isUpdating ? 'Saving...' : 'Save'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <Dialog open={!!deletingSheet} onOpenChange={(open) => !open && setDeletingSheet(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Confirm Delete</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete <strong>{deletingSheet?.sheet_name}</strong>?
                        </DialogDescription>
                    </DialogHeader>
                    <div className="mt-4 flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setDeletingSheet(null)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleDelete}>
                            Delete
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* View Sheet Data Drawer */}
            {viewSheetId && <SheetDataDrawer open={viewDrawerOpen} onOpenChange={setViewDrawerOpen} sheetId={viewSheetId} />}

            {/* Pull new orders from the sheet's Google Sheet */}
            <ImportOrdersDialog sheet={importSheet} open={importOpen} onOpenChange={setImportOpen} />
        </AppLayout>
    );
}
