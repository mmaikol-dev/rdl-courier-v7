'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { format } from 'date-fns';
import {
    Calendar1Icon,
    Check,
    ChevronsUpDown,
    CopyIcon,
    EyeIcon,
    FilterIcon,
    Loader2,
    MessageCircleMoreIcon,
    MicIcon,
    MicOffIcon,
    PhoneIcon,
    PlusIcon,
    RefreshCwIcon,
    Trash2Icon,
} from 'lucide-react';
import * as React from 'react';
import { type DateRange } from 'react-day-picker';

import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import VoicePanel from '@/components/voice/voice-panel';
import { EAST_AFRICAN_COUNTRIES } from '@/lib/east-african-countries';
import { toast } from 'sonner';

// ✅ Move constants outside component to prevent recreation
const COLUMNS = [
    'cc_email',
    'order_no',
    'client_name',
    'quantity',
    'amount',
    'product_name',
    'address',
    'phone',
    'alt_no',
    'status',
    'delivery_date',
    'instructions',
    'code',
    'merchant',
] as const;

const STATUS_OPTIONS = [
    'Scheduled',
    'Dispatched',
    'Followup',
    'Duplicate',
    'Cancelled',
    'Pending',
    'Expired',
    'Returned',
    'WrongContact',
    'Delivered',
    'New Orders',
] as const;

const statusColors: Record<string, string> = {
    Scheduled: 'text-blue-600 font-semibold',
    Dispatched: 'text-indigo-600 font-semibold',
    Followup: 'text-purple-600 font-semibold',
    Duplicate: 'text-pink-600 font-semibold',
    Cancelled: 'text-red-600 font-semibold',
    Pending: 'text-yellow-600 font-semibold',
    Expired: 'text-orange-600 font-semibold',
    Returned: 'text-rose-600 font-semibold',
    WrongContact: 'text-gray-600 italic',
    Delivered: 'text-green-600 font-semibold',
    'New Orders': 'text-teal-600 font-semibold',
};

const BREADCRUMBS: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/dashboard' },
    { title: 'Sheet Orders', href: '/sheetorders' },
];

// ✅ Memoize filtered columns to prevent recreation
const FILTERED_COLUMNS = COLUMNS.filter((col) => !['quantity', 'amount', 'instructions'].includes(col));
const FILTER_FIELDS = [...FILTERED_COLUMNS, 'country'] as const;

const normalizeMultiSelectFilter = (value: string | string[] | undefined): string[] => {
    if (Array.isArray(value)) {
        return value.filter((item) => item.trim() !== '');
    }

    if (typeof value === 'string') {
        return value
            .split(',')
            .map((item) => item.trim())
            .filter((item) => item !== '');
    }

    return [];
};

interface SheetOrder {
    id: number;
    order_no: string;
    order_date: string;
    amount: number;
    quantity: number;
    item: string;
    delivery_date: string;
    client_name: string;
    address: string;
    product_name: string;
    city: string;
    country: string;
    phone: string;
    agent: string;
    store_name: string;
    status: string;
    code: string;
    order_type: string;
    alt_no: string;
    merchant: string;
    cc_email: string;
    instructions: string;
    invoice_code: string;
    sheet_id: string;
    sheet_name: string;
    updated_at: string;
}

interface OrderHistory {
    id: number;
    attribute: string;
    old_value: string;
    new_value: string;
    created_at: string;
    user: { name: string } | null;
}

interface PaginationLinkData {
    url: string | null;
    label: string;
    active: boolean;
}

