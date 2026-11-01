"use client";

import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Deferred, Head, usePage, router } from '@inertiajs/react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as DateRangeCalendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { csrfHeaders } from '@/lib/csrf';
import { toast } from '@/lib/toast';
import { sileo } from 'sileo';
import { format } from 'date-fns';
import { type DateRange } from 'react-day-picker';
import {
  Edit,
  Smartphone,
  Loader2,
  Search,
  X,
  Package,
  User,
  MapPin,
  Calendar,
  DollarSign,
  Hash,
  Phone,
  ShoppingCart,
  Receipt,
  LayoutGrid,
  List,
  ChevronDown,
  ChevronUp,
  PhoneCall,
  GripVertical,
  MessageSquare
} from 'lucide-react';
import * as React from 'react';

const breadcrumbs: BreadcrumbItem[] = [
  { title: 'Dashboard', href: '/dashboard' },
  { title: 'M-Pesa Prompting', href: '/stk' },
];

interface SheetOrder {
  id: number;
  order_no: string;
  cc_email?: string;
  client_name: string;
  quantity: number;
  amount: number;
  product_name: string;
  address: string;
  phone: string;
  city: string;
  status: string;
  delivery_date: string;
  code?: string;
  comments?: string;
  confirmed: number;
}

const EMPTY_STK_ORDERS = { data: [] as SheetOrder[], current_page: 1, last_page: 1, per_page: 30, total: 0 };

type StkPaymentSuccess = {
  orderNo: string;
  amount: number;
  receipt?: string;
};

function stkPaymentSuccessOptions({ orderNo, amount, receipt }: StkPaymentSuccess) {
  return {
    title: 'Payment successful',
    duration: 6000,
    description: (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Order</span>
          <span className="font-mono text-sm font-semibold">{orderNo}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Amount paid</span>
          <span className="text-sm font-semibold">KES {amount.toLocaleString()}</span>
        </div>
        {receipt && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">M-Pesa receipt</span>
            <span className="font-mono text-sm font-semibold">{receipt}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 border-t pt-2 text-xs text-muted-foreground">
          <Receipt className="size-3.5" />
          <span>Payment confirmed for {orderNo}.</span>
        </div>
      </div>
    ),
    fill: 'var(--primary)',
  };
}

function StkOrdersSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading payment orders" aria-live="polite">
      <div className="rounded-none border bg-card">
        <div className="grid grid-cols-5 gap-3 border-b p-3">
          {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-4 w-full" />)}
        </div>
        {Array.from({ length: 7 }).map((_, row) => (
          <div key={row} className="grid grid-cols-5 gap-3 border-b p-3 last:border-0">
            {Array.from({ length: 5 }).map((__, column) => <Skeleton key={column} className="h-8 w-full" />)}
          </div>
        ))}
      </div>
    </div>
  );
}

const getStatusColor = (status: string | null | undefined) => {
  if (!status) return 'bg-muted text-foreground border-border';
  const statusLower = status.toLowerCase();
  if (statusLower.includes('pending')) return 'bg-warning/10 text-warning-foreground border-warning/30';
  if (statusLower.includes('paid') || statusLower.includes('success')) return 'bg-success/10 text-success border-success/30';
  if (statusLower.includes('failed')) return 'bg-destructive/10 text-destructive border-destructive/30';
  if (statusLower.includes('processing')) return 'bg-accent text-foreground border-border';
  return 'bg-muted text-foreground border-border';
};

const parseLocalDate = (value?: string) => {
  if (!value) return undefined;

  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return undefined;

  return new Date(year, month - 1, day);
};

