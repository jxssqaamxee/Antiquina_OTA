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
        // Which proxies may tell us the real client IP / https. Default: none (a forged X-Forwarded-For
        // cannot dodge the rate limits). Behind a host proxy / CDN list ITS IPs/CIDRs, comma separated,
        // in OCC_TRUSTED_PROXIES. '*' trusts whoever connects and is rejected by occ:preflight.
        $proxies = trim((string) env('OCC_TRUSTED_PROXIES', ''));
        $middleware->trustProxies(at: $proxies === '*' ? '*' : array_values(array_filter(array_map('trim', explode(',', $proxies)))));
        $middleware->append(\App\Http\Middleware\ForceHttps::class);
        $middleware->append(\App\Http\Middleware\SecurityHeaders::class);

        // The colour-theme cookie is written by JavaScript, so it is not encrypted. The server reads it
        // to colour the browser bar / installed-app title bar before the page even loads.
        $middleware->encryptCookies(except: ['occ-theme']);

        // Blocks the API until the account's email is verified (see EnsureEmailVerified).
        $middleware->alias([
            'email.verified' => \App\Http\Middleware\EnsureEmailVerified::class,
            'session.fresh' => \App\Http\Middleware\EnforceSessionLifetime::class,
            'role' => \App\Http\Middleware\EnsureRole::class,
            'active' => \App\Http\Middleware\EnsureActiveAccount::class,
            'approved' => \App\Http\Middleware\EnsureApproved::class,
            'two_factor' => \App\Http\Middleware\EnsureTwoFactorEnrolled::class,
            'setup.complete' => \App\Http\Middleware\EnsureProfileSetupComplete::class,
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
        // Log suspicious HTTP errors: 419 = bad/missing CSRF token, 403 = forbidden, 429 = throttled.
        $exceptions->render(function (\Symfony\Component\HttpKernel\Exception\HttpExceptionInterface $e, $request) {
            if (in_array($e->getStatusCode(), [403, 419, 429], true)) {
                \App\Support\SecurityLog::event('http_'.$e->getStatusCode(), ['path' => $request->path(), 'method' => $request->method()]);
            }

            return null; // keep Laravel's normal response
        });
        $exceptions->shouldRenderJsonWhen(fn ($request) => $request->is('api/*') || $request->expectsJson());
    })->create();
