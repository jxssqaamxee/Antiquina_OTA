<?php

namespace App\Http\Middleware;

use App\Services\Auth\SessionLogin;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Server-side hard limit on a sign-in (12 hours, or 30 days with "Keep me signed in").
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
        }

        return $next($request);
    }
}
