'use client';

import { Head, router, usePage } from '@inertiajs/react';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { type DateRange } from 'react-day-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem } from '@/types';
import {
  ArrowLeftFromLine,
  ArrowRightFromLine,
  Camera,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  History,
  LoaderCircle,
  ScanLine,
  Search,
  XCircle,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

const breadcrumbs: BreadcrumbItem[] = [
  { title: 'Dashboard', href: '/dashboard' },
  { title: 'QR Scan Out', href: '/order-scans' },
];

interface OrderScan {
  id: number;
  order_no: string;
  product_name: string | null;
  quantity: number | null;
  scan_type: string;
  scanned_by: string | null;
  scanned_at: string | null;
}

interface PendingScan {
  order_no: string;
  scan_type: string;
  product_name: string;
  quantity: number | undefined;
}

interface PageProps {
  scans: {
    data: OrderScan[];
    current_page: number;
    last_page: number;
    total: number;
  };
  filters: {
    search: string | null;
    date_from: string | null;
    date_to: string | null;
  };
}

export default function OrderScansPage() {
  const { scans, filters } = usePage<PageProps>().props;
  const [search, setSearch] = React.useState(filters.search ?? '');
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(
    filters.date_from || filters.date_to
      ? { from: filters.date_from ? new Date(filters.date_from) : undefined, to: filters.date_to ? new Date(filters.date_to) : undefined }
      : undefined,
  );
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const searchTimeout = React.useRef<ReturnType<typeof setTimeout>>();

  const applyFilters = React.useCallback((overrides: Record<string, string | undefined>) => {
    clearTimeout(searchTimeout.current);
    router.get('/order-scans', {
      search: overrides.search ?? (search || undefined),
      date_from: overrides.date_from,
      date_to: overrides.date_to,
      page: undefined,
    }, { preserveState: true, preserveScroll: true });
  }, [search]);

  const handleSearch = React.useCallback((value: string) => {
    setSearch(value);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      applyFilters({ search: value || undefined });
    }, 400);
  }, [applyFilters]);

  const [scanType, setScanType] = React.useState('out');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [cameraReady, setCameraReady] = React.useState(false);
  const [cameraError, setCameraError] = React.useState(false);
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const [lastScan, setLastScan] = React.useState<string | null>(null);
  const [pendingScan, setPendingScan] = React.useState<PendingScan | null>(null);
  const [reason, setReason] = React.useState('');
  const [isReasonSubmitting, setIsReasonSubmitting] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const scannerRef = React.useRef<any>(null);
  const scanningRef = React.useRef(false);
  const cooldownRef = React.useRef(false);
  const scanTypeRef = React.useRef(scanType);

  React.useEffect(() => {
    scanTypeRef.current = scanType;
  }, [scanType]);

  const submitScan = React.useCallback((
    orderNo: string,
    type: string,
    productName: string,
    qty: number | undefined,
    scanReason?: string,
  ) => {
    scanningRef.current = true;
    setIsSubmitting(true);

    router.post(
      '/order-scans',
      {
        order_no: orderNo,
        scan_type: type,
        product_name: productName,
        quantity: qty,
        reason: scanReason || '',
      },
      {
        preserveScroll: true,
        onSuccess: () => {
          setLastScan(orderNo);
          toast.success(`${orderNo} → ${type === 'out' ? 'OUT' : 'IN'}`);
          setTimeout(() => setLastScan(null), 2000);
        },
        onError: (errors) => {
          if (errors.needs_reason) {
            setPendingScan({ order_no: orderNo, scan_type: type, product_name: productName, quantity: qty });
            return;
          }
          const msg = Object.values(errors).find((v) => typeof v === 'string');
          toast.error(typeof msg === 'string' ? msg : 'Scan failed');
        },
        onFinish: () => {
          setIsSubmitting(false);
          scanningRef.current = false;
          cooldownRef.current = true;
          setTimeout(() => { cooldownRef.current = false; }, 1500);
        },
      },
    );
  }, []);

  const doScan = React.useCallback((raw: string) => {
    if (!raw.trim() || scanningRef.current || cooldownRef.current) return;

    const parts = raw.split('|').map((s) => s.trim());
    const orderNo = parts[0] || raw.trim();
    const currentType = scanTypeRef.current;

    submitScan(orderNo, currentType, parts[1] || '', parts[2] ? parseInt(parts[2], 10) || undefined : undefined);
  }, [submitScan]);

  const handleReasonSubmit = React.useCallback(() => {
    if (!pendingScan || !reason.trim()) {
      toast.error('Enter a reason to proceed.');
      return;
    }

    setIsReasonSubmitting(true);
    scanningRef.current = true;
    setIsSubmitting(true);

    router.post(
      '/order-scans',
      {
        order_no: pendingScan.order_no,
        scan_type: pendingScan.scan_type,
        product_name: pendingScan.product_name,
        quantity: pendingScan.quantity,
        reason: reason.trim(),
      },
      {
        preserveScroll: true,
        onSuccess: () => {
          setLastScan(pendingScan.order_no);
          toast.success(`${pendingScan.order_no} → ${pendingScan.scan_type === 'out' ? 'OUT' : 'IN'}`);
          setTimeout(() => setLastScan(null), 2000);
          setPendingScan(null);
          setReason('');
        },
        onError: (errors) => {
          const msg = Object.values(errors).find((v) => typeof v === 'string');
          toast.error(typeof msg === 'string' ? msg : 'Scan failed');
        },
        onFinish: () => {
          setIsSubmitting(false);
          setIsReasonSubmitting(false);
          scanningRef.current = false;
          cooldownRef.current = true;
          setTimeout(() => { cooldownRef.current = false; }, 1500);
        },
      },
    );
  }, [pendingScan, reason]);

  const startCamera = React.useCallback(async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch {}
      scannerRef.current = null;
    }

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('qr-scanner-container');
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText: string) => {
          doScan(decodedText);
        },
        () => {},
      );

      setCameraReady(true);
      setCameraError(false);
    } catch (e) {
      setCameraError(true);
      setCameraReady(false);
      toast.error('Camera access denied. Grant camera permission and reload.');
    }
  }, [doScan]);

  const openCamera = React.useCallback(() => {
    setCameraOpen(true);
    setTimeout(() => startCamera(), 50);
  }, [startCamera]);

  const closeCamera = React.useCallback(() => {
    if (scannerRef.current) {
      try { scannerRef.current.stop(); } catch {}
      scannerRef.current = null;
    }
    setCameraReady(false);
    setCameraError(false);
    setCameraOpen(false);
  }, []);

  React.useEffect(() => {
    return () => {
      if (scannerRef.current) {
        try { scannerRef.current.stop(); } catch {}
        scannerRef.current = null;
      }
    };
  }, []);

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="QR Scan Out" />

      <div className="flex min-h-dvh flex-col bg-background">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b bg-background/80 px-4 pb-3 pt-3 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ScanLine className="size-5 text-primary" />
              <span className="text-sm font-semibold">QR Scan</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {scans.total} scan{scans.total !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-xl bg-muted p-1">
            <button
              type="button"
              onClick={() => setScanType('out')}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold transition-all',
                scanType === 'out'
                  ? 'bg-destructive text-destructive-foreground shadow-sm'
                  : 'text-muted-foreground',
              )}
            >
              <ArrowRightFromLine className="size-3.5" />
              OUT
            </button>
            <button
              type="button"
              onClick={() => setScanType('in')}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold transition-all',
                scanType === 'in'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-muted-foreground',
              )}
            >
              <ArrowLeftFromLine className="size-3.5" />
              IN
            </button>
          </div>
        </div>

        {/* Scan button — if camera not open */}
        {!cameraOpen && (
          <div className="px-4 pb-3 pt-4">
            <button
              type="button"
              onClick={openCamera}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-primary px-4 py-4 text-base font-semibold text-primary-foreground shadow-lg transition-all active:scale-[0.98]"
            >
              <Camera className="size-5" />
              Open Scanner
            </button>
          </div>
        )}

        {/* Camera view — full view when open */}
        {cameraOpen && (
          <div className="px-4 pt-4">
            <div className="relative overflow-hidden rounded-xl bg-black">
              {/* Container always visible so html5-qrcode video renders properly */}
              <div
                id="qr-scanner-container"
                ref={containerRef}
                className="aspect-square w-full"
              />

              {cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black">
                  <XCircle className="size-10 text-destructive/60" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-destructive">Camera Unavailable</p>
                    <p className="px-6 text-xs text-muted-foreground">
                      Grant camera permission in your browser settings.
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={startCamera}>
                    Retry
                  </Button>
                </div>
              )}

              {/* Loading overlay sits on top of the container while camera starts */}
              {!cameraReady && !cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black">
                  <LoaderCircle className="size-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Starting camera...</p>
                </div>
              )}

              {cameraReady && (
                <div className="absolute left-3 top-3">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wider shadow-sm',
                      scanType === 'out'
                        ? 'bg-destructive/90 text-destructive-foreground'
                        : 'bg-emerald-600/90 text-white',
                    )}
                  >
                    {scanType === 'out' ? (
                      <ArrowRightFromLine className="size-3" />
                    ) : (
                      <ArrowLeftFromLine className="size-3" />
                    )}
                    {scanType === 'out' ? 'OUTBOUND' : 'INBOUND'}
                  </span>
                </div>
              )}

              {isSubmitting && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <div className="flex flex-col items-center gap-2">
                    <LoaderCircle className="size-8 animate-spin text-white" />
                    <span className="text-sm font-medium text-white">Processing...</span>
                  </div>
                </div>
              )}

              {lastScan && (
                <div className="absolute bottom-3 left-3 right-3 rounded-lg bg-black/70 px-3 py-2 text-center text-sm font-medium text-white backdrop-blur-sm">
                  <CheckCircle className="mr-1.5 inline size-4 text-emerald-400" />
                  {lastScan}
                </div>
              )}

              {cameraReady && !isSubmitting && (
                <div className="pointer-events-none absolute left-[15%] right-[15%] top-1/2 -translate-y-1/2">
                  <div className="h-[0.5px] animate-pulse rounded-full bg-primary shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                </div>
              )}
            </div>

            <p className="mt-2 text-center text-xs text-muted-foreground">
              Point camera at the waybill QR code to scan
            </p>

            <Button
              variant="outline"
              onClick={closeCamera}
              className="mt-3 w-full gap-2"
            >
              <XCircle className="size-4" />
              Close Scanner
            </Button>
          </div>
        )}

        {/* Search & Date Range */}
        <div className="mt-3 space-y-2 px-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by order no, product, or scanned by..."
              className="h-10 pl-9 text-sm"
            />
          </div>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'h-9 w-full justify-start gap-2 text-xs font-normal',
                  !dateRange && 'text-muted-foreground',
                )}
              >
                <CalendarIcon className="size-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, 'LLL dd, y')} – {format(dateRange.to, 'LLL dd, y')}
                    </>
                  ) : (
                    format(dateRange.from, 'LLL dd, y')
                  )
                ) : (
                  'Pick scan date range'
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={(range) => {
                  setDateRange(range);
                  if (range?.from && range?.to) {
                    setCalendarOpen(false);
                    applyFilters({
                      date_from: format(range.from, 'yyyy-MM-dd'),
                      date_to: format(range.to, 'yyyy-MM-dd'),
                    });
                  }
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Recent scans */}
        <div className="mt-2 flex-1 px-4 pb-6 pt-2">
          <div className="mb-3 flex items-center gap-2">
            <History className="size-4 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent Scans
            </span>
            <span className="ml-auto text-xs text-muted-foreground">
              Page {scans.current_page} of {scans.last_page}
            </span>
          </div>

          <div className="space-y-2">
            {scans.data.length === 0 ? (
              <div className="rounded-xl border border-dashed py-8 text-center text-xs text-muted-foreground">
                No scans yet
              </div>
            ) : (
              scans.data.map((scan) => (
                <div
                  key={scan.id}
                  className="flex items-center justify-between rounded-xl border px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="truncate text-sm font-medium">{scan.order_no}</p>
                    {scan.product_name && (
                      <p className="truncate text-xs text-muted-foreground">
                        {scan.product_name}
                      </p>
                    )}
                    <p className="mt-0.5 text-[10px] text-muted-foreground/60">
                      {scan.scanned_at
                        ? new Date(scan.scanned_at).toLocaleString()
                        : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {scan.quantity != null && (
                      <span className="text-xs text-muted-foreground">
                        x{scan.quantity}
                      </span>
                    )}
                    <Badge
                      variant={scan.scan_type === 'out' ? 'destructive' : 'default'}
                      className={cn(
                        'text-[10px]',
                        scan.scan_type === 'in' && 'bg-emerald-600 text-white',
                      )}
                    >
                      {scan.scan_type === 'out' ? 'OUT' : 'IN'}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          {scans.last_page > 1 && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={scans.current_page <= 1}
                onClick={() => router.get('/order-scans', { page: scans.current_page - 1, search: filters.search || undefined, date_from: filters.date_from || undefined, date_to: filters.date_to || undefined }, { preserveScroll: true })}
              >
                <ChevronLeft className="mr-1 size-4" />
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {scans.current_page} of {scans.last_page}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={scans.current_page >= scans.last_page}
                onClick={() => router.get('/order-scans', { page: scans.current_page + 1, search: filters.search || undefined, date_from: filters.date_from || undefined, date_to: filters.date_to || undefined }, { preserveScroll: true })}
              >
                Next
                <ChevronRight className="ml-1 size-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Reason dialog */}
      <Dialog
        open={pendingScan !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingScan(null);
            setReason('');
            scanningRef.current = false;
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Re-Scan Required</DialogTitle>
            <DialogDescription>
              Order <strong>{pendingScan?.order_no}</strong> was already scanned as{' '}
              <strong>{pendingScan?.scan_type === 'out' ? 'OUT' : 'IN'}</strong>.
              Enter a reason to scan it again.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you re-scanning this order?"
            rows={3}
            autoFocus
            className="mt-2"
          />

          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setPendingScan(null);
                setReason('');
                scanningRef.current = false;
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleReasonSubmit}
              disabled={isReasonSubmitting || !reason.trim()}
            >
              {isReasonSubmitting ? (
                <LoaderCircle className="mr-2 size-4 animate-spin" />
              ) : null}
              Scan Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
