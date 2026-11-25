import { Link, router } from '@inertiajs/react';
import { format } from 'date-fns';
import { CalendarDays, Check, FileInput, Globe2, Plus, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Blobatar } from '@blobatar/react';
import 'blobatar/motion.css';
import type { DashboardRange } from '@/types/dashboard';
import type { LucideIcon } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import * as React from 'react';

interface PageHeaderProps {
    userName: string;
    range: DashboardRange;
    dateFrom?: string | null;
    dateTo?: string | null;
    country: string | null;
    countryLabel: string;
    product: string | null;
    countryOptions: string[];
    productOptions: string[];
    canFilterCountries: boolean;
    isAgent: boolean;
    isLoading: boolean;
}

const rangeOptions: { value: DashboardRange; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: 'last7Days', label: 'Last 7 days' },
    { value: 'last30Days', label: 'Last 30 days' },
    { value: 'thisMonth', label: 'This month' },
    { value: 'allTime', label: 'All time' },
    { value: 'custom', label: 'Custom range' },
];

function FilterCommandSelect({
    label,
    placeholder,
    value,
    options,
    icon: Icon,
    isLoading,
    onChange,
}: {
    label: string;
    placeholder: string;
    value: string;
    options: Array<{ value: string; label: string }>;
    icon: LucideIcon;
    isLoading: boolean;
    onChange: (value: string) => void;
}) {
    const [open, setOpen] = React.useState(false);
    const selectedLabel = options.find((option) => option.value === value)?.label ?? placeholder;

    React.useEffect(() => {
        if (!isLoading) setOpen(false);
    }, [isLoading]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-label={label}
                    aria-expanded={open}
                    className="h-10 w-auto min-w-40 max-w-56 justify-start rounded-full bg-background font-normal"
                >
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    <span className="truncate">{selectedLabel}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-56 p-0">
                <Command>
                    <CommandInput placeholder={`Search ${label.toLowerCase()}...`} />
                    <CommandList>
                        {isLoading ? (
                            <div className="space-y-2 p-2" aria-label={`Loading ${label.toLowerCase()} options`}>
                                {Array.from({ length: 4 }).map((_, index) => (
                                    <Skeleton key={index} className="h-8 w-full" />
                                ))}
                            </div>
                        ) : (
                            <>
                                <CommandEmpty>No options found.</CommandEmpty>
                                <CommandGroup>
                                    {options.map((option) => (
                                        <CommandItem
                                            key={option.value}
                                            value={option.label}
                                            onSelect={() => {
                                                onChange(option.value);
                                            }}
                                        >
                                            <Check className={value === option.value ? 'opacity-100' : 'opacity-0'} />
                                            <span className="truncate">{option.label}</span>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

function greeting(): string {
    const hour = new Date().getHours();

    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';

    return 'evening';
}

function parseDate(value?: string | null): Date | undefined {
    if (!value) return undefined;
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return undefined;
    const date = new Date(y, m - 1, d);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

function toDateParam(date?: Date): string {
    return date ? format(date, 'yyyy-MM-dd') : '';
}

function dateText(range: DashboardRange, dateFrom?: string | null, dateTo?: string | null): string {
    if (range === 'allTime') return 'All time';
    if (range === 'custom') {
        const from = parseDate(dateFrom);
        const to = parseDate(dateTo);
        if (from && to) return `${format(from, 'd MMM')} – ${format(to, 'd MMM')}`;
        return 'Custom range';
    }

    const end = new Date();
    const start = new Date(end);

    if (range === 'today') {
        return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(end);
    }

    if (range === 'last7Days') start.setDate(start.getDate() - 6);
    if (range === 'last30Days') start.setDate(start.getDate() - 29);
    if (range === 'thisMonth') start.setDate(1);

    const formatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

    return `${formatter.format(start)} – ${formatter.format(end)}`;
}

export function PageHeader({
    userName,
    range,
    dateFrom,
    dateTo,
    country,
    countryLabel,
    product,
    countryOptions,
    productOptions,
    canFilterCountries,
    isAgent,
    isLoading,
}: PageHeaderProps) {
    const firstName = userName.trim().split(/\s+/)[0] || 'there';
    const [customOpen, setCustomOpen] = React.useState(false);
    const [customRange, setCustomRange] = React.useState<DateRange | undefined>(() => {
        const from = parseDate(dateFrom);
        const to = parseDate(dateTo);
        return from && to ? { from, to } : undefined;
    });

    React.useEffect(() => {
        const from = parseDate(dateFrom);
        const to = parseDate(dateTo);
        setCustomRange(from && to ? { from, to } : undefined);
    }, [dateFrom, dateTo]);

    const rangeLabel = range === 'custom' ? dateText('custom', dateFrom, dateTo) : rangeOptions.find((option) => option.value === range)?.label ?? 'Last 30 days';
    const subtitle = [range === 'custom' ? 'Custom range' : rangeLabel, dateText(range, dateFrom, dateTo), countryLabel, product].filter(Boolean).join(' · ');

    function updateFilters(next: Partial<{ range: DashboardRange; country: string; product: string; date_from: string; date_to: string }>) {
        const filters = {
            range,
            country: country ?? '',
            product: product ?? '',
            date_from: dateFrom ?? '',
            date_to: dateTo ?? '',
            ...next,
        };
        const params: Record<string, string> = { range: filters.range };

        if (filters.range === 'custom') {
            if (filters.date_from) params.date_from = filters.date_from;
            if (filters.date_to) params.date_to = filters.date_to;
        }
        if (filters.country) params.country = filters.country;
        if (filters.product) params.product = filters.product;

        router.get('/dashboard', params, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
        });
    }

    return (
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="flex min-w-0 items-center gap-3">
                <Blobatar
                    name={userName || 'dashboard'}
                    size={56}
                    animate="always"
                    background="circle"
                    title={userName || 'Dashboard'}
                    className="size-14 shrink-0 rounded-full ring-2 ring-background"
                />
                <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Company overview
                    </p>
                    <h1 className="mt-1 text-3xl font-bold tracking-tight">
                        Good {greeting()}, {firstName}
                    </h1>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {subtitle}. Every figure opens the records behind it.
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Popover open={customOpen} onOpenChange={setCustomOpen}>
                    <PopoverAnchor asChild>
                        <div>
                            <FilterCommandSelect
                                label="Date range"
                                placeholder="Last 30 days"
                                value={range}
                                options={rangeOptions}
                                icon={CalendarDays}
                                isLoading={isLoading}
                                onChange={(value) => {
                                    const nextRange = value as DashboardRange;
                                    if (nextRange === 'custom') {
                                        setCustomOpen(true);
                                        return;
                                    }
                                    setCustomOpen(false);
                                    updateFilters({ range: nextRange, date_from: '', date_to: '' });
                                }}
                            />
                        </div>
                    </PopoverAnchor>
                    <PopoverContent align="start" className="w-auto p-3">
                        <div className="space-y-3">
                            <Calendar
                                initialFocus
                                mode="range"
                                defaultMonth={customRange?.from ?? parseDate(dateFrom)}
                                selected={customRange}
                                onSelect={setCustomRange}
                                numberOfMonths={2}
                            />
                            <div className="flex items-center justify-end gap-2">
                                <Button type="button" variant="ghost" size="sm" onClick={() => setCustomOpen(false)}>
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={!customRange?.from || !customRange?.to}
                                    onClick={() => {
                                        if (!customRange?.from || !customRange?.to) return;
                                        updateFilters({
                                            range: 'custom',
                                            date_from: toDateParam(customRange.from),
                                            date_to: toDateParam(customRange.to),
                                        });
                                        setCustomOpen(false);
                                    }}
                                >
                                    Apply
                                </Button>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>

                {!isAgent && <FilterCommandSelect
                    label="Product filter"
                    placeholder="All products"
                    value={product ?? 'all'}
                    options={[
                        { value: 'all', label: 'All products' },
                        ...productOptions.map((option) => ({ value: option, label: option })),
                    ]}
                    icon={Tag}
                    isLoading={isLoading}
                    onChange={(value) => updateFilters({ product: value === 'all' ? '' : value })}
                />}

                {canFilterCountries && (
                    <FilterCommandSelect
                        label="Country filter"
                        placeholder="All countries"
                        value={country ?? 'all'}
                        options={[
                            { value: 'all', label: 'All countries' },
                            ...countryOptions.map((option) => ({ value: option, label: option })),
                        ]}
                        icon={Globe2}
                        isLoading={isLoading}
                        onChange={(value) => updateFilters({ country: value === 'all' ? '' : value })}
                    />
                )}

                {!isAgent && <Button asChild className="h-10 rounded-full">
                    <Link href="/sheetorders/create">
                        <Plus aria-hidden="true" />
                        New order
                    </Link>
                </Button>}
                {!isAgent && <Button asChild variant="outline" className="h-10 rounded-full">
                    <Link href="/import">
                        <FileInput aria-hidden="true" />
                        Import orders
                    </Link>
                </Button>}
            </div>
        </header>
    );
}
