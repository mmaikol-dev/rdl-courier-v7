import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { type BreadcrumbItem as BreadcrumbItemType } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { Fragment } from 'react';
import { allSidebarItems } from '@/lib/sidebar';
import { Activity, Truck } from 'lucide-react';

export function Breadcrumbs({ breadcrumbs }: { breadcrumbs: BreadcrumbItemType[] }) {
    const { sidebar } = usePage<{ sidebar?: { role?: string } }>().props;
    const isAgent = sidebar?.role?.trim().toLowerCase() === 'agent';
    const getItemIcon = (href: string, title: string) => {
        const path = href.split('?')[0].replace(/\/$/, '').toLowerCase();
        const item = allSidebarItems
            .filter((candidate) => path === candidate.href || path.startsWith(`${candidate.href}/`))
            .sort((a, b) => b.href.length - a.href.length)[0]
            ?? allSidebarItems.find((candidate) => candidate.title.toLowerCase() === title.toLowerCase());
        if (isAgent && item?.key === 'stk') return Truck;
        return item?.icon ?? Activity;
    };

    return (
        <>
            {breadcrumbs.length > 0 && (
                <Breadcrumb>
                    <BreadcrumbList className="min-w-0 flex-nowrap overflow-hidden whitespace-nowrap">
                        {breadcrumbs.map((item, index) => {
                            const isLast = index === breadcrumbs.length - 1;
                            const compactHidden = !isLast && index < breadcrumbs.length - 1;
                            const Icon = getItemIcon(item.href, item.title);
                            const title = isAgent && item.href.startsWith('/transfer') ? item.title.replace(/transfers?/i, 'Stock') : item.title;
                            return (
                                <Fragment key={index}>
                                    <BreadcrumbItem className={`min-w-0 shrink ${compactHidden ? 'hidden sm:inline-flex' : ''}`}>
                                        {isLast ? (
                                            <BreadcrumbPage className="flex max-w-[42vw] items-center gap-1.5 truncate sm:max-w-56"><Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />{title}</BreadcrumbPage>
                                        ) : (
                                            <BreadcrumbLink asChild>
                                                <Link href={item.href} className="flex max-w-28 items-center gap-1.5 truncate font-semibold sm:max-w-40"><Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />{title}</Link>
                                            </BreadcrumbLink>
                                        )}
                                    </BreadcrumbItem>
                                    {!isLast && <BreadcrumbSeparator className={`shrink-0 ${compactHidden ? 'hidden sm:inline-flex' : ''}`} />}
                                </Fragment>
                            );
                        })}
                    </BreadcrumbList>
                </Breadcrumb>
            )}
        </>
    );
}