export default function Index() {
  const { props } = usePage();
  const { orders: loadedOrders, filters, auth, agents, callCenterUsers } = props as unknown as {
    orders?: { data: SheetOrder[]; current_page: number; last_page: number; per_page: number; total: number };
    filters: { search?: string; agent?: string; cc_name?: string; start_date?: string; end_date?: string };
    auth?: { user?: { id: number; roles?: string } };
    agents: Array<{ id: number; name: string }>;
    callCenterUsers: Array<{ id: number; name: string; email: string }>;
  };
  const orders = loadedOrders ?? EMPTY_STK_ORDERS;

  const userId = auth?.user?.id || 'guest';
  const currentUserRole = String(auth?.user?.roles ?? '').trim().toLowerCase();
  const showAgentFilter = currentUserRole !== 'agent';
  const storageKey = `mpesa-orders-arrangement-user-${userId}`;

  const [searchValue, setSearchValue] = React.useState(filters?.search || '');
  const [selectedAgent, setSelectedAgent] = React.useState(filters?.agent || '');
  const [selectedCcName, setSelectedCcName] = React.useState(filters?.cc_name || '');
  const [agentPopoverOpen, setAgentPopoverOpen] = React.useState(false);
  const [ccPopoverOpen, setCcPopoverOpen] = React.useState(false);
  const [mobileAgentPopoverOpen, setMobileAgentPopoverOpen] = React.useState(false);
  const [mobileCcPopoverOpen, setMobileCcPopoverOpen] = React.useState(false);
  const [deliveryDateRange, setDeliveryDateRange] = React.useState<DateRange | undefined>({
    from: parseLocalDate(filters?.start_date),
    to: parseLocalDate(filters?.end_date),
  });
  const [editingOrder, setEditingOrder] = React.useState<SheetOrder | null>(null);
  const [phoneNumbers, setPhoneNumbers] = React.useState<Record<number, string>>({});
  const [viewMode, setViewMode] = React.useState<'table' | 'card'>('table');
  const [expandedRows, setExpandedRows] = React.useState<Set<number>>(new Set());
  const [searchModalOpen, setSearchModalOpen] = React.useState(false);
  const [orderedItems, setOrderedItems] = React.useState<SheetOrder[]>([]);
  const [draggedIndex, setDraggedIndex] = React.useState<number | null>(null);
  const [confirmationFilter, setConfirmationFilter] = React.useState<'all' | 'confirmed' | 'unconfirmed'>('all');
  const confirmationSwipeStart = React.useRef<number | null>(null);

  // Loading states
  const [isSearching, setIsSearching] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [payingOrders, setPayingOrders] = React.useState<Set<number>>(new Set());
  const [savingConfirmations, setSavingConfirmations] = React.useState<Set<number>>(new Set());

  const filteredOrders = orderedItems.filter(order => confirmationFilter === 'all'
    || (confirmationFilter === 'confirmed' ? Number(order.confirmed) === 1 : Number(order.confirmed) !== 1));
  const confirmationCounts = {
    all: orderedItems.length,
    confirmed: orderedItems.filter(order => Number(order.confirmed) === 1).length,
    unconfirmed: orderedItems.filter(order => Number(order.confirmed) !== 1).length,
  };
  const confirmationFilters = ['all', 'confirmed', 'unconfirmed'] as const;

  const finishConfirmationSwipe = (endX: number) => {
    if (confirmationSwipeStart.current === null) return;
    const delta = endX - confirmationSwipeStart.current;
    confirmationSwipeStart.current = null;
    if (Math.abs(delta) < 55) return;

    const currentIndex = confirmationFilters.indexOf(confirmationFilter);
    const nextIndex = Math.max(0, Math.min(confirmationFilters.length - 1, currentIndex + (delta < 0 ? 1 : -1)));
    setConfirmationFilter(confirmationFilters[nextIndex]);
  };

  const savePaymentDetails = async (orderId: number, comments: string | null | undefined, confirmed: number) => {
    const response = await fetch(`/stk/${orderId}`, {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...csrfHeaders(),
      },
      body: JSON.stringify({ comments: comments ?? '', confirmed }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.message || 'Could not update order payment details.');
    }
  };

  const updateConfirmation = (order: SheetOrder, checked: boolean) => {
    const confirmed = checked ? 1 : 0;
    if (Number(order.confirmed) === confirmed || savingConfirmations.has(order.id)) return;

    setSavingConfirmations(current => new Set(current).add(order.id));
    void savePaymentDetails(order.id, order.comments, confirmed).then(() => {
      setOrderedItems(current => current.map(item => item.id === order.id ? { ...item, confirmed } : item));
      toast.success(`Order ${order.order_no} marked ${confirmed ? 'confirmed' : 'unconfirmed'}.`, { position: 'top-center' });
    }).catch(() => {
      toast.error(`Could not update confirmation for ${order.order_no}.`, { position: 'top-center' });
    }).finally(() => {
      setSavingConfirmations(current => {
        const next = new Set(current);
        next.delete(order.id);
        return next;
      });
    });
  };

  const closeEditOrder = () => {
    setEditingOrder(null);
  };

  const getConfirmationBadge = (confirmed: number) => {
    return Number(confirmed) === 1
      ? {
          label: 'Confirmed',
          className: 'bg-success text-success-foreground hover:bg-success',
        }
      : {
          label: 'Unconfirmed',
          className: 'bg-destructive text-destructive-foreground hover:bg-destructive',
        };
  };

  // Load saved order from localStorage or use default order
  React.useEffect(() => {
    const savedOrderString = localStorage.getItem(storageKey);

    if (savedOrderString) {
      try {
        const savedOrderIds = JSON.parse(savedOrderString) as number[];
        // Reorder based on saved IDs
        const orderedData = [...orders.data].sort((a, b) => {
          const indexA = savedOrderIds.indexOf(a.id);
          const indexB = savedOrderIds.indexOf(b.id);
          // If not in saved order, put at end
          if (indexA === -1) return 1;
          if (indexB === -1) return -1;
          return indexA - indexB;
        });
        setOrderedItems(orderedData);
      } catch (error) {
        console.error('Error loading saved order:', error);
        setOrderedItems(orders.data);
      }
    } else {
      setOrderedItems(orders.data);
    }
  }, [orders.data, storageKey]);

  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get('previewStk') !== 'success') return;

    const timer = window.setTimeout(() => {
      sileo.success({
        ...stkPaymentSuccessOptions({ orderNo: 'ORD-2026-001', amount: 24500, receipt: 'SFH4K9X2LQ' }),
        position: 'bottom-center',
      });
    }, 800);

    return () => window.clearTimeout(timer);
  }, []);

  const toggleRowExpansion = (orderId: number) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newOrders = [...orderedItems];
    const draggedItem = newOrders[draggedIndex];
    newOrders.splice(draggedIndex, 1);
    newOrders.splice(index, 0, draggedItem);

    setDraggedIndex(index);
    setOrderedItems(newOrders);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    // Save the new order to localStorage with user-specific key
    const orderIds = orderedItems.map(order => order.id);
    localStorage.setItem(storageKey, JSON.stringify(orderIds));
  };

  const payOrder = async (order: SheetOrder) => {
    const phone = phoneNumbers[order.id] ?? order.phone;
    if (!phone) {
      toast.warning('Add a phone number before sending an M-Pesa payment prompt.', { position: 'top-center' });
      return;
    }

    setPayingOrders(prev => new Set(prev).add(order.id));
    const payment = (async () => {
      const response = await fetch('/api/stk/stk-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...csrfHeaders(),
        },
        body: JSON.stringify({ phone, amount: order.amount, order_no: order.order_no }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Could not send the M-Pesa payment prompt.');
      }

      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise(resolve => window.setTimeout(resolve, 3000));
        const statusResponse = await fetch(`/api/transactions/${encodeURIComponent(order.order_no)}`);
        if (!statusResponse.ok) continue;

        const transaction = await statusResponse.json();
        if (transaction.status === 'Success') return transaction;
        if (transaction.status === 'Failed') throw new Error('The M-Pesa payment was declined or cancelled.');
      }

      throw new Error('Payment confirmation timed out. Check the payment status before trying again.');
    })();

    try {
      const transaction = await sileo.promise(payment, {
        position: 'bottom-center',
        loading: {
          title: 'Waiting for payment',
          description: `Approve the M-Pesa prompt for order ${order.order_no} on the phone.`,
          fill: 'var(--primary)',
        },
        success: (result) => stkPaymentSuccessOptions({
          orderNo: order.order_no,
          amount: order.amount,
          receipt: result.mpesa_receipt ?? undefined,
        }),
        error: (error) => ({
          title: 'Payment failed',
          description: error instanceof Error ? error.message : 'The M-Pesa payment could not be completed.',
          fill: 'var(--primary)',
        }),
      });

      setOrderedItems(currentOrders => currentOrders.map(current => current.id === order.id
        ? { ...current, status: 'Delivered', code: transaction.mpesa_receipt ?? current.code }
        : current));
    } catch {
      // The Sileo promise toast displays the payment error.
    } finally {
      setPayingOrders(prev => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }
  };

  const handleEditSave = () => {
    if (!editingOrder) return;
    setIsSaving(true);
    void savePaymentDetails(editingOrder.id, editingOrder.comments, Number(editingOrder.confirmed) === 1 ? 1 : 0)
      .then(() => {
        setOrderedItems(current => current.map(order => order.id === editingOrder.id
          ? { ...order, comments: editingOrder.comments ?? '', confirmed: Number(editingOrder.confirmed) === 1 ? 1 : 0 }
          : order));
        setEditingOrder(null);
        toast.success('Order payment details were updated.', { position: 'top-center' });
      }).catch(() => {
        toast.error('Could not update the order payment details. Please review the fields and try again.', { position: 'top-center' });
      }).finally(() => setIsSaving(false));
  };

  const handleSearch = () => {
    setIsSearching(true);
    router.get('/stk', {
      search: searchValue.trim() || undefined,
      agent: selectedAgent || undefined,
      cc_name: selectedCcName || undefined,
      start_date: deliveryDateRange?.from ? format(deliveryDateRange.from, 'yyyy-MM-dd') : undefined,
      end_date: deliveryDateRange?.to ? format(deliveryDateRange.to, 'yyyy-MM-dd') : undefined,
    }, {
      preserveState: true,
      replace: true,
      onFinish: () => setIsSearching(false)
    });
  };

  const goToPage = (page: number) => {
    router.get('/stk', {
      search: searchValue.trim() || undefined,
      agent: selectedAgent || undefined,
      cc_name: selectedCcName || undefined,
      start_date: deliveryDateRange?.from ? format(deliveryDateRange.from, 'yyyy-MM-dd') : undefined,
      end_date: deliveryDateRange?.to ? format(deliveryDateRange.to, 'yyyy-MM-dd') : undefined,
      page,
    }, {
      preserveState: true,
      preserveScroll: true,
      replace: true,
      only: ['orders'],
    });
  };

  const handleClearSearch = () => {
    setIsSearching(true);
    setSearchValue('');
    setSelectedAgent('');
    setSelectedCcName('');
    setDeliveryDateRange(undefined);
    router.get('/stk', {}, {
      preserveState: true,
      replace: true,
      onFinish: () => setIsSearching(false)
    });
  };

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="M-Pesa Payment Processing" />

      <div className="space-y-4 p-2 sm:p-4 pb-20 sm:pb-4">
        {/* Header Section */}
        <div className="flex flex-col gap-1">
          <h1 className="text-xl sm:text-3xl font-bold tracking-tight">Order Payments</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Process M-Pesa payments for orders</p>
        </div>

        {/* Search and View Toggle */}
        {/* Desktop Search Card */}
        <Card className="hidden rounded-none sm:block">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <Search className="h-4 w-4 sm:h-5 sm:w-5" />
                  Search Orders
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">Filter by order number, name, or phone</CardDescription>
              </div>
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'table' | 'card')} className="w-auto">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="table" className="gap-2 text-xs sm:text-sm">
                    <List className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span className="hidden sm:inline">Table</span>
                  </TabsTrigger>
                  <TabsTrigger value="card" className="gap-2 text-xs sm:text-sm">
                    <LayoutGrid className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span className="hidden sm:inline">Cards</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search orders..."
                  value={searchValue}
                  onChange={e => setSearchValue(e.target.value)}
                  className="pl-9 h-9 sm:h-10"
                  disabled={isSearching}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      handleSearch();
                    }
                  }}
                />
              </div>
              {showAgentFilter && (
                <Popover open={agentPopoverOpen} onOpenChange={setAgentPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full sm:w-64 justify-between"
                    >
                      <span className="truncate">{selectedAgent || 'Filter by agent'}</span>
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search agent..." />
                      <CommandList>
                        <CommandGroup>
                          <CommandItem
                            value="all-agents"
                            onSelect={() => {
                              setSelectedAgent('');
                              setAgentPopoverOpen(false);
                            }}
                          >
                            All agents
                          </CommandItem>
                          {agents.map((agent) => (
                            <CommandItem
                              key={agent.id}
                              value={agent.name}
                              onSelect={() => {
                                setSelectedAgent(agent.name);
                                setAgentPopoverOpen(false);
                              }}
                              className={cn(selectedAgent === agent.name && 'bg-accent')}
                            >
                              {agent.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
              <Popover open={ccPopoverOpen} onOpenChange={setCcPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full sm:w-72 justify-between"
                  >
                    <span className="truncate">
                      {selectedCcName
                        ? callCenterUsers.find((user) => user.name === selectedCcName)?.name || selectedCcName
                        : 'Filter by call center user'}
                    </span>
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search call center user..." />
                    <CommandList>
                      <CommandGroup>
                        <CommandItem
                          value="all-call-center-users"
                          onSelect={() => {
                            setSelectedCcName('');
                            setCcPopoverOpen(false);
                          }}
                        >
                          All call center users
                        </CommandItem>
                        {callCenterUsers.map((user) => (
                          <CommandItem
                            key={user.id}
                            value={`${user.name} ${user.email}`}
                            onSelect={() => {
                              setSelectedCcName(user.name);
                              setCcPopoverOpen(false);
                            }}
                            className={cn(selectedCcName === user.name && 'bg-accent')}
                          >
                            {user.name} ({user.email})
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full sm:w-[280px] justify-start text-left font-normal',
                      !deliveryDateRange?.from && 'text-muted-foreground'
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {deliveryDateRange?.from ? (
                      deliveryDateRange.to ? (
                        <>
                          {format(deliveryDateRange.from, 'LLL dd, y')} - {format(deliveryDateRange.to, 'LLL dd, y')}
                        </>
                      ) : (
                        format(deliveryDateRange.from, 'LLL dd, y')
                      )
                    ) : (
                      <span>Delivery date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <DateRangeCalendar
                    initialFocus
                    mode="range"
                    defaultMonth={deliveryDateRange?.from}
                    selected={deliveryDateRange}
                    onSelect={setDeliveryDateRange}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
              <div className="flex gap-2">
                <Button
                  onClick={handleSearch}
                  className="gap-2 flex-1 sm:flex-none h-9 sm:h-10"
                  size="sm"
                  disabled={isSearching}
                >
                  {isSearching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  <span className="sm:inline">Search</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={handleClearSearch}
                  className="gap-2 h-9 sm:h-10"
                  size="sm"
                  disabled={isSearching}
                >
                  {isSearching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div
          className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
          aria-label="Filter by confirmation status. Swipe left or right to switch sections."
          onTouchStart={event => { confirmationSwipeStart.current = event.changedTouches[0]?.clientX ?? null; }}
          onTouchEnd={event => finishConfirmationSwipe(event.changedTouches[0]?.clientX ?? 0)}
        >
          <Tabs value={confirmationFilter} onValueChange={value => setConfirmationFilter(value as typeof confirmationFilter)}>
            <TabsList className="h-10 w-max min-w-full justify-start sm:min-w-0">
              <TabsTrigger value="all" className="gap-2">All orders <span className="text-xs text-muted-foreground">{confirmationCounts.all}</span></TabsTrigger>
              <TabsTrigger value="confirmed" className="gap-2">Confirmed <span className="text-xs text-muted-foreground">{confirmationCounts.confirmed}</span></TabsTrigger>
              <TabsTrigger value="unconfirmed" className="gap-2">Unconfirmed <span className="text-xs text-muted-foreground">{confirmationCounts.unconfirmed}</span></TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Mobile Search Button */}
        <div className="sm:hidden flex gap-2">
          <Button
            variant="outline"
            onClick={() => setSearchModalOpen(true)}
            className="flex-1 gap-2 h-12 justify-start text-muted-foreground"
            disabled={isSearching}
          >
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            <span>Search orders...</span>
          </Button>
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'table' | 'card')} className="w-auto">
            <TabsList className="grid w-full grid-cols-2 h-12">
              <TabsTrigger value="table" className="gap-2">
                <List className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="card" className="gap-2">
                <LayoutGrid className="h-4 w-4" />
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <Deferred data="orders" fallback={<StkOrdersSkeleton />}>
        {() => <>
        {/* Orders Display */}
        {filteredOrders.length === 0 ? (
          <Card className="rounded-none">
            <CardContent className="flex flex-col items-center justify-center py-12 sm:py-16 text-center">
              <Package className="h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground mb-4" />
              <h3 className="text-base sm:text-lg font-semibold mb-2">No orders found</h3>
              <p className="text-sm text-muted-foreground">Try adjusting your search filters</p>
            </CardContent>
          </Card>
        ) : viewMode === 'table' ? (
          /* Table View */
          <Card className="overflow-hidden rounded-none">
            <div className="overflow-x-auto">
              {/* Desktop Table */}
              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]"></TableHead>
                      <TableHead className="w-[120px]">Order #</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead className="text-right w-[180px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map((order, index) => {
                      const isPaying = payingOrders.has(order.id);
                      const confirmationBadge = getConfirmationBadge(order.confirmed);
                      return (
                        <TableRow
                          key={order.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, index)}
                          onDragOver={(e) => handleDragOver(e, index)}
                          onDragEnd={handleDragEnd}
                          className={cn(
                            'cursor-move',
                            draggedIndex === index && 'opacity-50',
                          )}
                        >
                          <TableCell className="cursor-grab active:cursor-grabbing">
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <span>{order.order_no}</span>
                                {confirmationBadge && (
                                  <Badge className={`${confirmationBadge.className} text-[10px] px-1.5 py-0`}>
                                    {confirmationBadge.label}
                                  </Badge>
                                )}
                              </div>
                              {order.cc_email && (
                                <span className="text-xs text-muted-foreground">{order.cc_email}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">{order.client_name}</span>
                              {order.address && <span className="text-xs text-muted-foreground truncate max-w-[200px]">{order.address}</span>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span>{order.product_name}</span>
                              {order.delivery_date && <span className="text-xs text-muted-foreground">{order.delivery_date}</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{order.quantity}</TableCell>
                          <TableCell className="text-right font-semibold">KES {order.amount.toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`${getStatusColor(order.status)} border`}>
                              {order.status || 'Unknown'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Input
                              value={phoneNumbers[order.id] ?? order.phone}
                              onChange={e => setPhoneNumbers(prev => ({ ...prev, [order.id]: e.target.value }))}
                              placeholder="254XXXXXXXXX"
                              className="h-8 w-[140px]"
                              disabled={isPaying}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  onClick={() => window.location.href = `tel:${phoneNumbers[order.id] ?? order.phone}`}
                                  className="h-8 w-8 p-0 bg-success hover:bg-success"
                                  title="Call"
                                  disabled={isPaying}
                                >
                                  <PhoneCall className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => payOrder(order)}
                                  className="h-8 w-8 p-0"
                                  title="Pay Now"
                                  disabled={isPaying}
                                >
                                  {isPaying ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Smartphone className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingOrder(order)}
                                  className="h-8 w-8 p-0"
                                  title="Edit"
                                  disabled={isPaying}
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile/Tablet Expandable Table */}
              <div className="lg:hidden">
                <Table containerClassName="overflow-x-hidden" className="w-full table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-7 px-1"></TableHead>
                      <TableHead className="w-7 px-1"></TableHead>
                      <TableHead className="px-1">Order</TableHead>
                      <TableHead className="w-[82px] px-1 text-right">Amount</TableHead>
                      <TableHead className="w-[78px] px-1">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map((order, index) => {
                      const isPaying = payingOrders.has(order.id);
                      const isSavingConfirmation = savingConfirmations.has(order.id);
                      const confirmationBadge = getConfirmationBadge(order.confirmed);
                      return (
                        <React.Fragment key={order.id}>
                          <TableRow
                            draggable
                            onDragStart={(e) => handleDragStart(e, index)}
                            onDragOver={(e) => handleDragOver(e, index)}
                            onDragEnd={handleDragEnd}
                            className={cn(
                              draggedIndex === index && 'opacity-50',
                            )}
                          >
                            <TableCell className="w-7 cursor-grab px-1 active:cursor-grabbing">
                              <GripVertical className="h-4 w-4 text-muted-foreground" />
                            </TableCell>
                            <TableCell className="w-7 cursor-pointer px-1" onClick={() => toggleRowExpansion(order.id)}>
                              {expandedRows.has(order.id) ?
                                <ChevronUp className="h-4 w-4" /> :
                                <ChevronDown className="h-4 w-4" />
                              }
                            </TableCell>
                            <TableCell onClick={() => toggleRowExpansion(order.id)} className="min-w-0 cursor-pointer px-1">
                              <div className="flex min-w-0 flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <span className="block truncate font-medium text-sm">{order.order_no}</span>
                                </div>
                                {confirmationBadge && (
                                  <Badge className={`w-fit ${confirmationBadge.className} text-[10px] px-1.5 py-0`}>
                                    {confirmationBadge.label}
                                  </Badge>
                                )}
                                <span className="block truncate text-xs text-muted-foreground">{order.client_name}</span>
                              </div>
                            </TableCell>
                            <TableCell onClick={() => toggleRowExpansion(order.id)} className="w-[82px] cursor-pointer whitespace-nowrap px-1 text-right font-semibold text-[11px]">
                              KES {order.amount.toLocaleString()}
                            </TableCell>
                            <TableCell onClick={() => toggleRowExpansion(order.id)} className="w-[78px] cursor-pointer px-1">
                              <Badge variant="outline" className={`${getStatusColor(order.status)} block max-w-full truncate border px-1 text-[10px]`}>
                                {order.status || 'Unknown'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                          {expandedRows.has(order.id) && (
                            <TableRow>
                              <TableCell colSpan={5} className="bg-muted/50 p-4">
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between gap-3 border-b pb-3">
                                    <div className="min-w-0">
                                      <Label htmlFor={`mobile-confirmation-${order.id}`} className="text-sm font-medium">Order confirmed</Label>
                                      <p className="text-xs text-muted-foreground">Toggle to update this order.</p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                      {isSavingConfirmation && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Saving confirmation" />}
                                      <Switch
                                        id={`mobile-confirmation-${order.id}`}
                                        checked={Number(order.confirmed) === 1}
                                        onCheckedChange={checked => updateConfirmation(order, checked)}
                                        disabled={isSavingConfirmation}
                                      />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div>
                                      <span className="text-muted-foreground text-xs">Product:</span>
                                      <p className="font-medium">{order.product_name}</p>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground text-xs">Quantity:</span>
                                      <p className="font-medium">{order.quantity}</p>
                                    </div>
                                    {order.address && (
                                      <div className="col-span-2">
                                        <span className="text-muted-foreground text-xs">Address:</span>
                                        <p className="font-medium text-xs">{order.address}</p>
                                      </div>
                                    )}
                                    {order.delivery_date && (
                                      <div className="col-span-2">
                                        <span className="text-muted-foreground text-xs">Delivery:</span>
                                        <p className="font-medium">{order.delivery_date}</p>
                                      </div>
                                    )}
                                    {order.cc_email && (
                                      <div className="col-span-2">
                                        <span className="text-muted-foreground text-xs">CC Email:</span>
                                        <p className="font-medium break-all">{order.cc_email}</p>
                                      </div>
                                    )}
                                  </div>
                                  <Separator />
                                  <div className="space-y-2">
                                    <Label htmlFor={`phone-mobile-${order.id}`} className="text-xs">M-Pesa Phone</Label>
                                    <Input
                                      id={`phone-mobile-${order.id}`}
                                      value={phoneNumbers[order.id] ?? order.phone}
                                      onChange={e => setPhoneNumbers(prev => ({ ...prev, [order.id]: e.target.value }))}
                                      placeholder="254XXXXXXXXX"
                                      className="h-9"
                                      disabled={isPaying}
                                    />
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      onClick={() => window.location.href = `tel:${phoneNumbers[order.id] ?? order.phone}`}
                                      className="h-10 w-10 p-0 bg-success hover:bg-success flex-shrink-0"
                                      disabled={isPaying}
                                    >
                                      <PhoneCall className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={() => payOrder(order)}
                                      className="flex-1 gap-2 h-10"
                                      disabled={isPaying}
                                    >
                                      {isPaying ? (
                                        <>
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                          Processing...
                                        </>
                                      ) : (
                                        <>
                                          <Smartphone className="h-4 w-4" />
                                          Pay Now
                                        </>
                                      )}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setEditingOrder(order)}
                                      className="h-10 w-10 p-0 flex-shrink-0"
                                      disabled={isPaying}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </Card>
        ) : (
          /* Card View */
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredOrders.map((order, index) => {
              const isPaying = payingOrders.has(order.id);
              const isSavingConfirmation = savingConfirmations.has(order.id);
              const confirmationBadge = getConfirmationBadge(order.confirmed);
              return (
                <Card
                  key={order.id}
                  className={cn(
                    'rounded-none hover:shadow-lg transition-shadow duration-200',
                    draggedIndex === index && 'opacity-50',
                  )}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                >
                  {isSavingConfirmation ? (
                    <CardContent className="space-y-4 py-5" role="status" aria-label={`Saving confirmation for ${order.order_no}`}>
                      <Skeleton className="h-5 w-2/3" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-9 w-full" />
                    </CardContent>
                  ) : <>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="cursor-grab active:cursor-grabbing flex-shrink-0 pt-1">
                        <GripVertical className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="space-y-1 flex-1 min-w-0">
                        <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                          <Hash className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                          <span className="truncate">{order.order_no}</span>
                        </CardTitle>
                        {order.cc_email && (
                          <p className="text-xs text-muted-foreground truncate">{order.cc_email}</p>
                        )}
                        {confirmationBadge && (
                          <Badge className={`w-fit ${confirmationBadge.className} text-[10px] px-1.5 py-0`}>
                            {confirmationBadge.label}
                          </Badge>
                        )}
                        <CardDescription className="flex items-center gap-1.5 text-xs">
                          <User className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
                          <span className="truncate">{order.client_name}</span>
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className={`${getStatusColor(order.status)} border flex-shrink-0 text-xs`}>
                        {order.status || 'Unknown'}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-2 sm:space-y-3">
                    <div className="flex items-start gap-2 text-xs sm:text-sm">
                      <Package className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{order.product_name}</div>
                        <div className="text-muted-foreground flex items-center gap-1">
                          <ShoppingCart className="h-3 w-3" />
                          Qty: {order.quantity}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs sm:text-sm">
                      <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-semibold text-base sm:text-lg">KES {order.amount.toLocaleString()}</span>
                    </div>

                    {order.address && (
                      <div className="flex items-start gap-2 text-xs sm:text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 mt-0.5 flex-shrink-0" />
                        <span className="truncate">{order.address}</span>
                      </div>
                    )}

                    {order.delivery_date && (
                      <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                        <span>{order.delivery_date}</span>
                      </div>
                    )}

                    <Separator />

                    <div className="space-y-2">
                      <Label htmlFor={`phone-${order.id}`} className="text-xs flex items-center gap-1.5">
                        <Phone className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                        M-Pesa Phone Number
                      </Label>
                      <Input
                        id={`phone-${order.id}`}
                        value={phoneNumbers[order.id] ?? order.phone}
                        onChange={e => setPhoneNumbers(prev => ({ ...prev, [order.id]: e.target.value }))}
                        placeholder="254XXXXXXXXX"
                        className="h-8 sm:h-9"
                        disabled={isPaying}
                      />
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        onClick={() => window.location.href = `tel:${phoneNumbers[order.id] ?? order.phone}`}
                        className="flex-1 gap-2 h-9 bg-success hover:bg-success"
                        disabled={isPaying}
                      >
                        <PhoneCall className="h-4 w-4" />
                        Call
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => payOrder(order)}
                        className="flex-1 gap-2 h-9"
                        disabled={isPaying}
                      >
                        {isPaying ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Processing
                          </>
                        ) : (
                          <>
                            <Smartphone className="h-4 w-4" />
                            Pay
                          </>
                        )}
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingOrder(order)}
                        className="flex-1 h-9"
                        disabled={isPaying}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                  </>}
                </Card>
              );
            })}
          </div>
        )}
        {orders.last_page > 1 && (
          <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Showing {(orders.current_page - 1) * orders.per_page + 1}–{Math.min(orders.current_page * orders.per_page, orders.total)} of {orders.total} orders
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => goToPage(orders.current_page - 1)} disabled={orders.current_page <= 1}>
                Previous
              </Button>
              <span className="min-w-20 text-center text-xs text-muted-foreground">Page {orders.current_page} of {orders.last_page}</span>
              <Button variant="outline" size="sm" onClick={() => goToPage(orders.current_page + 1)} disabled={orders.current_page >= orders.last_page}>
                Next
              </Button>
            </div>
          </div>
        )}
        </>}
        </Deferred>
      </div>

      {/* Edit Modal */}
      <Dialog open={!!editingOrder} onOpenChange={open => !open && closeEditOrder()}>
        <DialogContent className="sm:max-w-md max-w-[95vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Edit className="h-4 w-4 sm:h-5 sm:w-5" />
              Edit Order
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Update comments here. On smaller screens, change confirmation from the expanded order details.
            </DialogDescription>
          </DialogHeader>
          {editingOrder && (
            <div className="space-y-3 sm:space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="comments" className="flex items-center gap-2 text-xs sm:text-sm">
                  <MessageSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  Comments
                </Label>
                <textarea
                  id="comments"
                  value={editingOrder.comments || ''}
                  onChange={e => setEditingOrder({ ...editingOrder, comments: e.target.value })}
                  placeholder="Enter comments..."
                  className="w-full min-h-[100px] px-3 py-2 text-sm border border-input rounded-md bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                  rows={4}
                  disabled={isSaving}
                />
              </div>
              <div className="hidden items-center justify-between gap-3 border bg-muted/40 p-3 lg:flex">
                <div className="space-y-0.5">
                  <Label htmlFor="order-confirmation" className="text-sm font-medium">Order confirmed</Label>
                  <p className="text-xs text-muted-foreground">Save to apply this change.</p>
                </div>
                <Switch
                  id="order-confirmation"
                  checked={Number(editingOrder.confirmed) === 1}
                  onCheckedChange={checked => setEditingOrder({ ...editingOrder, confirmed: checked ? 1 : 0 })}
                  disabled={isSaving}
                />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={closeEditOrder}
              size="sm"
              className="h-9"
              disabled={isSaving}
            >
              Close
            </Button>
            <Button
              onClick={handleEditSave}
              size="sm"
              className="h-9 gap-2"
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Comments'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mobile Search Modal */}
      <Dialog open={searchModalOpen} onOpenChange={setSearchModalOpen}>
        <DialogContent className="sm:max-w-md max-w-[95vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search Orders
            </DialogTitle>
            <DialogDescription>
              Filter by order number, name, or phone
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="mobile-search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="mobile-search"
                  placeholder="Search orders..."
                  value={searchValue}
                  onChange={e => setSearchValue(e.target.value)}
                  className="pl-9 h-10"
                  disabled={isSearching}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      handleSearch();
                      setSearchModalOpen(false);
                    }
                  }}
                />
              </div>
            </div>
            {showAgentFilter && (
              <div className="space-y-2">
                <Label>Agent</Label>
                <Popover open={mobileAgentPopoverOpen} onOpenChange={setMobileAgentPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between"
                    >
                      <span className="truncate">{selectedAgent || 'Filter by agent'}</span>
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="z-[60] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search agent..." />
                      <CommandList>
                        <CommandGroup>
                          <CommandItem
                            value="all-agents-mobile"
                            onSelect={() => {
                              setSelectedAgent('');
                              setMobileAgentPopoverOpen(false);
                            }}
                          >
                            All agents
                          </CommandItem>
                          {agents.map((agent) => (
                            <CommandItem
                              key={agent.id}
                              value={agent.name}
                              onSelect={() => {
                                setSelectedAgent(agent.name);
                                setMobileAgentPopoverOpen(false);
                              }}
                              className={cn(selectedAgent === agent.name && 'bg-accent')}
                            >
                              {agent.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            <div className="space-y-2">
              <Label>Call Center User</Label>
              <Popover open={mobileCcPopoverOpen} onOpenChange={setMobileCcPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between"
                  >
                    <span className="truncate">
                      {selectedCcName
                        ? callCenterUsers.find((user) => user.name === selectedCcName)?.name || selectedCcName
                        : 'Filter by call center user'}
                    </span>
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="z-[60] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search call center user..." />
                    <CommandList>
                      <CommandGroup>
                        <CommandItem
                            value="all-call-center-users-mobile"
                          onSelect={() => {
                            setSelectedCcName('');
                              setMobileCcPopoverOpen(false);
                          }}
                        >
                          All call center users
                        </CommandItem>
                        {callCenterUsers.map((user) => (
                          <CommandItem
                            key={user.id}
                            value={`${user.name} ${user.email}`}
                            onSelect={() => {
                              setSelectedCcName(user.name);
                              setMobileCcPopoverOpen(false);
                            }}
                            className={cn(selectedCcName === user.name && 'bg-accent')}
                          >
                            {user.name} ({user.email})
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Delivery date range</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !deliveryDateRange?.from && 'text-muted-foreground'
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {deliveryDateRange?.from ? (
                      deliveryDateRange.to ? (
                        <>
                          {format(deliveryDateRange.from, 'LLL dd, y')} - {format(deliveryDateRange.to, 'LLL dd, y')}
                        </>
                      ) : (
                        format(deliveryDateRange.from, 'LLL dd, y')
                      )
                    ) : (
                      <span>Delivery date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <DateRangeCalendar
                    initialFocus
                    mode="range"
                    defaultMonth={deliveryDateRange?.from}
                    selected={deliveryDateRange}
                    onSelect={setDeliveryDateRange}
                    numberOfMonths={1}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => {
                handleSearch();
                setSearchModalOpen(false);
              }}
              className="gap-2 h-10 w-full"
              disabled={isSearching}
            >
              {isSearching ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Search
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                handleClearSearch();
                setSearchModalOpen(false);
              }}
              className="gap-2 h-10 w-full"
              disabled={isSearching}
            >
              {isSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <X className="h-4 w-4" />
              )}
              Clear Search
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
