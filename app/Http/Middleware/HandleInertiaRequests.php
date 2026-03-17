<?php

namespace App\Http\Middleware;

use App\Models\SidebarRolePermission;
use App\Support\SidebarRegistry;
use Illuminate\Foundation\Inspiring;
use Illuminate\Http\Request;
use Inertia\Middleware;
use Tighten\Ziggy\Ziggy;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        [$message, $author] = str(Inspiring::quotes()->random())->explode('-');
        $user = $request->user()?->loadMissing('country');
        $role = $user?->roles;
        $normalizedRole = SidebarRegistry::normalizeRole($role);
        $visibleItems = SidebarRolePermission::query()
            ->where('role', $role)
            ->value('visible_items');

        if (! is_array($visibleItems)) {
            $visibleItems = SidebarRegistry::defaultVisibleKeysForRole($normalizedRole);
        }

        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'quote' => ['message' => trim($message), 'author' => trim($author)],
            'auth' => [
                'user' => $user,
                'pendingLoginLocationCapture' => (bool) $request->session()->get('login_location_id'),
            ],
            'sidebar' => [
                'role' => $role,
                'visibleItems' => $visibleItems,
                'canManage' => SidebarRegistry::canManage($normalizedRole),
            ],
            'ziggy' => fn (): array => [
                ...(new Ziggy)->toArray(),
                'location' => $request->url(),
            ],
            'sidebarOpen' => ! $request->hasCookie('sidebar_state') || $request->cookie('sidebar_state') === 'true',
        ];
    }
}
