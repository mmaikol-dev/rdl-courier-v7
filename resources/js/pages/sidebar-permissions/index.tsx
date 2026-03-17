import AppLayout from '@/layouts/app-layout';
import { allSidebarItems } from '@/lib/sidebar';
import type { BreadcrumbItem } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { ChevronRight, Layers3, LockOpen, Search, ShieldCheck, Sparkles } from 'lucide-react';
import * as React from 'react';

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

export default function SidebarPermissionsPage() {
    const { roles, permissionsByRole, sidebarItems } = usePage<SidebarPermissionsPageProps>().props;
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
            [role]: enabled ? allSidebarItems.filter((item) => item.key !== 'sidebar-permissions').map((item) => item.key) : [],
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
                onFinish: () => setSavingRole(null),
            },
        );
    };

    const selectedRoleItems = selectedRole ? state[selectedRole] ?? [] : [];
    const selectedRoleCoverage = Math.round((selectedRoleItems.length / Math.max(allSidebarItems.length - 1, 1)) * 100);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Sidebar Access" />

            <div className="space-y-6 p-4">
                <Card className="overflow-hidden border-border/60 bg-gradient-to-br from-background via-background to-muted/30">
                    <CardHeader className="relative">
                        <div className="absolute right-4 top-4 rounded-full border border-border/60 bg-background/80 p-2 backdrop-blur">
                            <ShieldCheck className="size-5 text-primary" />
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Sparkles className="size-4" />
                            Sidebar access studio
                        </div>
                        <CardTitle className="text-2xl">Control what each role sees</CardTitle>
                        <CardDescription className="max-w-2xl">
                            Fine-tune the sidebar for every role, keep noisy pages out of view, and give each team a cleaner workspace.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
                            <div className="rounded-xl border bg-background/80 p-3">
                                <div className="mb-1 flex items-center gap-2 text-foreground">
                                    <Layers3 className="size-4" />
                                    {roles.length} roles
                                </div>
                                Active roles discovered from your users table.
                            </div>
                            <div className="rounded-xl border bg-background/80 p-3">
                                <div className="mb-1 flex items-center gap-2 text-foreground">
                                    <LockOpen className="size-4" />
                                    {allSidebarItems.filter((item) => item.key !== 'sidebar-permissions').length} menu items
                                </div>
                                Each toggle updates a role-wide sidebar layout.
                            </div>
                            <div className="rounded-xl border bg-background/80 p-3">
                                <div className="mb-1 text-foreground">Live behavior</div>
                                Changes apply the next time that role loads a page.
                            </div>
                        </div>
                        <div className="relative w-full md:max-w-xs">
                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                className="pl-9"
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
                                                <Badge variant="secondary" className="max-w-full truncate">
                                                    {role}
                                                </Badge>
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
                                    Turn individual sidebar links on or off for this role. Changes affect every user with this exact `roles` value.
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
                                    <Button variant="outline" onClick={() => setAllForRole(selectedRole, true)}>
                                        Enable all
                                    </Button>
                                    <Button variant="outline" onClick={() => setAllForRole(selectedRole, false)}>
                                        Hide all
                                    </Button>
                                </div>

                                {Object.entries(groupedItems).map(([group, items], groupIndex) => (
                                    <div key={group} className="space-y-3">
                                        {groupIndex > 0 ? <Separator /> : null}
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="font-medium">{group}</h3>
                                                <p className="text-sm text-muted-foreground">
                                                    {items.filter((item) => selectedRoleItems.includes(item.key)).length} of {items.length} visible
                                                </p>
                                            </div>
                                            <Badge variant="outline">{group}</Badge>
                                        </div>

                                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                            {items.map((item) => {
                                                const checked = selectedRoleItems.includes(item.key);

                                                return (
                                                    <label
                                                        key={`${selectedRole}-${item.key}`}
                                                        className={cn(
                                                            'flex items-start justify-between gap-3 rounded-2xl border p-4 transition-colors',
                                                            checked ? 'border-primary/50 bg-primary/5' : 'bg-background',
                                                        )}
                                                    >
                                                        <div className="space-y-1">
                                                            <div className="font-medium">{item.title}</div>
                                                            <div className="text-sm text-muted-foreground">{item.href}</div>
                                                        </div>
                                                        <Switch
                                                            checked={checked}
                                                            onCheckedChange={(nextChecked) => toggleItem(selectedRole, item.key, nextChecked)}
                                                        />
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <DrawerFooter className="mx-auto w-full max-w-6xl border-t bg-background/95">
                                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                                    <Button variant="outline" onClick={() => setSelectedRole(null)}>
                                        Close
                                    </Button>
                                    <Button onClick={() => saveRole(selectedRole)} disabled={savingRole === selectedRole}>
                                        {savingRole === selectedRole ? 'Saving...' : 'Save changes'}
                                    </Button>
                                </div>
                            </DrawerFooter>
                        </>
                    ) : null}
                </DrawerContent>
            </Drawer>
        </AppLayout>
    );
}
