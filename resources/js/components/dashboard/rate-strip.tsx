import { Link } from '@inertiajs/react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';

export interface RateStripItem {
    label: string;
    value: string | number | null;
    icon: LucideIcon;
    href: string;
}

interface RateStripProps {
    items: RateStripItem[];
}

export function RateStrip({ items }: RateStripProps) {
    return (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            {items.map(({ label, value, icon: Icon, href }) => (
                <div key={label} className="rounded-2xl border border-dashed border-border p-1">
                    <Link
                        href={href}
                        className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        aria-label={`${label}: ${value ?? 'not tracked'}`}
                    >
                        <Card className="min-w-0 rounded-xl border-0 bg-card p-3 shadow-none transition-colors hover:bg-accent/50">
                            <div className="flex min-w-0 items-start gap-2">
                                <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                                <p className="min-w-0 break-words text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    {label}
                                </p>
                            </div>
                            <p className="mt-2 min-w-0 break-words text-[clamp(1rem,1.2vw,1.125rem)] leading-tight font-bold tracking-tight tabular-nums [overflow-wrap:anywhere]">{value ?? '—'}</p>
                        </Card>
                    </Link>
                </div>
            ))}
        </div>
    );
}
