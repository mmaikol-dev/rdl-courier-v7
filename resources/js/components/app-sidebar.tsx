import { usePage } from '@inertiajs/react';
import { NavFooter } from '@/components/nav-footer';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { type User } from '@/types';
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
import {
  BookOpen,
  BoxesIcon,
  FileSpreadsheetIcon,
  Waypoints,
  HandCoins,
  Folder,
  LayoutGrid,
  ListCheckIcon,
  UserRoundIcon,
  SquareArrowDownLeftIcon,
  Smartphone,
  FileAxis3DIcon,
  BookmarkXIcon,
  FileX,
  MessagesSquareIcon,
  PlusIcon,
  PackagePlusIcon,
  BrainCircuitIcon,
  ReplaceAllIcon,
  SendHorizonalIcon,
  SendToBackIcon,
  Store,
  StoreIcon,
  WarehouseIcon,
  Scale3DIcon,
  ChartBarIncreasing,
  RefreshCcwIcon,
  GitGraphIcon,
  LineChartIcon,
  CoinsIcon,
  PenLineIcon,
  PrinterIcon,
  MapIcon,
} from 'lucide-react';

// --- grouped nav items by department ---
const departmentNav = [
  {
    label: "General",
    items: [
      { title: 'Dashboard', href: '/dashboard', icon: LayoutGrid },
      { title: 'Warehouse Dashboard', href: '/waredash', icon: WarehouseIcon },
      { title: 'Stats', href: '/stats', icon: LineChartIcon }


    ],


  },
  {
    label: "Operations",
    items: [
      { title: 'Orders', href: '/sheetorders', icon: ListCheckIcon },
       { title: 'Updates', href: '/updates', icon: RefreshCcwIcon },
      { title: 'Re/Assign Orders', href: '/assign', icon: ReplaceAllIcon },
      { title: 'Dispatch', href: '/dispatch', icon: Waypoints },
      { title: 'Maps', href: '/maps', icon: MapIcon },
      { title: 'Sheets', href: '/sheets', icon: FileSpreadsheetIcon },
      { title: 'Import Orders', href: '/import', icon: PlusIcon },
      { title: 'Whatsapp Chats', href: '/whatsapp', icon: MessagesSquareIcon },
    ],
  },
  {
    label: "Inventory",
    items: [
      { title: 'Products', href: '/products', icon: BoxesIcon },
      { title: 'Transfer', href: '/transfer', icon: SendToBackIcon },
      { title: 'Merchants', href: '/units', icon: UserRoundIcon },
      { title: 'Categories', href: '/categories', icon: SquareArrowDownLeftIcon },
      { title: 'Rdl Ai', href: '/ai', icon: BrainCircuitIcon },

    ],
  },
  {
    label: "Finance",
    items: [
      { title: 'Transactions', href: '/transactions', icon: HandCoins },
      { title: 'Budgets', href: '/budgets', icon: CoinsIcon },
      { title: 'Requisitions', href: '/requisitions', icon: PenLineIcon },
      { title: 'Req-Categories', href: '/reqcategories', icon: FileAxis3DIcon },
      { title: 'Reports', href: '/report', icon: PrinterIcon },
      { title: 'Undelivered Orders', href: '/undelivered', icon: BookmarkXIcon },
      { title: 'Unremitted Orders', href: '/unremitted', icon: FileX },
      { title: 'STK push', href: '/stk', icon: Smartphone },
    ],
  },
];

export function AppSidebar() {
  const { auth } = usePage<{ auth?: { user?: User } }>().props;
  const user = auth?.user;
  const isAgent = String(user?.roles ?? '').trim().toLowerCase() === 'agent';

  // 👇 Apply role-based filtering
  const filteredNav = departmentNav
    .map((dept) => {
      if (isAgent) {
        if (dept.label !== 'Finance') return null;

        return {
          ...dept,
          items: dept.items.filter((item) => item.title === 'STK push'),
        };
      }

      // Default: show all
      return dept;
    })
    .filter((dept): dept is (typeof departmentNav)[number] => dept !== null);

  return (
    <Sidebar collapsible="icon" variant="inset">
      {/* LOGO */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href={isAgent ? "/stk" : "/dashboard"} prefetch>
                <AppLogo />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* NAVIGATION */}
      <SidebarContent className="scrollbar-custom overflow-y-auto">
        {filteredNav.map((dept) => (
          <div key={dept.label} className="mb-4">
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
