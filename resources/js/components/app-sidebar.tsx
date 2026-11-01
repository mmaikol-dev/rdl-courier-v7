import { Link, usePage } from '@inertiajs/react';
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
import { Activity, Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

export function AppSidebar() {
  const { sidebar } = usePage<SharedData>().props;
  const filteredNav = filterSidebarGroups(sidebar?.visibleItems ?? [], sidebar?.canManage ?? false);
  const homeHref = filteredNav.flatMap((group) => group.items)[0]?.href ?? '/dashboard';

  return (
    <Sidebar collapsible="icon" variant="inset">
      {/* LOGO */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href={homeHref} prefetch>
                <AppLogo />
              </Link>
            </SidebarMenuButton>
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
  const filteredNav = filterSidebarGroups(sidebar?.visibleItems ?? [], sidebar?.canManage ?? false);
  const allItems = filteredNav.flatMap((group) => group.items);
  const preferredKeys = ['dashboard', 'sheetorders', 'dispatch', 'products'];
  const quickItems = [
    ...preferredKeys.flatMap((key) => allItems.filter((item) => item.key === key)),
    ...allItems.filter((item) => !preferredKeys.includes(item.key)),
  ].slice(0, 4);
  const currentPath = url.split('?')[0];
  const isActive = (href: string) => currentPath === href || (href !== '/' && currentPath.startsWith(`${href}/`));

  return (
    <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-[0_-8px_24px_-18px_hsl(var(--foreground)/0.35)] backdrop-blur supports-[backdrop-filter]:bg-background/85 md:hidden">
      <div className="grid grid-cols-5 gap-1">
        {quickItems.map((item) => {
          const Icon = item.icon ?? Activity;
          const active = isActive(item.href);
          return (
            <Link key={item.key} href={item.href} prefetch aria-current={active ? 'page' : undefined}
              className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] leading-none font-semibold transition-colors ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}>
              <Icon className="size-5" strokeWidth={active ? 2.5 : 2} />
              <span className="max-w-full truncate">{item.title}</span>
            </Link>
          );
        })}
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
                          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${active ? 'bg-primary/10 font-semibold text-primary' : 'text-foreground hover:bg-accent hover:text-accent-foreground'}`}>
                          <Icon className="size-4 shrink-0" />
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
      </div>
    </nav>
  );
}
