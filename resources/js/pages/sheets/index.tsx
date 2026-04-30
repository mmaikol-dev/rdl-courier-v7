'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EAST_AFRICAN_COUNTRIES } from '@/lib/east-african-countries';
import { ChevronLeft, ChevronRight, Edit, EyeIcon, Maximize2, Minimize2, Plus, Trash2, X } from 'lucide-react';
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
    access_token: string;
    country: string;
    cc_agents: string;
    sku: string;
}

interface PageProps {
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

export default function SheetsView() {
    const { sheets, auth, flash, ccUsers, filters } = usePage<PageProps>().props;

    const [filter, setFilter] = React.useState('');
    const [selectedCountry, setSelectedCountry] = React.useState(filters?.country || 'all');
    const [editingSheet, setEditingSheet] = React.useState<Sheet | null>(null);
    const [editValues, setEditValues] = React.useState<Partial<Sheet>>({});
    const [editCcAgents, setEditCcAgents] = React.useState<Record<string, string[]>>({});
    const [editKeyInput, setEditKeyInput] = React.useState('');
    const [deletingSheet, setDeletingSheet] = React.useState<Sheet | null>(null);
    const [creatingSheet, setCreatingSheet] = React.useState(false);
    const [createValues, setCreateValues] = React.useState<Partial<Sheet>>({});
    const [createCcAgents, setCreateCcAgents] = React.useState<Record<string, string[]>>({});
    const [createKeyInput, setCreateKeyInput] = React.useState('');
    const [viewDrawerOpen, setViewDrawerOpen] = React.useState(false);
    const [viewSheetId, setViewSheetId] = React.useState<string | null>(null);
    const [ccSelectOpen, setCcSelectOpen] = React.useState<string | null>(null);
    const [createCcSelectOpen, setCreateCcSelectOpen] = React.useState<string | null>(null);

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
            },
        );
    };

    const openSheetView = (sheetId: string) => {
        setViewSheetId(sheetId);
        setViewDrawerOpen(true);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Sheets" />

            <div className="flex flex-col gap-4 p-4">
                {/* Top Controls */}
                <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                    <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                        <Input
                            placeholder="Filter sheets by name, Shopify, or country"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className="flex-1"
                        />
                        <Select
                            value={selectedCountry}
                            onValueChange={(value) => {
                                setSelectedCountry(value);
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
                    {!['operations', 'finance', 'callcenter1', ''].includes(auth.user.roles) && (
                        <Button size="sm" onClick={() => setCreatingSheet(true)} className="flex items-center gap-1">
                            <Plus size={16} /> Create New Sheet
                        </Button>
                    )}
                </div>

                {/* Sheets Grid */}
                {filteredSheets.length === 0 ? (
                    <div className="py-20 text-center text-muted-foreground">No sheets available.</div>
                ) : (
                    <div className="grid auto-rows-min grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                        {filteredSheets.map((sheet) => (
                            <Card
                                key={sheet.id}
                                className="flex flex-col justify-between rounded-lg border p-2 shadow transition-all duration-150 hover:shadow-md"
                            >
                                <CardHeader>
                                    <CardDescription className="truncate text-xs text-muted-foreground" title={sheet.sheet_id}>
                                        Sheet ID: {sheet.sheet_id}
                                    </CardDescription>
                                    <CardTitle className="truncate text-sm" title={sheet.sheet_name}>
                                        {sheet.sheet_name}
                                    </CardTitle>
                                    <CardDescription className="truncate text-xs text-muted-foreground" title={sheet.store_name}>
                                        Store: {sheet.store_name || '-'}
                                    </CardDescription>
                                    <CardDescription className="truncate text-xs text-muted-foreground" title={sheet.shopify_name}>
                                        Shopify: {sheet.shopify_name}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-1 overflow-hidden text-xs">
                                    {[
                                        { label: 'Country', value: sheet.country },
                                        { label: 'CC Agents', value: sheet.cc_agents },
                                        { label: 'SKU', value: sheet.sku },
                                        { label: 'Access Token', value: sheet.access_token, isTruncate: true },
                                    ].map((item, index) => (
                                        <div key={`${sheet.id}-info-${index}`} className="truncate">
                                            <strong>{item.label}:</strong>{' '}
                                            {item.isTruncate ? (
                                                <span className="truncate" title={item.value}>
                                                    {item.value}
                                                </span>
                                            ) : (
                                                item.value || '-'
                                            )}
                                        </div>
                                    ))}
                                </CardContent>
                                <div className="flex flex-wrap justify-end gap-2 p-2">
                                    {!['operations', 'finance', 'callcenter1', ''].includes(auth.user.roles) && (
                                        <>
                                            <Button size="sm" variant="outline" onClick={() => handleEditOpen(sheet)}>
                                                <Edit size={16} />
                                            </Button>
                                            <Button size="sm" variant="destructive" onClick={() => setDeletingSheet(sheet)}>
                                                <Trash2 size={16} />
                                            </Button>
                                        </>
                                    )}
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => openSheetView(sheet.sheet_id)}
                                        className="flex items-center gap-1"
                                    >
                                        <EyeIcon size={16} />
                                        View Data
                                    </Button>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Create Sheet Modal */}
            <Dialog
                open={creatingSheet}
                onOpenChange={(open) => {
                    if (!open) {
                        setCreatingSheet(false);
                        setCreateCcAgents([]);
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
                            {['sheet_id', 'sheet_name', 'store_name', 'shopify_name', 'country', 'sku', 'access_token'].map((field) => (
                                <Input
                                    key={field}
                                    value={(createValues as any)[field] || ''}
                                    onChange={(e) => setCreateValues({ ...createValues, [field]: e.target.value })}
                                    placeholder={field.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                                />
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
                        <Button variant="outline" onClick={() => setCreatingSheet(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreateSave}>Create</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit Modal */}
            <Dialog
                open={!!editingSheet}
                onOpenChange={(open) => {
                    if (!open) {
                        setEditingSheet(null);
                        setEditCcAgents([]);
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
                            {['sheet_id', 'sheet_name', 'store_name', 'shopify_name', 'country', 'sku', 'access_token'].map((field) => (
                                <Input
                                    key={field}
                                    value={(editValues as any)[field] || ''}
                                    onChange={(e) => setEditValues({ ...editValues, [field]: e.target.value })}
                                    placeholder={field.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                                />
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
                        <Button variant="outline" onClick={() => setEditingSheet(null)}>
                            Cancel
                        </Button>
                        <Button onClick={handleEditSave}>Save</Button>
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
        </AppLayout>
    );
}
