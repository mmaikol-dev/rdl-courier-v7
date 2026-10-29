import { Breadcrumbs } from '@/components/breadcrumbs';
import { CountryFilter } from '@/components/country-filter';
import ThemeSwitcher from '@/components/theme-switcher';
import { UserMenuContent } from '@/components/user-menu-content';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useInitials } from '@/hooks/use-initials';
import { type BreadcrumbItem as BreadcrumbItemType, type SharedData } from '@/types';
import { usePage } from '@inertiajs/react';
import { ChevronDown } from 'lucide-react';

export function AppSidebarHeader({ breadcrumbs = [] }: { breadcrumbs?: BreadcrumbItemType[] }) {
    const { auth } = usePage<SharedData>().props;
    const getInitials = useInitials();

    return (
        <header className="flex h-16 min-w-0 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border/50 px-2.5 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 sm:gap-3 sm:px-4">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                <SidebarTrigger className="-ml-1" />
                <div className="min-w-0 flex-1 overflow-hidden"><Breadcrumbs breadcrumbs={breadcrumbs} /></div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                <CountryFilter />
                <ThemeSwitcher />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-9 gap-2 rounded-full px-2.5 transition-colors hover:bg-background hover:shadow-sm">
                            <Avatar className="size-7 overflow-hidden rounded-full ring-2 ring-background">
                                <AvatarImage src={auth.user.avatar} alt={auth.user.name} />
                                <AvatarFallback className="rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                    {getInitials(auth.user.name)}
                                </AvatarFallback>
                            </Avatar>
                            <span className="hidden max-w-28 truncate text-sm font-medium sm:inline md:max-w-36">{auth.user.name}</span>
                            <ChevronDown aria-hidden="true" className="hidden size-3.5 text-muted-foreground sm:block" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-60 rounded-xl" align="end" sideOffset={8}>
                        <UserMenuContent user={auth.user} />
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
    );
}
