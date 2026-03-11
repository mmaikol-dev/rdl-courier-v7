<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RestrictAgentAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || strtolower(trim((string) $user->roles)) !== 'agent') {
            return $next($request);
        }

        if ($this->isAllowedForAgent($request)) {
            return $next($request);
        }

        return redirect()->route('stk.index');
    }

    private function isAllowedForAgent(Request $request): bool
    {
        return $request->routeIs([
            'stk.*',
            'logout',
            'profile.*',
            'password.*',
            'verification.*',
        ]) || $request->is([
            'settings',
            'settings/*',
            'confirm-password',
        ]);
    }
}
