<?php

use App\Http\Middleware\CheckSidebarPageAccess;
use App\Http\Middleware\HandleAppearance;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\RestrictAgentAccess;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Symfony\Component\HttpKernel\Exception\HttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php', // 👈 Add this
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // Cloudflared connects to the loopback origin and forwards the public
        // request scheme/host in X-Forwarded-* headers. Trust only the local
        // tunnel process so generated links and form actions stay HTTPS.
        $middleware->trustProxies(at: ['127.0.0.1', '::1']);

        $middleware->encryptCookies(except: ['appearance', 'sidebar_state']);

        $middleware->validateCsrfTokens(except: [
            'dispatch/bulk-download-waybills',
            'dispatch/bulk-assign',
        ]);

        $middleware->web(append: [
            CheckSidebarPageAccess::class,
            HandleAppearance::class,
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
            RestrictAgentAccess::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->render(function (HttpException $e, Request $request) {
            if ($e->getStatusCode() === 403) {
                return Inertia::render('errors/not-allowed')
                    ->toResponse($request)
                    ->setStatusCode(403);
            }
        });
    })->create();
