<?php

namespace App\Http\Middleware;

use App\Models\SidebarRolePermission;
use App\Support\SidebarRegistry;
use Closure;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\Response;

class CheckSidebarPageAccess
{
    private static array $sidebarRouteMap;

    private static function getRouteMap(): array
    {
        if (! isset(self::$sidebarRouteMap)) {
            $map = [];
            foreach (SidebarRegistry::items() as $item) {
                $href = $item['href'];
                $map[$href] = $item['key'];
            }
            self::$sidebarRouteMap = $map;
        }

        return self::$sidebarRouteMap;
    }

    private static function matchKey(string $path): ?string
    {
        $routeMap = self::getRouteMap();

        if (isset($routeMap[$path])) {
            return $routeMap[$path];
        }

        foreach ($routeMap as $href => $key) {
            if ($href !== '/' && str_starts_with($path, $href)) {
                $nextChar = $path[strlen($href)] ?? '/';
                if ($nextChar === '/' || $nextChar === '?') {
                    return $key;
                }
            }
        }

        return null;
    }

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            return $next($request);
        }

        $path = '/' . ltrim($request->path(), '/');
        $key = self::matchKey($path);

        if ($key === null) {
            return $next($request);
        }

        $role = $user->roles;
        $normalizedRole = SidebarRegistry::normalizeRole($role);
        $visibleItems = SidebarRolePermission::query()
            ->where('role', $role)
            ->value('visible_items');

        if (! is_array($visibleItems)) {
            $visibleItems = SidebarRegistry::defaultVisibleKeysForRole($normalizedRole);
        }

        if (in_array($key, $visibleItems, true)) {
            return $next($request);
        }

        return Inertia::render('errors/not-allowed', [
            'pageTitle' => SidebarRegistry::titleForKey($key),
        ])->toResponse($request)->setStatusCode(403);
    }
}
