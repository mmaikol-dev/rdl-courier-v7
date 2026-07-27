<?php

namespace App\Support;

class SidebarRegistry
{
    /**
     * @return array<int, array{key: string, title: string, href: string, group: string}>
     */
    public static function items(): array
    {
        return [
            ['key' => 'dashboard', 'title' => 'Dashboard', 'href' => '/dashboard', 'group' => 'General'],
            ['key' => 'waredash', 'title' => 'Warehouse Dashboard', 'href' => '/waredash', 'group' => 'General'],
            ['key' => 'stats', 'title' => 'Stats', 'href' => '/stats', 'group' => 'General'],
            ['key' => 'sheetorders', 'title' => 'Orders', 'href' => '/sheetorders', 'group' => 'Operations'],
            ['key' => 'updates', 'title' => 'Updates', 'href' => '/updates', 'group' => 'Operations'],
            ['key' => 'assign', 'title' => 'Re/Assign Orders', 'href' => '/assign', 'group' => 'Operations'],
            ['key' => 'dispatch', 'title' => 'Dispatch', 'href' => '/dispatch', 'group' => 'Operations'],
            ['key' => 'maps', 'title' => 'Maps', 'href' => '/maps', 'group' => 'Operations'],
            ['key' => 'sheets', 'title' => 'Sheets', 'href' => '/sheets', 'group' => 'Operations'],
            ['key' => 'import', 'title' => 'Import Orders', 'href' => '/import', 'group' => 'Operations'],
            ['key' => 'incoming-sheet-orders', 'title' => 'Incoming Orders', 'href' => '/incoming-sheet-orders', 'group' => 'Operations'],
            ['key' => 'whatsapp', 'title' => 'Whatsapp Chats', 'href' => '/whatsapp', 'group' => 'Operations'],
            ['key' => 'products', 'title' => 'Products', 'href' => '/products', 'group' => 'Inventory'],
            ['key' => 'order-scans', 'title' => 'QR Scan Out', 'href' => '/order-scans', 'group' => 'Inventory'],
            ['key' => 'inventory-deductions', 'title' => 'Inventory Deductions', 'href' => '/inventory-deductions', 'group' => 'Inventory'],
            ['key' => 'deducted-orders', 'title' => 'Deducted Orders', 'href' => '/deducted-orders', 'group' => 'Inventory'],
            ['key' => 'transfer', 'title' => 'Transfer', 'href' => '/transfer', 'group' => 'Inventory'],
            ['key' => 'units', 'title' => 'Merchants', 'href' => '/units', 'group' => 'Inventory'],
            ['key' => 'categories', 'title' => 'Categories', 'href' => '/categories', 'group' => 'Inventory'],
            ['key' => 'ai', 'title' => 'Rdl Ai', 'href' => '/ai', 'group' => 'Inventory'],
            ['key' => 'transactions', 'title' => 'Transactions', 'href' => '/transactions', 'group' => 'Finance'],
            ['key' => 'budgets', 'title' => 'Budgets', 'href' => '/budgets', 'group' => 'Finance'],
            ['key' => 'finance-workflow', 'title' => 'Finance Workflow', 'href' => '/finance-workflow', 'group' => 'Finance'],
            ['key' => 'requisitions', 'title' => 'Requisitions', 'href' => '/requisitions', 'group' => 'Finance'],
            ['key' => 'reqcategories', 'title' => 'Req-Categories', 'href' => '/reqcategories', 'group' => 'Finance'],
            ['key' => 'report', 'title' => 'Reports', 'href' => '/report', 'group' => 'Finance'],
            ['key' => 'undelivered', 'title' => 'Undelivered Orders', 'href' => '/undelivered', 'group' => 'Finance'],
            ['key' => 'unremitted', 'title' => 'Unremitted Orders', 'href' => '/unremitted', 'group' => 'Finance'],
            ['key' => 'stk', 'title' => 'STK push', 'href' => '/stk', 'group' => 'Finance'],
            ['key' => 'users', 'title' => 'Users', 'href' => '/users', 'group' => 'Administration'],
        ];
    }

    /**
     * @return string[]
     */
    public static function allKeys(): array
    {
        return array_map(
            static fn (array $item): string => $item['key'],
            self::items(),
        );
    }

    /**
     * @return string[]
     */
    public static function defaultVisibleKeysForRole(?string $role): array
    {
        $normalizedRole = self::normalizeRole($role);

        if ($normalizedRole === 'agent') {
            return ['stk'];
        }

        return self::allKeys();
    }

    public static function canManage(?string $role): bool
    {
        return self::normalizeRole($role) === 'g.o.d';
    }

    public static function titleForKey(string $key): ?string
    {
        foreach (self::items() as $item) {
            if ($item['key'] === $key) {
                return $item['title'];
            }
        }

        return null;
    }

    public static function normalizeRole(?string $role): string
    {
        return strtolower(trim((string) $role));
    }
}
