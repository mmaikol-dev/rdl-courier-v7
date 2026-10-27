import { Link } from '@inertiajs/react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkline } from '@/components/dashboard/sparkline';

export type KpiVariant = 'default' | 'featured' | 'highlight';

interface KpiCardProps {
    label: string;
    value: string | number | null;
    helper: string;
    icon: LucideIcon;
    href: string;
    variant?: KpiVariant;
    sparkline?: number[];
}

export function KpiCard({
    label,
    value,
    helper,
    icon: Icon,
    href,
    variant = 'default',
    sparkline,
}: KpiCardProps) {
    const isFeatured = variant === 'featured';
    const cardClassName = {
        default: 'border-border bg-card text-card-foreground',
        featured: 'border-primary bg-primary text-primary-foreground',
        highlight: 'border-warning/30 bg-warning/10 text-card-foreground',
    }[variant];
    const iconClassName = isFeatured ? 'bg-primary-foreground/10 text-primary-foreground' : 'bg-accent text-accent-foreground';
    const mutedText = isFeatured ? 'text-primary-foreground/70' : 'text-muted-foreground';

    return (
        <Link
            href={href}
            aria-label={`${label}: ${value ?? 'not tracked'}. ${helper}`}
            className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
            <Card className={`h-full min-h-40 min-w-0 rounded-2xl p-4 shadow-xs transition-transform hover:-translate-y-0.5 ${cardClassName}`}>
                <CardContent className="flex h-full min-w-0 flex-col p-0">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                        <p className={`min-w-0 break-words text-xs font-medium ${mutedText}`}>{label}</p>
                        <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${iconClassName}`}>
                            <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
                        </span>
                    </div>
                    <p className="mt-2 min-w-0 break-words text-[clamp(1.125rem,1.5vw,1.875rem)] leading-tight font-bold tracking-tight tabular-nums [overflow-wrap:anywhere]">
                        {value === null ? '—' : value}
                    </p>
                    <p className={`mt-1 min-h-8 min-w-0 break-words text-xs ${mutedText}`}>{helper}</p>
                    <div className="mt-auto flex min-h-8 items-end justify-between">
                        <span className={`text-xs ${mutedText}`}>—</span>
                        {sparkline && (
                            <Sparkline
                                data={sparkline}
                                className={`h-8 w-24 ${isFeatured ? 'text-primary-foreground' : 'text-primary'}`}
                            />
                        )}
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}