// ✅ Optimized TableRow with better memoization
const TableRowMemo = React.memo(
    ({
        order,
        highlighted,
        onEdit,
        onHistory,
        onWhatsapp,
        canDelete,
        onDelete,
        loadingCells,
    }: {
        order: SheetOrder;
        highlighted: Record<string, boolean>;
        onEdit: (order: SheetOrder, field: keyof SheetOrder) => void;
        onHistory: (orderId: number, orderNo: string) => void;
        onWhatsapp: (orderId: number) => void;
        canDelete: boolean;
        onDelete: (order: SheetOrder) => void;
        loadingCells: Record<string, boolean>;
    }) => {
        const isCopyLoading = loadingCells[`copy-${order.id}`];
        const isHistoryLoading = loadingCells[`history-${order.id}`];
        const isWhatsappLoading = loadingCells[`whatsapp-${order.id}`];
        const isDeleteLoading = loadingCells[`delete-${order.id}`];

        return (
            <TableRow className="hover:bg-muted/10">
                {COLUMNS.map((col) => {
                    const key = `${order.id}-${col}`;

                    // ✅ Display "New Orders" if status is null/empty
                    const value =
                        col === 'status'
                            ? order.status && order.status.trim() !== ''
                                ? order.status
                                : 'New Orders'
                            : col === 'delivery_date' && order.delivery_date
                              ? format(new Date(order.delivery_date), 'yyyy-MM-dd')
                              : String(order[col as keyof SheetOrder] || '');
                    const canCopyFromColumn = (col === 'phone' || col === 'alt_no') && value.trim() !== '';

                    // ✅ Apply green color to all columns if the row has a code value
                    const hasCode = order.code && order.code.trim() !== '';

                    const colorClass = col === 'status' ? statusColors[value] || '' : hasCode ? 'text-green-600 font-semibold' : '';

                    return (
                        <TableCell
                            key={col}
                            className={`max-w-[130px] min-w-[130px] cursor-pointer truncate ${highlighted[key] ? 'bg-green-200' : ''} ${colorClass}`}
                            onClick={() => onEdit(order, col)}
                            title={value}
                        >
                            {canCopyFromColumn ? (
                                <div className="flex items-center justify-between gap-1">
                                    <span className="truncate">{value}</span>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className="h-5 w-5 shrink-0"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            navigator.clipboard
                                                .writeText(value)
                                                .then(() => {
                                                    toast.success('Copied');
                                                })
                                                .catch((err) => {
                                                    console.error('Failed to copy phone number', err);
                                                    toast.error('Failed to copy');
                                                });
                                        }}
                                        title={`Copy ${col === 'phone' ? 'phone' : 'alt phone'}`}
                                    >
                                        <CopyIcon className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            ) : (
                                value
                            )}
                        </TableCell>
                    );
                })}

                <TableCell className="sticky right-0 z-10 flex justify-end space-x-1 bg-background text-right">
                    {/* Copy Row */}
                    <Button
                        className="flex h-5 w-5 items-center justify-center p-0"
                        variant="ghost"
                        disabled={isCopyLoading}
                        onClick={() => {
                            if (isCopyLoading) return;
                            // Trigger loading via onWhatsapp won't work here, so we handle inline
                            // We use a quick local approach: call onWhatsapp pattern won't fit, so we inline copy with a brief flash
                            const rowData = COLUMNS.map((col) => order[col] ?? '').join('\t');
                            navigator.clipboard
                                .writeText(rowData)
                                .then(() => {
                                    toast.success('Row copied');
                                })
                                .catch((err) => {
                                    console.error('Failed to copy row', err);
                                    toast.error('Failed to copy row');
                                });
                        }}
                        title="Copy Row"
                    >
                        {isCopyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CopyIcon className="h-4 w-4" />}
                    </Button>

                    {/* View History */}
                    <Button
                        className="flex h-5 w-5 items-center justify-center p-0"
                        variant="ghost"
                        disabled={isHistoryLoading}
                        onClick={() => onHistory(order.id, order.order_no)}
                        title="View History"
                    >
                        {isHistoryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <EyeIcon className="h-4 w-4" />}
                    </Button>

                    {/* Send WhatsApp */}
                    <Button
                        className="flex h-5 w-5 items-center justify-center p-0"
                        variant="ghost"
                        disabled={isWhatsappLoading}
                        onClick={() => onWhatsapp(order.id)}
                        title="Send WhatsApp"
                    >
                        {isWhatsappLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircleMoreIcon className="h-4 w-4" />}
                    </Button>

                    {/* Delete */}
                    {canDelete && (
                        <Button
                            className="flex h-5 w-5 items-center justify-center p-0"
                            variant="ghost"
                            disabled={isDeleteLoading}
                            onClick={() => onDelete(order)}
                        >
                            {isDeleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2Icon className="h-4 w-4" />}
                        </Button>
                    )}
                </TableCell>
            </TableRow>
        );
    },
    // ✅ Custom comparison for better memoization
    (prevProps, nextProps) => {
        const prevOrder = prevProps.order;
        const nextOrder = nextProps.order;

        return (
            prevOrder.id === nextOrder.id &&
            prevOrder.updated_at === nextOrder.updated_at &&
            JSON.stringify(prevProps.highlighted) === JSON.stringify(nextProps.highlighted) &&
            prevProps.canDelete === nextProps.canDelete &&
            JSON.stringify(prevProps.loadingCells) === JSON.stringify(nextProps.loadingCells)
        );
    },
);

// Helper function to get current date and time in the desired format
const getCurrentDateTimePrefix = () => {
    const now = new Date();
    const day = now.getDate();
    const month = now.getMonth() + 1;
    const hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    const hour12 = hours % 12 || 12;

    return `${day}/${month} ${hour12}:${minutes}${ampm} - `;
};

