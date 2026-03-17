import {
    BookOpen,
    BoxesIcon,
    BrainCircuitIcon,
    CoinsIcon,
    FileAxis3DIcon,
    FileSpreadsheetIcon,
    FileX,
    HandCoins,
    LayoutGrid,
    LineChartIcon,
    ListCheckIcon,
    MapIcon,
    MessagesSquareIcon,
    PenLineIcon,
    PlusIcon,
    PrinterIcon,
    RefreshCcwIcon,
    ReplaceAllIcon,
    Settings2Icon,
    Smartphone,
    SquareArrowDownLeftIcon,
    UserRoundIcon,
    WarehouseIcon,
    Waypoints,
    SendToBackIcon,
} from 'lucide-react';

import type { NavItem } from '@/types';

export type SidebarItemKey =
    | 'dashboard'
    | 'waredash'
    | 'stats'
    | 'sheetorders'
    | 'updates'
    | 'assign'
    | 'dispatch'
    | 'maps'
    | 'sheets'
    | 'import'
    | 'whatsapp'
    | 'products'
    | 'transfer'
    | 'units'
    | 'categories'
    | 'ai'
    | 'transactions'
    | 'budgets'
    | 'finance-workflow'
    | 'requisitions'
    | 'reqcategories'
    | 'report'
    | 'undelivered'
    | 'unremitted'
    | 'stk'
    | 'sidebar-permissions';

export interface SidebarGroupDefinition {
    label: string;
    items: Array<NavItem & { key: SidebarItemKey; group: string }>;
}

export const sidebarGroups: SidebarGroupDefinition[] = [
    {
        label: 'General',
        items: [
            { key: 'dashboard', title: 'Dashboard', href: '/dashboard', icon: LayoutGrid, group: 'General' },
            { key: 'waredash', title: 'Warehouse Dashboard', href: '/waredash', icon: WarehouseIcon, group: 'General' },
            { key: 'stats', title: 'Stats', href: '/stats', icon: LineChartIcon, group: 'General' },
        ],
    },
    {
        label: 'Operations',
        items: [
            { key: 'sheetorders', title: 'Orders', href: '/sheetorders', icon: ListCheckIcon, group: 'Operations' },
            { key: 'updates', title: 'Updates', href: '/updates', icon: RefreshCcwIcon, group: 'Operations' },
            { key: 'assign', title: 'Re/Assign Orders', href: '/assign', icon: ReplaceAllIcon, group: 'Operations' },
            { key: 'dispatch', title: 'Dispatch', href: '/dispatch', icon: Waypoints, group: 'Operations' },
            { key: 'maps', title: 'Maps', href: '/maps', icon: MapIcon, group: 'Operations' },
            { key: 'sheets', title: 'Sheets', href: '/sheets', icon: FileSpreadsheetIcon, group: 'Operations' },
            { key: 'import', title: 'Import Orders', href: '/import', icon: PlusIcon, group: 'Operations' },
            { key: 'whatsapp', title: 'Whatsapp Chats', href: '/whatsapp', icon: MessagesSquareIcon, group: 'Operations' },
        ],
    },
    {
        label: 'Inventory',
        items: [
            { key: 'products', title: 'Products', href: '/products', icon: BoxesIcon, group: 'Inventory' },
            { key: 'transfer', title: 'Transfer', href: '/transfer', icon: SendToBackIcon, group: 'Inventory' },
            { key: 'units', title: 'Merchants', href: '/units', icon: UserRoundIcon, group: 'Inventory' },
            { key: 'categories', title: 'Categories', href: '/categories', icon: SquareArrowDownLeftIcon, group: 'Inventory' },
            { key: 'ai', title: 'Rdl Ai', href: '/ai', icon: BrainCircuitIcon, group: 'Inventory' },
        ],
    },
    {
        label: 'Finance',
        items: [
            { key: 'transactions', title: 'Transactions', href: '/transactions', icon: HandCoins, group: 'Finance' },
            { key: 'budgets', title: 'Budgets', href: '/budgets', icon: CoinsIcon, group: 'Finance' },
            { key: 'finance-workflow', title: 'Finance Workflow', href: '/finance-workflow', icon: PrinterIcon, group: 'Finance' },
            { key: 'requisitions', title: 'Requisitions', href: '/requisitions', icon: PenLineIcon, group: 'Finance' },
            { key: 'reqcategories', title: 'Req-Categories', href: '/reqcategories', icon: FileAxis3DIcon, group: 'Finance' },
            { key: 'report', title: 'Reports', href: '/report', icon: PrinterIcon, group: 'Finance' },
            { key: 'undelivered', title: 'Undelivered Orders', href: '/undelivered', icon: BookOpen, group: 'Finance' },
            { key: 'unremitted', title: 'Unremitted Orders', href: '/unremitted', icon: FileX, group: 'Finance' },
            { key: 'stk', title: 'STK push', href: '/stk', icon: Smartphone, group: 'Finance' },
        ],
    },
];

export const adminToolsGroup: SidebarGroupDefinition = {
    label: 'Administration',
    items: [
        { key: 'sidebar-permissions', title: 'Sidebar Access', href: '/sidebar-permissions', icon: Settings2Icon, group: 'Administration' },
    ],
};

export const allSidebarItems = [...sidebarGroups, adminToolsGroup].flatMap((group) => group.items);

export function filterSidebarGroups(visibleItems: string[], canManage: boolean): SidebarGroupDefinition[] {
    const allowedKeys = new Set(visibleItems);
    const visibleGroups = sidebarGroups
        .map((group) => ({
            ...group,
            items: group.items.filter((item) => allowedKeys.has(item.key)),
        }))
        .filter((group) => group.items.length > 0);

    if (canManage) {
        visibleGroups.push(adminToolsGroup);
    }

    return visibleGroups;
}
