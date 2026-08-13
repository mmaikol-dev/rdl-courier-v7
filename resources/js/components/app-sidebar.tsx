import { usePage } from '@inertiajs/react';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { CountryFilter } from '@/components/country-filter';
import { type SharedData } from '@/types';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar';
import { Link } from '@inertiajs/react';
import AppLogo from './app-logo';
import { filterSidebarGroups } from '@/lib/sidebar';

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

      {/* COUNTRY FILTER */}
      <CountryFilter />

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

      {/* FOOTER */}
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
