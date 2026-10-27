import { Link } from '@inertiajs/react';
import { AlertTriangle, ClipboardList, PackageX, Truck, Undo2, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DashboardNeedsYouCounts } from '@/types/dashboard';

interface NeedsYouBannerProps {
    counts: DashboardNeedsYouCounts;
    isSample: boolean;
}

interface ActionItem {
    key: keyof DashboardNeedsYouCounts;
    label: string;
    href: string;
    icon: LucideIcon;
}

const actions: ActionItem[] = [
    { key: 'toConfirm', label: 'to confirm', href: '/sheetorders?status=Pending', icon: ClipboardList },
    { key: 'outOfStock', label: 'out of stock', href: '/products', icon: PackageX },
    { key: 'toPrepare', label: 'to prepare', href: '/dispatch', icon: PackageX },
    { key: 'readyForCourier', label: 'ready for a courier', href: '/dispatch', icon: Truck },
    { key: 'expectedBack', label: 'expected back', href: '/sheetorders?status=Returned', icon: Undo2 },
    { key: 'cashUpsToSettle', label: 'cash-ups to settle', href: '/finance-workflow', icon: Wallet },
];

export function NeedsYouBanner({ counts, isSample }: NeedsYouBannerProps) {
    const visibleActions = actions.filter((action) => counts[action.key] > 0);

    if (visibleActions.length === 0) return null;

    return (
        <section
            aria-label="Needs your attention"
            className="flex flex-wrap items-center gap-2 rounded-2xl border border-warning/30 bg-warning/10 p-3"
        >
            <div className="mr-1 flex items-center gap-2 px-1 text-sm font-semibold">
                <AlertTriangle aria-hidden="true" className="size-5 text-warning" />
                <span>Needs you</span>
                {isSample && (
                    <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
                        Sample data
                    </span>
                )}
            </div>
            {visibleActions.map(({ key, label, href, icon: Icon }) => (
                <Link
                    key={key}
                    href={href}
                    className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                    <Icon aria-hidden="true" className="size-3.5 text-muted-foreground" />
                    <span>
                        <strong className="font-bold">{counts[key]}</strong> {label}
                    </span>
                </Link>
            ))}
        </section>
    );
}
