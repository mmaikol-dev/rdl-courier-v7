<?php

namespace App\Http\Controllers;

use App\Models\SidebarRolePermission;
use App\Models\User;
use App\Support\SidebarRegistry;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class SidebarRolePermissionController extends Controller
{
    public function index(Request $request): Response
    {
        abort_unless(SidebarRegistry::canManage($request->user()?->roles), 403);

        $roles = User::query()
            ->whereNotNull('roles')
            ->where('roles', '!=', '')
            ->distinct()
            ->orderBy('roles')
            ->pluck('roles');

        $savedPermissions = SidebarRolePermission::query()
            ->get()
            ->mapWithKeys(function (SidebarRolePermission $permission): array {
                return [
                    $permission->role => array_values(array_intersect(
                        $permission->visible_items ?? [],
                        SidebarRegistry::allKeys(),
                    )),
                ];
            });

        $roles = $roles
            ->merge($savedPermissions->keys())
            ->unique()
            ->sort()
            ->values();

        $permissionsByRole = $roles
            ->mapWithKeys(fn (string $role): array => [
                $role => $savedPermissions[$role] ?? SidebarRegistry::defaultVisibleKeysForRole($role),
            ])
            ->all();

        return Inertia::render('sidebar-permissions/index', [
            'roles' => $roles,
            'sidebarItems' => SidebarRegistry::items(),
            'permissionsByRole' => $permissionsByRole,
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        abort_unless(SidebarRegistry::canManage($request->user()?->roles), 403);

        $validated = $request->validate([
            'role' => ['required', 'string', 'max:255'],
            'visible_items' => ['array'],
            'visible_items.*' => ['string', 'in:' . implode(',', SidebarRegistry::allKeys())],
        ]);

        SidebarRolePermission::updateOrCreate(
            ['role' => $validated['role']],
            ['visible_items' => array_values(array_unique($validated['visible_items'] ?? []))]
        );

        return back()->with('success', 'Sidebar access updated successfully.');
    }
}
