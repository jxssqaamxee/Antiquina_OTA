<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Behind a reverse proxy / Cloudflare / Hostinger: trust forwarded headers.
        $middleware->trustProxies(at: '*');

        // Blocks the API until the account's email is verified (see EnsureEmailVerified).
        $middleware->alias([
            'email.verified' => \App\Http\Middleware\EnsureEmailVerified::class,
            'session.fresh' => \App\Http\Middleware\EnforceSessionLifetime::class,
        ]);

        // Sign-in is a server-side session (HttpOnly cookie), so /api gets the same cookie,
        // session and CSRF protection as web pages. The browser sends the XSRF-TOKEN cookie
        // back as the X-XSRF-TOKEN header on every write (axios does this by itself).
        $middleware->api(prepend: [
            \Illuminate\Cookie\Middleware\EncryptCookies::class,
            \Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse::class,
            \Illuminate\Session\Middleware\StartSession::class,
            \Illuminate\Foundation\Http\Middleware\ValidateCsrfToken::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // The SPA always talks JSON to /api/*, never redirect to a login page.
        $exceptions->shouldRenderJsonWhen(fn ($request) => $request->is('api/*') || $request->expectsJson());
    })->create();