export default function Index() {
    const { props } = usePage();
    const authUser = (props as { auth?: { user?: { roles?: string } } }).auth?.user;

    const {
        orders,
        merchantUsers,
        totalOrders,
        ccUsers,
        merchantData,
        filters: initialFilters,
    } = props as unknown as {
        orders: { data: SheetOrder[]; links: PaginationLinkData[] };
        merchantUsers: string[];
        totalOrders: number;
        ccUsers: string[];
        merchantData: Record<string, { sheet_id: string; sheet_names: string[] }>;
        filters?: Record<string, string | string[]>;
    };

    // ✅ Optimized state management
    const [filters, setFilters] = React.useState<Record<string, string | string[]>>(initialFilters || {});
    const [dateRange, setDateRange] = React.useState<DateRange | undefined>(() =>
        initialFilters?.from_date && initialFilters?.to_date
            ? { from: new Date(String(initialFilters.from_date)), to: new Date(String(initialFilters.to_date)) }
            : undefined,
    );
    const [editing, setEditing] = React.useState<{ order: SheetOrder; field: keyof SheetOrder } | null>(null);
    const [editValue, setEditValue] = React.useState('');
    const [highlighted, setHighlighted] = React.useState<Record<string, boolean>>({});
    const [filterDialogOpen, setFilterDialogOpen] = React.useState(false);
    const [historyModalOpen, setHistoryModalOpen] = React.useState(false);
    const [createModalOpen, setCreateModalOpen] = React.useState(false);
    const [createMerchantOpen, setCreateMerchantOpen] = React.useState(false);
    const [newOrder, setNewOrder] = React.useState<Partial<SheetOrder>>({});
    const [selectedHistories, setSelectedHistories] = React.useState<OrderHistory[]>([]);
    const [selectedOrderNo, setSelectedOrderNo] = React.useState<string | null>(null);
    const [whatsappAlert, setWhatsappAlert] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [deletingOrder, setDeletingOrder] = React.useState<SheetOrder | null>(null);
    const [isCallSheetOpen, setIsCallSheetOpen] = React.useState(false);
    const voiceDialNumber = '';

    // ✅ Centralized loading states
    // Per-row action loaders keyed as "action-orderId", e.g. "history-42"
    const [loadingCells, setLoadingCells] = React.useState<Record<string, boolean>>({});
    // Top-level button loaders
    const [isFiltering, setIsFiltering] = React.useState(false);
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [isCreating, setIsCreating] = React.useState(false);
    const [isDeleting, setIsDeleting] = React.useState(false);
    const [isSaving, setIsSaving] = React.useState(false);

    // Voice-to-text states
    const [isListening, setIsListening] = React.useState(false);
    const [speechRecognition, setSpeechRecognition] = React.useState<any>(null);
    const [isSpeechSupported, setIsSpeechSupported] = React.useState(false);
    const [transcript, setTranscript] = React.useState('');
    const [interimTranscript, setInterimTranscript] = React.useState('');
    const [speechError, setSpeechError] = React.useState<string | null>(null);

    // Helper to toggle a single loading cell
    const setLoadingCell = React.useCallback((key: string, val: boolean) => {
        setLoadingCells((prev) => {
            if (val) return { ...prev, [key]: true };
            const next = { ...prev };
            delete next[key];
            return next;
        });
    }, []);

    // Initialize speech recognition
    React.useEffect(() => {
        if (typeof window !== 'undefined') {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (SpeechRecognition) {
                setIsSpeechSupported(true);
                const recognition = new SpeechRecognition();
                recognition.continuous = true;
                recognition.interimResults = true;
                recognition.lang = 'en-US';

                recognition.onresult = (event: any) => {
                    let finalTranscript = '';
                    let interim = '';

                    for (let i = event.resultIndex; i < event.results.length; i++) {
                        const transcript = event.results[i][0].transcript;
                        if (event.results[i].isFinal) {
                            finalTranscript += transcript;
                        } else {
                            interim += transcript;
                        }
                    }

                    if (finalTranscript) {
                        setTranscript((prev) => prev + ' ' + finalTranscript);
                        if (editing?.field === 'instructions') {
                            setEditValue((prev) => prev + ' ' + finalTranscript);
                        }
                        if (createModalOpen && newOrder.instructions !== undefined) {
                            setNewOrder((prev) => ({
                                ...prev,
                                instructions: (prev.instructions || '') + ' ' + finalTranscript,
                            }));
                        }
                    }

                    setInterimTranscript(interim);
                };

                recognition.onerror = (event: any) => {
                    console.error('Speech recognition error:', event.error);
                    setSpeechError(event.error);
                    setIsListening(false);
                };

                recognition.onend = () => {
                    setIsListening(false);
                    setInterimTranscript('');
                };

                setSpeechRecognition(recognition);
            }
        }
    }, [editing, createModalOpen]);

    // Effect to auto-populate date/time when instructions modal opens
    React.useEffect(() => {
        if (editing?.field === 'instructions') {
            const currentInstructions = editing.order.instructions || '';
            const dateTimePrefix = getCurrentDateTimePrefix();

            if (!currentInstructions.trim() || !currentInstructions.includes(dateTimePrefix.slice(0, -3))) {
                const separator = currentInstructions.trim() ? '\n\n' : '';
                setEditValue(currentInstructions + separator + dateTimePrefix);
            } else {
                setEditValue(currentInstructions);
            }
        }
    }, [editing]);

    const toggleListening = () => {
        if (!speechRecognition || !isSpeechSupported) return;

        if (isListening) {
            speechRecognition.stop();
            setIsListening(false);
            setInterimTranscript('');
        } else {
            try {
                speechRecognition.start();
                setIsListening(true);
                setSpeechError(null);
                setInterimTranscript('');
            } catch (error) {
                console.error('Failed to start speech recognition:', error);
                setSpeechError('Failed to start listening');
            }
        }
    };

    // ✅ Memoize user permissions to prevent re-computation
    const userPermissions = React.useMemo(() => {
        const userRoles = authUser?.roles || '';
        return {
            canDelete: !['operations', 'finance', 'callcenter1', ''].includes(userRoles),
        };
    }, [authUser?.roles]);

    // ✅ Memoized callbacks to prevent TableRowMemo re-renders
    const handleEdit = React.useCallback((order: SheetOrder, field: keyof SheetOrder) => {
        setEditing({ order, field });
        setEditValue(String(order[field] || ''));
    }, []);

    const handleHistory = React.useCallback(
        async (orderId: number, orderNo: string) => {
            setLoadingCell(`history-${orderId}`, true);
            try {
                const res = await fetch(`/sheetorders/${orderId}/histories`);
                const data = await res.json();
                setSelectedHistories(data.histories || []);
                setSelectedOrderNo(orderNo);
                setHistoryModalOpen(true);
            } catch (error) {
                console.error('Failed to fetch histories', error);
            } finally {
                setLoadingCell(`history-${orderId}`, false);
            }
        },
        [setLoadingCell],
    );

    const handleWhatsapp = React.useCallback(
        (orderId: number) => {
            setLoadingCell(`whatsapp-${orderId}`, true);
            router.post(
                `/whatsapp/${orderId}/send`,
                {},
                {
                    onSuccess: () => {
                        setWhatsappAlert({ type: 'success', message: 'WhatsApp message sent successfully ✅' });
                        setTimeout(() => setWhatsappAlert(null), 2000);
                        setLoadingCell(`whatsapp-${orderId}`, false);
                    },
                    onError: () => {
                        setWhatsappAlert({ type: 'error', message: 'Failed to send WhatsApp message ❌' });
                        setTimeout(() => setWhatsappAlert(null), 2000);
                        setLoadingCell(`whatsapp-${orderId}`, false);
                    },
                },
            );
        },
        [setLoadingCell],
    );

    const handleDeleteOrder = React.useCallback((order: SheetOrder) => {
        setDeletingOrder(order);
    }, []);

    // ✅ Optimized filter update with useCallback
    const updateFilter = React.useCallback((key: string, value: string) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
    }, []);

    // ✅ Optimized multi-select filter updates
    const updateMultiSelectFilter = React.useCallback((key: string, value: string, checked: boolean) => {
        setFilters((prev) => {
            const current = normalizeMultiSelectFilter(prev[key] as string | string[] | undefined);
            if (checked) {
                return current.includes(value) ? prev : { ...prev, [key]: [...current, value] };
            } else {
                return { ...prev, [key]: current.filter((item) => item !== value) };
            }
        });
    }, []);

    const handleCloseEditModal = React.useCallback(() => {
        if (editing && editValue !== String(editing.order[editing.field] || '')) {
            if (editing.field === 'instructions') {
                const dateTimePrefix = getCurrentDateTimePrefix();
                const prefixIndex = editValue.indexOf(dateTimePrefix);

                if (prefixIndex !== -1) {
                    const textAfterDash = editValue.substring(prefixIndex + dateTimePrefix.length);
                    if (!textAfterDash.trim()) {
                        console.log('No text added after date/time prefix - not saving');
                        setEditing(null);
                        setEditValue('');
                        return;
                    }
                } else if (!editValue.trim()) {
                    console.log('Instructions field is empty - not saving');
                    setEditing(null);
                    setEditValue('');
                    return;
                }
            }

            if (editValue !== String(editing.order[editing.field] || '')) {
                setIsSaving(true);
                router.put(
                    `/sheetorders/${editing.order.id}`,
                    { [editing.field]: editValue },
                    {
                        preserveState: true,
                        preserveScroll: true,
                        only: ['orders'],
                        onSuccess: () => {
                            const key = `${editing.order.id}-${editing.field}`;
                            setHighlighted((prev) => ({ ...prev, [key]: true }));
                            setTimeout(() => {
                                setHighlighted((prev) => {
                                    const updated = { ...prev };
                                    delete updated[key];
                                    return updated;
                                });
                            }, 2000);
                            setIsSaving(false);
                        },
                        onError: () => {
                            setIsSaving(false);
                        },
                    },
                );
            }
        }
        setEditing(null);
        setEditValue('');
    }, [editing, editValue]);

    const handleNewOrderChange = React.useCallback((field: keyof SheetOrder, value: string) => {
        setNewOrder((prev) => ({ ...prev, [field]: value }));
    }, []);

    const handleCreateOrder = React.useCallback(() => {
        setIsCreating(true);
        router.post('/sheetorders', newOrder, {
            onSuccess: () => {
                toast.success('Order created successfully');
                setCreateModalOpen(false);
                setNewOrder({});
                setIsCreating(false);
            },
            onError: (err) => {
                console.error('Create failed', err);
                const firstError = Object.values(err ?? {}).flat()[0];
                toast.error(typeof firstError === 'string' ? firstError : 'Failed to create order');
                setIsCreating(false);
            },
        });
    }, [newOrder]);

    const handleDelete = React.useCallback(() => {
        if (!deletingOrder) return;
        setIsDeleting(true);

        router.delete(`/sheetorders/${deletingOrder.id}`, {
            onSuccess: () => {
                setDeletingOrder(null);
                setIsDeleting(false);
            },
            onError: (err) => {
                console.error('Delete failed', err);
                setIsDeleting(false);
            },
        });
    }, [deletingOrder]);

    const formatDate = React.useCallback((date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }, []);

    const applyFilters = React.useCallback(() => {
        setIsFiltering(true);
        router.get(
            '/sheetorders',
            {
                ...filters,
                status: Array.isArray(filters.status) ? (filters.status as string[]).join(',') : filters.status,
                from_date: dateRange?.from ? formatDate(dateRange.from) : undefined,
                to_date: dateRange?.to ? formatDate(dateRange.to) : undefined,
            },
            {
                preserveState: true,
                onFinish: () => {
                    setIsFiltering(false);
                    setFilterDialogOpen(false);
                },
            },
        );
    }, [filters, dateRange, formatDate]);

    const clearFilters = React.useCallback(() => {
        setIsFiltering(true);
        setFilters({});
        setDateRange(undefined);
        router.get(
            '/sheetorders',
            {},
            {
                preserveState: true,
                onFinish: () => setIsFiltering(false),
            },
        );
    }, []);

    const refreshOrders = React.useCallback(() => {
        setIsRefreshing(true);
        router.get(
            '/sheetorders',
            {},
            {
                preserveState: true,
                onFinish: () => setIsRefreshing(false),
            },
        );
    }, []);

    // ✅ Memoize merchant data arrays to prevent recreation
    const merchantOptions = React.useMemo(() => Object.keys(merchantData), [merchantData]);
    const selectedStatuses = React.useMemo(() => normalizeMultiSelectFilter(filters.status as string | string[] | undefined), [filters.status]);
    const selectedMerchants = React.useMemo(
        () => normalizeMultiSelectFilter(filters.merchant as string | string[] | undefined),
        [filters.merchant],
    );
    const selectedCcUsers = React.useMemo(() => normalizeMultiSelectFilter(filters.cc_email as string | string[] | undefined), [filters.cc_email]);

    React.useEffect(() => {
        setFilters(initialFilters || {});
        setDateRange(
            initialFilters?.from_date && initialFilters?.to_date
                ? { from: new Date(String(initialFilters.from_date)), to: new Date(String(initialFilters.to_date)) }
                : undefined,
        );
    }, [initialFilters]);

    return (
        <AppLayout breadcrumbs={BREADCRUMBS}>
            <Head title="Sheet Orders" />

            {/* ✅ WhatsApp Alert */}
            {whatsappAlert && (
                <div
                    className={`fixed top-5 right-5 z-50 rounded-lg px-4 py-3 text-white shadow-lg transition-opacity duration-500 ${
                        whatsappAlert.type === 'success' ? 'bg-green-500' : 'bg-red-500'
                    }`}
                >
                    <strong className="block">{whatsappAlert.type === 'success' ? 'Success' : 'Error'}</strong>
                    <span className="text-sm">{whatsappAlert.message}</span>
                </div>
            )}

            <div className="mb-2 flex items-center justify-between px-4 pt-4">
                {/* Left side - Total Orders */}
                <Badge className="rounded bg-black px-3 py-1 text-white">Total: {totalOrders}</Badge>
                <div className="flex space-x-2">
                    {/* Filter Orders */}
                    <Button className="h-8 w-8 p-0 text-sm" disabled={isFiltering} onClick={() => setFilterDialogOpen(true)}>
                        {isFiltering ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilterIcon className="h-4 w-4" />}
                    </Button>

                    <Sheet open={isCallSheetOpen} onOpenChange={setIsCallSheetOpen}>
                        <SheetTrigger asChild>
                            <Button className="h-8 w-8 p-0 text-sm">
                                <PhoneIcon className="h-4 w-4" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="right" className="w-[320px] overflow-y-auto sm:w-[400px]">
                            <SheetHeader>
                                <SheetTitle>Call Center</SheetTitle>
                            </SheetHeader>
                            <div className="mt-4">
                                <VoicePanel variant="compact" initialPhoneNumber={voiceDialNumber} autoInitialize={isCallSheetOpen} />
                            </div>
                        </SheetContent>
                    </Sheet>

                    {/* Refresh Button */}
                    <Button className="h-8 w-8 p-0 text-sm" disabled={isRefreshing} onClick={refreshOrders}>
                        {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCwIcon className="h-4 w-4" />}
                    </Button>

                    {/* Create Order Button */}
                    <Button className="h-8 w-8 p-0 text-sm" onClick={() => setCreateModalOpen(true)}>
                        <PlusIcon className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="rounded-lg border">
                <div className="scrollbar-custom overflow-x-auto">
                    <div className="inline-block min-w-full">
                        <div className="max-h-[600px] overflow-y-auto">
                            <Table className="min-w-full border border-gray-200">
                                <TableHeader className="sticky top-0 z-10 bg-background">
                                    <TableRow className="h-10">
                                        {COLUMNS.map((col) => (
                                            <TableHead
                                                key={col}
                                                className="min-w-[130px] truncate border border-gray-300 text-sm font-medium"
                                                title={col}
                                            >
                                                {col}
                                            </TableHead>
                                        ))}
                                        <TableHead className="sticky right-0 z-20 min-w-[40px] border border-gray-300 bg-background text-sm font-medium">
                                            Actions
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>

                                <TableBody>
                                    {orders.data.map((order) => (
                                        <TableRowMemo
                                            key={order.id}
                                            order={order}
                                            highlighted={highlighted}
                                            onEdit={handleEdit}
                                            onHistory={handleHistory}
                                            onWhatsapp={handleWhatsapp}
                                            canDelete={userPermissions.canDelete}
                                            onDelete={handleDeleteOrder}
                                            loadingCells={loadingCells}
                                        />
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-4 flex justify-center">
                <Pagination>
                    <PaginationContent>
                        {/* Previous */}
                        <PaginationItem>
                            {(() => {
                                const prev = orders.links.find((l) => l.label.includes('Previous'))?.url ?? null;
                                const disabled = !prev;
                                return (
                                    <PaginationPrevious
                                        href={prev ?? '#'}
                                        aria-disabled={disabled}
                                        className={disabled ? 'pointer-events-none opacity-50' : ''}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            if (prev) {
                                                router.get(prev, {}, { preserveState: true, preserveScroll: true });
                                            }
                                        }}
                                    />
                                );
                            })()}
                        </PaginationItem>

                        {/* Page Numbers */}
                        {orders.links
                            .filter((l) => !l.label.includes('Previous') && !l.label.includes('Next'))
                            .map((link) => (
                                <PaginationItem key={link.label}>
                                    <PaginationLink
                                        href={link.url ?? '#'}
                                        isActive={link.active}
                                        aria-current={link.active ? 'page' : undefined}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            if (link.url) {
                                                router.get(link.url, {}, { preserveState: true, preserveScroll: true });
                                            }
                                        }}
                                    >
                                        {link.label}
                                    </PaginationLink>
                                </PaginationItem>
                            ))}

                        {/* Next */}
                        <PaginationItem>
                            {(() => {
                                const next = orders.links.find((l) => l.label.includes('Next'))?.url ?? null;
                                const disabled = !next;
                                return (
                                    <PaginationNext
                                        href={next ?? '#'}
                                        aria-disabled={disabled}
                                        className={disabled ? 'pointer-events-none opacity-50' : ''}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            if (next) {
                                                router.get(next, {}, { preserveState: true, preserveScroll: true });
                                            }
                                        }}
                                    />
                                );
                            })()}
                        </PaginationItem>
                    </PaginationContent>
                </Pagination>
            </div>

            {/* ✅ Filter Dialog */}
            {filterDialogOpen && (
                <Dialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
                    <DialogContent className="max-w-lg">
                        <DialogHeader>
                            <DialogTitle>Filter Orders</DialogTitle>
                            <DialogDescription>Apply filters to narrow down your orders. Click Apply to filter or Clear to reset.</DialogDescription>
                        </DialogHeader>
                        <div className="mt-2 grid max-h-[500px] grid-cols-1 gap-4 overflow-y-auto md:grid-cols-3">
                            {FILTER_FIELDS.map((col) =>
                                col === 'delivery_date' ? (
                                    // ✅ Date Range Filter
                                    <Popover key={col}>
                                        <PopoverTrigger asChild>
                                            <Input
                                                readOnly
                                                placeholder="Select date range"
                                                value={
                                                    dateRange?.from && dateRange?.to
                                                        ? `${dateRange.from.toLocaleDateString()} - ${dateRange.to.toLocaleDateString()}`
                                                        : 'Delivery date'
                                                }
                                            />
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-2">
                                            <Calendar
                                                mode="range"
                                                selected={dateRange}
                                                onSelect={setDateRange}
                                                numberOfMonths={2}
                                                className="rounded-lg border shadow-sm"
                                            />
                                        </PopoverContent>
                                    </Popover>
                                ) : col === 'status' ? (
                                    // ✅ Status Searchable Multi-select with Textarea
                                    <Popover key={col}>
                                        <PopoverTrigger asChild>
                                            <Textarea
                                                readOnly
                                                className="max-h-[120px] min-h-[40px] w-full resize-y"
                                                placeholder="Status(es)"
                                                value={selectedStatuses.length > 0 ? selectedStatuses.join(', ') : ''}
                                            />
                                        </PopoverTrigger>
                                        <PopoverContent className="w-64 p-2">
                                            <Command>
                                                <CommandInput placeholder="Search status..." />
                                                <CommandList className="max-h-60 overflow-y-auto">
                                                    <CommandGroup>
                                                        {STATUS_OPTIONS.map((status) => (
                                                            <CommandItem
                                                                key={status}
                                                                onSelect={() => {
                                                                    const isChecked = selectedStatuses.includes(status);
                                                                    updateMultiSelectFilter('status', status, !isChecked);
                                                                }}
                                                            >
                                                                <Checkbox checked={selectedStatuses.includes(status)} className="mr-2" />
                                                                {status}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                ) : col === 'merchant' ? (
                                    // ✅ Merchant Searchable Multi-select with Textarea
                                    <Popover key={col}>
                                        <PopoverTrigger asChild>
                                            <Textarea
                                                readOnly
                                                className="max-h-[120px] min-h-[40px] w-full resize-y"
                                                placeholder="Merchant(s)"
                                                value={selectedMerchants.length > 0 ? selectedMerchants.join(', ') : ''}
                                            />
                                        </PopoverTrigger>
                                        <PopoverContent className="w-64 p-2">
                                            <Command>
                                                <CommandInput placeholder="Search merchants..." />
                                                <CommandList className="max-h-60 overflow-y-auto">
                                                    <CommandGroup>
                                                        {merchantUsers.map((name: string) => (
                                                            <CommandItem
                                                                key={name}
                                                                onSelect={() => {
                                                                    const isChecked = selectedMerchants.includes(name);
                                                                    updateMultiSelectFilter('merchant', name, !isChecked);
                                                                }}
                                                            >
                                                                <Checkbox checked={selectedMerchants.includes(name)} className="mr-2" />
                                                                {name}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                ) : col === 'cc_email' ? (
                                    // ✅ Callcenter (cc_email) Searchable Multi-select with Textarea
                                    <Popover key={col}>
                                        <PopoverTrigger asChild>
                                            <Textarea
                                                readOnly
                                                className="max-h-[120px] min-h-[40px] w-full resize-y"
                                                placeholder="Callcenter(s)"
                                                value={selectedCcUsers.length > 0 ? selectedCcUsers.join(', ') : ''}
                                            />
                                        </PopoverTrigger>
                                        <PopoverContent className="w-64 p-2">
                                            <Command>
                                                <CommandInput placeholder="Search callcenter..." />
                                                <CommandList className="max-h-60 overflow-y-auto">
                                                    <CommandGroup>
                                                        {ccUsers.map((name: string) => (
                                                            <CommandItem
                                                                key={name}
                                                                onSelect={() => {
                                                                    const isChecked = selectedCcUsers.includes(name);
                                                                    updateMultiSelectFilter('cc_email', name, !isChecked);
                                                                }}
                                                            >
                                                                <Checkbox checked={selectedCcUsers.includes(name)} className="mr-2" />
                                                                {name}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                ) : col === 'country' ? (
                                    <Select
                                        key={col}
                                        value={(filters.country as string) || '__all__'}
                                        onValueChange={(value) => updateFilter('country', value === '__all__' ? '' : value)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Country" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__all__">All countries</SelectItem>
                                            {EAST_AFRICAN_COUNTRIES.map((country) => (
                                                <SelectItem key={country} value={country}>
                                                    {country}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    // ✅ Default text filter
                                    <Input
                                        key={col}
                                        value={(filters[col] as string) || ''}
                                        onChange={(e) => updateFilter(col, e.target.value)}
                                        placeholder={col}
                                    />
                                ),
                            )}
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            <Button variant="outline" disabled={isFiltering} onClick={clearFilters}>
                                {isFiltering ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Clearing...
                                    </>
                                ) : (
                                    'Clear'
                                )}
                            </Button>
                            <Button disabled={isFiltering} onClick={applyFilters}>
                                {isFiltering ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Applying...
                                    </>
                                ) : (
                                    'Apply'
                                )}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            )}

            {/* ✅ Edit Modal */}
            {editing && (
                <Dialog open={!!editing} onOpenChange={handleCloseEditModal}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>
                                Edit {editing.field} for Order #{editing.order.order_no}
                            </DialogTitle>
                            <DialogDescription>Make changes to the order field. Click outside or press ESC to cancel.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            {editing.field === 'status' ? (
                                <Select value={editValue} onValueChange={setEditValue}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {STATUS_OPTIONS.map((status) => (
                                            <SelectItem key={status} value={status}>
                                                {status}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : editing.field === 'instructions' ? (
                                <>
                                    <div className="relative">
                                        <Textarea
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            rows={5}
                                            placeholder="Enter instructions..."
                                            className="pr-12"
                                            disabled={isSaving}
                                        />
                                        {isSpeechSupported && (
                                            <div className="absolute top-2 right-2">
                                                <Button
                                                    variant={isListening ? 'destructive' : 'outline'}
                                                    size="icon"
                                                    className={`h-8 w-8 transition-all ${isListening ? 'animate-pulse' : ''}`}
                                                    onClick={toggleListening}
                                                    title={isListening ? 'Stop recording' : 'Start voice recording'}
                                                    type="button"
                                                    disabled={isSaving}
                                                >
                                                    {isListening ? <MicOffIcon className="h-4 w-4" /> : <MicIcon className="h-4 w-4" />}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                    {isListening && (
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <div className="h-2 w-2 animate-pulse rounded-full bg-red-500"></div>
                                            Listening... {interimTranscript && <span className="italic">"{interimTranscript}"</span>}
                                        </div>
                                    )}
                                    {speechError && <div className="text-sm text-red-500">Voice input error: {speechError}</div>}
                                    {!isSpeechSupported && (
                                        <div className="text-sm text-muted-foreground">
                                            Voice input is not supported in your browser. Try Chrome or Edge.
                                        </div>
                                    )}
                                    <div className="text-xs text-gray-500 italic">
                                        💡 Date/time is auto-added. Type your comment after the dash. If you don't add text after the dash, changes
                                        won't be saved.
                                    </div>
                                    {/* Save button shown for instructions so user gets explicit feedback */}
                                </>
                            ) : editing.field === 'delivery_date' ? (
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-full justify-start text-left font-normal" disabled={isSaving}>
                                            <Calendar1Icon className="mr-2 h-4 w-4" />
                                            {editValue ? format(new Date(editValue), 'yyyy-MM-dd') : 'Pick a delivery date'}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar
                                            mode="single"
                                            selected={editValue ? new Date(editValue) : undefined}
                                            onSelect={(date) => {
                                                if (date) setEditValue(format(date, 'yyyy-MM-dd'));
                                            }}
                                            initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>
                            ) : (
                                <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} disabled={isSaving} />
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            )}

            {/* ✅ History Modal */}
            {historyModalOpen && (
                <Dialog open={historyModalOpen} onOpenChange={setHistoryModalOpen}>
                    <DialogContent className="max-w-lg">
                        <DialogHeader>
                            <DialogTitle>Edit History for Order #{selectedOrderNo}</DialogTitle>
                            <DialogDescription>View all changes made to this order.</DialogDescription>
                        </DialogHeader>
                        <div className="max-h-[500px] space-y-2 overflow-y-auto p-2">
                            {selectedHistories.length > 0 ? (
                                selectedHistories.map((history) => (
                                    <div key={history.id} className="border-b py-2">
                                        <div className="text-sm font-medium">{history.attribute}</div>
                                        <div className="text-xs text-muted-foreground">
                                            <span className="font-semibold">Old:</span> {history.old_value} <br />
                                            <span className="font-semibold">New:</span> {history.new_value} <br />
                                            <span className="text-[10px]">
                                                By {history.user?.name ?? 'System (C2B Callback)'} on {new Date(history.created_at).toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-muted-foreground">No edit history for this order.</p>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            )}

            {/* ✅ Delete Confirmation */}
            {deletingOrder && (
                <Dialog
                    open={!!deletingOrder}
                    onOpenChange={() => {
                        if (!isDeleting) setDeletingOrder(null);
                    }}
                >
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>Confirm Delete</DialogTitle>
                            <DialogDescription>
                                This action cannot be undone. This will permanently delete the order from the system.
                            </DialogDescription>
                        </DialogHeader>
                        <p>
                            Are you sure you want to delete order <strong>#{deletingOrder.order_no}</strong>?
                        </p>
                        <div className="mt-4 flex justify-end gap-2">
                            <Button variant="outline" disabled={isDeleting} onClick={() => setDeletingOrder(null)}>
                                Cancel
                            </Button>
                            <Button variant="destructive" disabled={isDeleting} onClick={handleDelete}>
                                {isDeleting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Deleting...
                                    </>
                                ) : (
                                    'Delete'
                                )}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            )}

            {/* Create Order Modal */}
            <Dialog
                open={createModalOpen}
                onOpenChange={(open) => {
                    if (!isCreating) setCreateModalOpen(open);
                }}
            >
                <DialogContent className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] rounded-lg p-4 sm:max-w-3xl sm:p-5 lg:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Create New Order</DialogTitle>
                        <DialogDescription>Fill in all required fields to create a new order. Click Create when done.</DialogDescription>
                    </DialogHeader>

                    <div className="grid max-h-[72vh] grid-cols-2 gap-3 overflow-y-auto pr-1">
                        {/* --- Order Info --- */}
                        <Input
                            required
                            className="h-9 text-sm"
                            placeholder="Order No"
                            value={newOrder.order_no || ''}
                            onChange={(e) => handleNewOrderChange('order_no', e.target.value)}
                            disabled={isCreating}
                        />

                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="h-9 w-full justify-start text-left text-sm font-normal" disabled={isCreating}>
                                    <Calendar1Icon className="mr-2 h-4 w-4" />
                                    {newOrder.order_date ? format(new Date(newOrder.order_date), 'yyyy-MM-dd') : 'Pick order date'}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar
                                    mode="single"
                                    selected={newOrder.order_date ? new Date(newOrder.order_date) : undefined}
                                    onSelect={(date) => {
                                        if (date) handleNewOrderChange('order_date', format(date, 'yyyy-MM-dd'));
                                    }}
                                />
                            </PopoverContent>
                        </Popover>

                        <Input
                            type="number"
                            required
                            className="h-9 text-sm"
                            placeholder="Amount"
                            value={newOrder.amount || ''}
                            onChange={(e) => handleNewOrderChange('amount', e.target.value)}
                            disabled={isCreating}
                        />

                        <Input
                            type="number"
                            required
                            className="h-9 text-sm"
                            placeholder="Quantity"
                            value={newOrder.quantity || ''}
                            onChange={(e) => handleNewOrderChange('quantity', e.target.value)}
                            disabled={isCreating}
                        />

                        {/* --- Client Info --- */}
                        <Input
                            required
                            className="h-9 text-sm"
                            placeholder="Client Name"
                            value={newOrder.client_name || ''}
                            onChange={(e) => handleNewOrderChange('client_name', e.target.value)}
                            disabled={isCreating}
                        />
                        <Input
                            className="h-9 text-sm"
                            placeholder="Client City"
                            value={newOrder.city || ''}
                            onChange={(e) => handleNewOrderChange('city', e.target.value)}
                            disabled={isCreating}
                        />
                        <Input
                            className="h-9 text-sm"
                            placeholder="Phone"
                            value={newOrder.phone || ''}
                            onChange={(e) => handleNewOrderChange('phone', e.target.value)}
                            disabled={isCreating}
                        />
                        <Input
                            className="h-9 text-sm"
                            placeholder="Address"
                            value={newOrder.address || ''}
                            onChange={(e) => handleNewOrderChange('address', e.target.value)}
                            disabled={isCreating}
                        />

                        {/* --- Product Info --- */}
                        <Input
                            className="h-9 text-sm"
                            placeholder="Product Name"
                            value={newOrder.product_name || ''}
                            onChange={(e) => handleNewOrderChange('product_name', e.target.value)}
                            disabled={isCreating}
                        />

                        <Input
                            className="h-9 text-sm"
                            placeholder="Store Name"
                            value={newOrder.store_name || ''}
                            onChange={(e) => handleNewOrderChange('store_name', e.target.value)}
                            disabled={isCreating}
                        />

                        {/* --- Merchant Select --- */}
                        <Popover open={createMerchantOpen} onOpenChange={setCreateMerchantOpen}>
                            <PopoverTrigger asChild>
                                <Button variant="outline" role="combobox" className="h-9 w-full justify-between text-sm" disabled={isCreating}>
                                    <span className="truncate">{newOrder.merchant || 'Select Merchant'}</span>
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                                <Command>
                                    <CommandInput placeholder="Search merchant..." />
                                    <CommandList>
                                        <CommandGroup>
                                            {merchantOptions.map((merchant) => (
                                                <CommandItem
                                                    key={merchant}
                                                    value={merchant}
                                                    onSelect={() => {
                                                        handleNewOrderChange('merchant', merchant);

                                                        if (merchantData[merchant]) {
                                                            handleNewOrderChange('sheet_id', merchantData[merchant].sheet_id || '');
                                                            handleNewOrderChange('sheet_name', '');
                                                        }

                                                        setCreateMerchantOpen(false);
                                                    }}
                                                >
                                                    <Check
                                                        className={`mr-2 h-4 w-4 ${newOrder.merchant === merchant ? 'opacity-100' : 'opacity-0'}`}
                                                    />
                                                    <span className="truncate">{merchant}</span>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>

                        {/* --- Sheet ID (auto filled, readonly) --- */}
                        <Input className="h-9 text-sm" placeholder="Sheet ID" value={newOrder.sheet_id || ''} readOnly />

                        {/* --- Sheet Name Dropdown --- */}
                        <Select
                            value={newOrder.sheet_name || ''}
                            onValueChange={(val) => handleNewOrderChange('sheet_name', val)}
                            disabled={!newOrder.merchant || isCreating}
                        >
                            <SelectTrigger className="h-9 text-sm">
                                <SelectValue placeholder="Select Sheet Name" />
                            </SelectTrigger>
                            <SelectContent>
                                {newOrder.merchant &&
                                    merchantData[newOrder.merchant]?.sheet_names.map((sn: string) => (
                                        <SelectItem key={sn} value={sn}>
                                            {sn}
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>

                        {/* --- Delivery Info --- */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="h-9 w-full justify-start text-left text-sm font-normal" disabled={isCreating}>
                                    <Calendar1Icon className="mr-2 h-4 w-4" />
                                    {newOrder.delivery_date ? format(new Date(newOrder.delivery_date), 'yyyy-MM-dd') : 'Pick delivery date'}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar
                                    mode="single"
                                    selected={newOrder.delivery_date ? new Date(newOrder.delivery_date) : undefined}
                                    onSelect={(date) => {
                                        if (date) handleNewOrderChange('delivery_date', format(date, 'yyyy-MM-dd'));
                                    }}
                                />
                            </PopoverContent>
                        </Popover>

                        {/* --- Status --- */}
                        <Select
                            required
                            value={newOrder.status || ''}
                            onValueChange={(val) => handleNewOrderChange('status', val)}
                            disabled={isCreating}
                        >
                            <SelectTrigger className="h-9 text-sm">
                                <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                                {STATUS_OPTIONS.map((status) => (
                                    <SelectItem key={status} value={status}>
                                        {status}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {/* --- Instructions with Voice-to-Text --- */}
                        <div className="relative col-span-2">
                            <Textarea
                                placeholder="Special Instructions"
                                value={newOrder.instructions || ''}
                                onChange={(e) => handleNewOrderChange('instructions', e.target.value)}
                                rows={4}
                                className="min-h-24 pr-12 text-sm"
                                disabled={isCreating}
                            />
                            {isSpeechSupported && (
                                <div className="absolute top-2 right-2">
                                    <Button
                                        variant={isListening ? 'destructive' : 'outline'}
                                        size="icon"
                                        className={`h-8 w-8 transition-all ${isListening ? 'animate-pulse' : ''}`}
                                        onClick={toggleListening}
                                        title={isListening ? 'Stop recording' : 'Start voice recording'}
                                        type="button"
                                        disabled={isCreating}
                                    >
                                        {isListening ? <MicOffIcon className="h-4 w-4" /> : <MicIcon className="h-4 w-4" />}
                                    </Button>
                                </div>
                            )}
                            {isListening && (
                                <div className="absolute bottom-2 left-2 flex items-center gap-2 text-sm text-muted-foreground">
                                    <div className="h-2 w-2 animate-pulse rounded-full bg-red-500"></div>
                                    Listening... {interimTranscript && <span className="italic">"{interimTranscript}"</span>}
                                </div>
                            )}
                            {speechError && <div className="mt-1 text-sm text-red-500">Voice input error: {speechError}</div>}
                            {!isSpeechSupported && (
                                <div className="mt-1 text-sm text-muted-foreground">
                                    Voice input is not supported in your browser. Try Chrome or Edge.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button variant="outline" disabled={isCreating} onClick={() => setCreateModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button disabled={isCreating} onClick={handleCreateOrder}>
                            {isCreating ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                'Create'
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
