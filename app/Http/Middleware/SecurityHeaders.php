<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Vite;
use Symfony\Component\HttpFoundation\Response;

/**
 * Adds browser security headers to every response (HSTS, CSP, anti-clickjacking, nosniff,
 * referrer and permissions policy).
 *
 * The Content-Security-Policy ships in REPORT-ONLY mode by default (the browser console lists
 * anything it would block, nothing breaks). After clicking through every screen without
 * violations, set OCC_CSP_ENFORCE=true to enforce it.
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        // One random nonce per request: lets our own inline <script> run, blocks injected ones.
        $nonce = base64_encode(random_bytes(16));
        view()->share('cspNonce', $nonce);
        Vite::useCspNonce($nonce);

        $response = $next($request);

        $h = $response->headers;
        $h->set('X-Content-Type-Options', 'nosniff');
        $h->set('X-Frame-Options', 'DENY');
        // Keeps other sites' windows from holding a reference to this app's window.
        $h->set('Cross-Origin-Opener-Policy', 'same-origin');
        $h->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
        // The password-reset token lives in the URL path: never leak it through a Referer header.
        $h->set('Referrer-Policy', $request->is('reset-password/*') ? 'no-referrer' : 'strict-origin-when-cross-origin');

        if ($request->secure()) {
            $h->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }

        // Skip the CSP while the Vite dev server is running (it serves from another origin).
        if (! file_exists(public_path('hot'))) {
            $name = config('occ.csp_enforce') ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only';
            $h->set($name, $this->policy($nonce));
        }

        return $response;
    }

    private function policy(string $nonce): string
    {
        return implode('; ', [
            "default-src 'self'",
            "script-src 'self' 'nonce-{$nonce}'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "font-src 'self' data:",
            "connect-src 'self'",
            "manifest-src 'self'",
            "worker-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
        ]);
    }
}
