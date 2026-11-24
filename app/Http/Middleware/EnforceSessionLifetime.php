<?php

namespace App\Http\Middleware;

use App\Services\Auth\SessionLogin;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Server-side hard limit on a sign-in (12 hours, or 30 days with "Keep me signed in", which renews while the device is in use).
 * A session without an expiry stamp is treated as expired, so nothing signs in "forever".
 */
class EnforceSessionLifetime
{
    public function handle(Request $request, Closure $next): Response
    {
        $guard = Auth::guard('web');

        if ($guard->check()) {
            $expires = (int) $request->session()->get(SessionLogin::EXPIRES_KEY, 0);

            if ($expires < now()->getTimestamp()) {
                $guard->logout();
                $request->session()->invalidate();
                $request->session()->regenerateToken();

                return response()->json(['message' => 'Your session has expired. Please sign in again.'], 401);
            }

            // "Keep this session open": while the person keeps using the app, push the limit forward again
            // once less than half of it is left, so an active device stays signed in but an unused one still
            // lapses after OCC_SESSION_REMEMBER_DAYS. A normal (12 h) sign-in never renews: it is a hard limit.
            if ($request->session()->get(SessionLogin::REMEMBER_KEY, false)) {
                $full = (int) config('occ.session_remember_days') * 86400;
                if ($expires - now()->getTimestamp() < $full / 2) {
                    $request->session()->put(SessionLogin::EXPIRES_KEY, now()->addSeconds($full)->getTimestamp());
                }
            }
        }

        return $next($request);
    }
}
