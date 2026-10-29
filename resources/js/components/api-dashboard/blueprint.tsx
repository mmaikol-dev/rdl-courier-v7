import { cn } from '@/lib/utils';
import * as React from 'react';

export function DashboardHeader({ title, summary, className }: { title: string; summary: string; className?: string }) {
    return <header className={cn('space-y-1', className)}><h1 className="text-xl font-semibold tracking-tight">{title}</h1><p className="max-w-3xl text-sm text-muted-foreground">{summary}</p></header>;
}

export function Panel({ children, className, ...props }: React.HTMLAttributes<HTMLElement>) {
    return <section className={cn('blueprint-panel relative rounded-xl border bg-card text-card-foreground', className)} {...props}>
        <span aria-hidden="true" className="blueprint-crosshair -left-1.5 -top-1.5">+</span>
        <span aria-hidden="true" className="blueprint-crosshair -right-1.5 -top-1.5">+</span>
        <span aria-hidden="true" className="blueprint-crosshair -bottom-1.5 -left-1.5">+</span>
        <span aria-hidden="true" className="blueprint-crosshair -bottom-1.5 -right-1.5">+</span>
        {children}
    </section>;
}

export function SplitLayout({ main, inspector, className }: { main: React.ReactNode; inspector: React.ReactNode; className?: string }) {
    return <div className={cn('grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(280px,1fr)]', className)}><div className="min-w-0">{main}</div><div className="min-w-0">{inspector}</div></div>;
}

export function ControlStrip({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
    return <div className={cn('flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between', className)}><span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span><div className="min-w-0">{children}</div></div>;
}

export function Slider({ label, value, min, max, onChange, formatValue = (current) => String(current), className }: {
    label: string; value: number; min: number; max: number; onChange: (value: number) => void; formatValue?: (value: number) => string; className?: string;
}) {
    const fill = ((value - min) / (max - min)) * 100;
    return <label className={cn('grid min-w-56 grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2', className)}>
        <span className="text-sm">{label}</span><output className="font-mono text-xs tabular-nums text-muted-foreground">{formatValue(value)}</output>
        <input aria-label={label} className="blueprint-slider col-span-2 h-4 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="range" min={min} max={max} value={value} style={{ '--slider-fill': `${fill}%` } as React.CSSProperties} onChange={(event) => onChange(Number(event.target.value))} />
    </label>;
}

export function SegmentedChips<T extends string>({ label, values, value, onChange, className }: { label: string; values: readonly T[]; value: T; onChange: (value: T) => void; className?: string }) {
    return <div className={cn('flex flex-wrap items-center gap-1.5', className)} role="radiogroup" aria-label={label}>
        {values.map((item) => <button key={item} type="button" role="radio" aria-checked={value === item} onClick={() => onChange(item)} className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', value === item ? 'border-foreground bg-foreground text-background' : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground')}>{item}</button>)}
    </div>;
}

export function Footnote({ children, className }: { children: React.ReactNode; className?: string }) {
    return <p className={cn('border-t px-4 py-3 text-xs leading-relaxed text-muted-foreground', className)}>{children}</p>;
}

export function Inspector({ title, subtitle, rows, summary, children, className }: { title: string; subtitle: string; rows: Array<{ label: string; value: React.ReactNode }>; summary: string; children?: React.ReactNode; className?: string }) {
    return <Panel className={cn('h-full', className)}>
        <div className="border-b px-4 py-4"><h2 className="truncate font-mono text-sm font-semibold">{title}</h2><p className="mt-1 text-xs text-muted-foreground">{subtitle}</p></div>
        {children && <div className="px-4 py-4">{children}</div>}
        <dl className="px-4">{rows.map((row) => <div key={row.label} className="flex items-start justify-between gap-4 border-b py-2.5 text-sm last:border-0"><dt className="text-muted-foreground">{row.label}</dt><dd className="text-right font-mono text-xs tabular-nums">{row.value}</dd></div>)}</dl>
        <p className="border-t px-4 py-4 text-sm leading-relaxed text-muted-foreground">{summary}</p>
    </Panel>;
}

export function SelectableRows({ items, selected, onSelect, getLabel, className }: { items: string[]; selected: number; onSelect: (index: number) => void; getLabel?: (item: string, index: number) => React.ReactNode; className?: string }) {
    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'ArrowDown') { event.preventDefault(); onSelect(Math.min(selected + 1, items.length - 1)); }
        if (event.key === 'ArrowUp') { event.preventDefault(); onSelect(Math.max(selected - 1, 0)); }
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(selected); }
    };

    return <div role="listbox" aria-label="Selectable dashboard rows" tabIndex={0} onKeyDown={handleKeyDown} className={cn('space-y-1 outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}>
        {items.map((item, index) => <div key={`${item}-${index}`} role="option" aria-selected={selected === index} tabIndex={-1} onClick={() => onSelect(index)} className={cn('cursor-pointer rounded-lg border border-transparent px-3 py-2 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', selected === index && 'border-border bg-accent text-accent-foreground')}>
            {getLabel ? getLabel(item, index) : <span className="font-mono">{item}</span>}
        </div>)}
    </div>;
}
