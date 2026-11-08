import { Link, router, usePage } from '@inertiajs/react';
import { NavMain } from '@/components/nav-main';
import { type SharedData } from '@/types';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar';
import AppLogo from './app-logo';
import { filterSidebarGroups } from '@/lib/sidebar';
import { Activity, Loader2, Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import * as React from 'react';

export function AppSidebar() {
  const { sidebar } = usePage<SharedData>().props;
  const filteredNav = filterSidebarGroups(sidebar?.visibleItems ?? [], sidebar?.canManage ?? false, sidebar?.role);
  const homeHref = filteredNav.flatMap((group) => group.items)[0]?.href;

  return (
    <Sidebar collapsible="icon" variant="inset">
      {/* LOGO */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            {homeHref ? (
              <SidebarMenuButton size="lg" asChild>
                <Link href={homeHref} prefetch>
                  <AppLogo />
                </Link>
              </SidebarMenuButton>
            ) : (
              <SidebarMenuButton size="lg">
                <AppLogo />
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* NAVIGATION */}
      <SidebarContent className="scrollbar-custom overflow-y-auto">
        {filteredNav.map((dept) => (
          <div key={dept.id} className="mb-4">
            <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider 
              transition-all duration-200
              group-data-[state=collapsed]:hidden">
              {dept.label}
            </p>
            <NavMain items={dept.items} />
          </div>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}

export function MobileAppNavigation() {
  const page = usePage<SharedData>();
  const { sidebar } = page.props;
  const { url } = page;
  const [pendingHref, setPendingHref] = React.useState<string | null>(null);
  const filteredNav = filterSidebarGroups(sidebar?.visibleItems ?? [], sidebar?.canManage ?? false, sidebar?.role);
  const allItems = filteredNav.flatMap((group) => group.items);
  const preferredKeys = ['dashboard', 'sheetorders', 'dispatch', 'products'];
  const quickItems = [
    ...preferredKeys.flatMap((key) => allItems.filter((item) => item.key === key)),
    ...allItems.filter((item) => !preferredKeys.includes(item.key)),
  ].slice(0, 4);
  const hasMoreItems = allItems.length > quickItems.length;
  const columnCount = quickItems.length + (hasMoreItems ? 1 : 0);
  const currentPath = url.split('?')[0];
  const isActive = (href: string) => currentPath === href || (href !== '/' && currentPath.startsWith(`${href}/`));

  React.useEffect(() => {
    const removeFinish = router.on('finish', () => setPendingHref(null));
    const removeCancel = router.on('cancel', () => setPendingHref(null));
    const removeError = router.on('error', () => setPendingHref(null));
    return () => {
      removeFinish();
      removeCancel();
      removeError();
    };
  }, []);

  if (allItems.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Main navigation" className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 mx-auto max-w-md rounded-2xl border bg-background/90 p-1.5 shadow-[0_12px_32px_-14px_hsl(var(--foreground)/0.45)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}>
        {quickItems.map((item) => {
          const Icon = item.icon ?? Activity;
          const active = isActive(item.href);
          return (
            <Link key={item.key} href={item.href} prefetch aria-current={active ? 'page' : undefined}
              aria-busy={pendingHref === item.href ? true : undefined}
              onClick={() => !active && setPendingHref(item.href)}
              className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] leading-none font-semibold transition-colors ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}>
              {pendingHref === item.href ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" strokeWidth={active ? 2.5 : 2} />}
              <span className="max-w-full truncate">{item.title}</span>
            </Link>
          );
        })}
        {hasMoreItems && (
          <Sheet>
            <SheetTrigger asChild>
              <button type="button" className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] leading-none text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground" aria-label="Open all navigation links">
                <Menu className="size-5" />
                <span>More</span>
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(88vw,22rem)] gap-0 overflow-y-auto p-0">
              <SheetHeader className="border-b bg-sidebar p-5 pr-14 text-sidebar-foreground">
                <SheetTitle className="text-left">All sections</SheetTitle>
                <SheetDescription className="text-left">Navigate the areas available to your account.</SheetDescription>
              </SheetHeader>
              <div className="space-y-5 p-3">
                {filteredNav.map((group) => (
                  <section key={group.id} aria-label={group.label}>
                    <h2 className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{group.label}</h2>
                    <div className="space-y-1">
                      {group.items.map((item) => {
                        const Icon = item.icon ?? Activity;
                        const active = isActive(item.href);
                        return (
                          <Link key={item.key} href={item.href} prefetch aria-current={active ? 'page' : undefined}
                            aria-busy={pendingHref === item.href ? true : undefined}
                            onClick={() => !active && setPendingHref(item.href)}
                            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${active ? 'bg-primary/10 font-semibold text-primary' : 'text-foreground hover:bg-accent hover:text-accent-foreground'}`}>
                            {pendingHref === item.href ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <Icon className="size-4 shrink-0" />}
                            <span className="truncate">{item.title}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </nav>
  );
}
