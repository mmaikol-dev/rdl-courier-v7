import AppLayout from '@/layouts/app-layout';
import { allSidebarItems } from '@/lib/sidebar';
import type { BreadcrumbItem } from '@/types';
import { Deferred, Head, router, usePage } from '@inertiajs/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronRight, Search, ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/dashboard' },
    { title: 'Sidebar Access', href: '/sidebar-permissions' },
];

interface SidebarItem {
    key: string;
    title: string;
    href: string;
    group: string;
}

interface SidebarPermissionsPageProps extends Record<string, unknown> {
    roles: string[];
    sidebarItems: SidebarItem[];
    permissionsByRole: Record<string, string[]>;
}

function normalizeRole(role: string) {
    return role.trim().toLowerCase();
}

const EMPTY_SIDEBAR_DATA = { roles: [] as string[], sidebarItems: [] as SidebarItem[], permissionsByRole: {} as Record<string, string[]> };

function SidebarAccessSkeleton() {
    return <div className="space-y-4 p-4" role="status" aria-label="Loading sidebar access" aria-live="polite"><Skeleton className="h-36 w-full rounded-xl" /><div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="aspect-square w-full rounded-xl" />)}</div></div>;
}

export default function SidebarPermissionsPage() {
    const { sidebarData } = usePage<SidebarPermissionsPageProps & { sidebarData?: typeof EMPTY_SIDEBAR_DATA }>().props;
    const { roles, permissionsByRole, sidebarItems } = sidebarData ?? EMPTY_SIDEBAR_DATA;
    const [query, setQuery] = React.useState('');
    const [state, setState] = React.useState<Record<string, string[]>>(permissionsByRole);
    const [savingRole, setSavingRole] = React.useState<string | null>(null);
    const [selectedRole, setSelectedRole] = React.useState<string | null>(null);

    React.useEffect(() => {
        setState(permissionsByRole);
    }, [permissionsByRole]);

    const filteredRoles = React.useMemo(() => {
        return roles.filter((role) => normalizeRole(role).includes(normalizeRole(query)));
    }, [query, roles]);

    const groupedItems = React.useMemo(() => {
        return sidebarItems.reduce<Record<string, SidebarItem[]>>((acc, item) => {
                const group = item.group ?? 'Platform';
                if (!acc[group]) {
                    acc[group] = [];
                }
                acc[group].push(item);
                return acc;
            }, {});
    }, [sidebarItems]);

    const toggleItem = (role: string, itemKey: string, checked: boolean) => {
        setState((current) => {
            const nextItems = new Set(current[role] ?? []);

            if (checked) {
                nextItems.add(itemKey);
            } else {
                nextItems.delete(itemKey);
            }

            return {
                ...current,
                [role]: Array.from(nextItems),
            };
        });
    };

    const setAllForRole = (role: string, enabled: boolean) => {
        setState((current) => ({
            ...current,
            [role]: enabled
                ? allSidebarItems.filter((item) => item.key !== 'sidebar-permissions').map((item) => item.key)
                : normalizeRole(role) === 'merchant'
                  ? ['transfer']
                  : [],
        }));
    };

    const saveRole = (role: string) => {
        setSavingRole(role);

        router.put(
            '/sidebar-permissions',
            {
                role,
                visible_items: state[role] ?? [],
            },
            {
                preserveScroll: true,
                onSuccess: () => toast.success(`Sidebar permissions saved for ${role}.`),
                onError: (errors) => {
                    const message = Object.values(errors).flat()[0];
                    toast.error(typeof message === 'string' ? message : 'Could not save sidebar permissions.');
                },
                onHttpException: (response) => {
                    toast.error(`Could not save sidebar permissions (${response.status}).`);
                },
                onNetworkError: () => toast.error('Network error while saving sidebar permissions.'),
                onFinish: () => setSavingRole(null),
            },
        );
    };

    const selectedRoleItems = selectedRole ? state[selectedRole] ?? [] : [];
    const selectedRoleCoverage = Math.round((selectedRoleItems.length / Math.max(allSidebarItems.length - 1, 1)) * 100);
    const selectedRoleIsGod = selectedRole ? normalizeRole(selectedRole) === 'g.o.d' : false;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Sidebar Access" />

            <Deferred data="sidebarData" fallback={<SidebarAccessSkeleton />}>
            {() => <>
            <div className="space-y-6 p-4">
                <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-primary/10">
                    <CardContent className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-2">
                            <ShieldCheck className="size-4 shrink-0 text-primary" />
                            <span className="truncate text-sm font-semibold">Sidebar access</span>
                            <span className="text-xs text-muted-foreground">{roles.length} roles · {allSidebarItems.filter((item) => item.key !== 'sidebar-permissions').length} menu items</span>
                        </div>
                        <div className="relative w-full sm:max-w-xs">
                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                className="h-8 bg-background/80 pl-9"
                                placeholder="Filter roles..."
                            />
                        </div>
                    </CardContent>
                </Card>

                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
                    {filteredRoles.map((role) => {
                        const enabledItems = state[role] ?? [];
                        const coverage = Math.round((enabledItems.length / Math.max(allSidebarItems.length - 1, 1)) * 100);
                        return (
                            <button
                                key={role}
                                type="button"
                                onClick={() => setSelectedRole(role)}
                                className="text-left"
                            >
                                <Card className="aspect-square border-border/60 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg">
                                    <CardContent className="flex h-full flex-col justify-between p-4">
                                        <div className="space-y-3">
                                            <div className="flex items-start justify-between gap-2">
                                                <Badge variant="secondary" className="max-w-full truncate">{role}</Badge>
                                                <ChevronRight className="size-4 text-muted-foreground" />
                                            </div>
                                            <div>
                                                <div className="line-clamp-2 text-lg font-semibold leading-tight">{role}</div>
                                                <p className="mt-1 text-xs text-muted-foreground">Tap to edit sidebar access</p>
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                                <span>{enabledItems.length} links enabled</span>
                                                <span>{coverage}%</span>
                                            </div>
                                            <Progress value={coverage} className="h-2" />
                                        </div>
                                    </CardContent>
                                </Card>
                            </button>
                        );
                    })}

                    {filteredRoles.length === 0 ? (
                        <Card className="col-span-full border-dashed">
                            <CardContent className="flex min-h-40 items-center justify-center text-muted-foreground">
                                No roles matched your search.
                            </CardContent>
                        </Card>
                    ) : null}
                </div>
            </div>

            <Drawer open={selectedRole !== null} onOpenChange={(open) => (!open ? setSelectedRole(null) : undefined)}>
                <DrawerContent className="max-h-[90vh]">
                    {selectedRole ? (
                        <>
                            <DrawerHeader className="mx-auto w-full max-w-6xl">
                                <div className="flex flex-wrap items-center gap-3">
                                    <DrawerTitle className="text-2xl">{selectedRole}</DrawerTitle>
                                    <Badge variant="secondary">{selectedRoleItems.length} links enabled</Badge>
                                </div>
                                <DrawerDescription>
                                    {selectedRoleIsGod
                                        ? 'G.O.D always has access to every page and cannot be restricted here.'
                                        : 'Turn individual sidebar links on or off for this role. Changes affect every user with this exact roles value.'}
                                </DrawerDescription>
                                <div className="mt-3 max-w-sm space-y-2">
                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                        <span>Visibility coverage</span>
                                        <span>{selectedRoleCoverage}%</span>
                                    </div>
                                    <Progress value={selectedRoleCoverage} className="h-2" />
                                </div>
                            </DrawerHeader>

                            <div className="mx-auto grid w-full max-w-6xl gap-6 overflow-y-auto px-4 pb-4">
                                <div className="flex flex-wrap gap-2">
                                    <Button variant="outline" onClick={() => setAllForRole(selectedRole, true)} disabled={selectedRoleIsGod}>
                                        Enable all
                                    </Button>
                                    <Button variant="outline" onClick={() => setAllForRole(selectedRole, false)} disabled={selectedRoleIsGod}>
                                        Hide all
                                    </Button>
                                </div>

                                {Object.entries(groupedItems).map(([group, items], groupIndex) => {
                                    const visibleCount = items.filter((item) => selectedRoleItems.includes(item.key)).length;

                                    return (
                                    <div key={group} className="space-y-3">
                                        {groupIndex > 0 ? <Separator /> : null}
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="font-medium">{group}</h3>
                                                <p className="text-sm text-muted-foreground">{visibleCount} of {items.length} visible</p>
                                            </div>
                                            <Badge variant="outline">{group}</Badge>
                                        </div>

                                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                            {items.map((item) => {
                                                const checked = selectedRoleItems.includes(item.key);
                                                const requiredForMerchant = normalizeRole(selectedRole) === 'merchant' && item.key === 'transfer';

                                                return (
                                                    <div
                                                        key={`${selectedRole}-${item.key}`}
                                                        className={cn(
                                                            'flex items-start justify-between gap-3 rounded-2xl border p-4 transition-colors',
                                                            checked ? 'border-primary/50 bg-primary/5' : 'bg-background',
                                                        )}
                                                    >
                                                        <button
                                                            type="button"
                                                            className="min-w-0 flex-1 space-y-1 text-left disabled:cursor-not-allowed"
                                                            disabled={requiredForMerchant || selectedRoleIsGod || savingRole === selectedRole}
                                                            onClick={() => toggleItem(selectedRole, item.key, !checked)}
                                                        >
                                                            <div className="font-medium">{item.title}</div>
                                                            <div className="text-sm text-muted-foreground">
                                                                {requiredForMerchant ? 'Required for merchant access' : item.href}
                                                            </div>
                                                        </button>
                                                        <Switch
                                                            checked={checked}
                                                            disabled={requiredForMerchant || selectedRoleIsGod || savingRole === selectedRole}
                                                            onCheckedChange={(nextChecked) => toggleItem(selectedRole, item.key, nextChecked)}
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    );
                                })}
                            </div>

                            <DrawerFooter className="mx-auto w-full max-w-6xl border-t bg-background/95">
                                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                                    <Button variant="outline" onClick={() => setSelectedRole(null)}>
                                        Close
                                    </Button>
                                    <Button onClick={() => saveRole(selectedRole)} disabled={savingRole === selectedRole || selectedRoleIsGod}>
                                        {savingRole === selectedRole ? 'Saving...' : selectedRoleIsGod ? 'Always full access' : 'Save changes'}
                                    </Button>
                                </div>
                            </DrawerFooter>
                        </>
                    ) : null}
                </DrawerContent>
            </Drawer>
            </>}
            </Deferred>
        </AppLayout>
    );
}
