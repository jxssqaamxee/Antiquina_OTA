<?php

namespace App\Services\Auth;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * Signs a person in with a SERVER-SIDE session.
 *
 * The browser only holds an HttpOnly cookie that carries a random session id; the session
 * itself is one row in the `sessions` table (one row per device). There is no token for
 * JavaScript to read, so an XSS bug cannot steal the sign-in and use it elsewhere.
 *
 *  - "Keep me signed in" ticked -> OCC_SESSION_REMEMBER_DAYS, otherwise OCC_SESSION_HOURS.
 *    The limit is stored inside the session and enforced by EnforceSessionLifetime.
 *  - A new session id is issued at every sign-in (prevents session fixation).
 *  - Changing / resetting a password deletes the account's other session rows.
 */
class SessionLogin
{
    /** Session key holding the hard expiry (unix timestamp). */
    public const EXPIRES_KEY = 'occ_expires_at';

    /** @return array{status:string,expires_at:string,user:array} */
    public function start(Request $request, User $user, bool $remember): array
    {
        $expires = $remember
            ? now()->addDays(config('occ.session_remember_days'))
            : now()->addHours(config('occ.session_hours'));

        // login() without "remember me": no long-lived remember cookie is ever created.
        Auth::guard('web')->login($user, false);

        $session = $request->session();
        $session->regenerate();      // fresh session id for the signed-in state
        $session->regenerateToken(); // fresh CSRF token too
        $session->put(self::EXPIRES_KEY, $expires->getTimestamp());

        return [
            'status' => 'ok',
            'expires_at' => $expires->toIso8601String(),
            'user' => $user->toClient(),
        ];
    }

    /** Signs out THIS device and destroys its session row. */
    public function end(Request $request): void
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
    }

    /** Deletes every session of the account except (optionally) the one making this request. */
    public function revokeOthers(User $user, ?string $keepSessionId = null): void
    {
        DB::table(config('session.table', 'sessions'))
            ->where('user_id', $user->getKey())
            ->when($keepSessionId, fn ($q) => $q->where('id', '!=', $keepSessionId))
            ->delete();
    }

    /** Deletes every session of the account (all devices). */
    public function revokeAll(User $user): void
    {
        $this->revokeOthers($user, null);
        // Every device was signed out: none of them may keep getting this account's reminders.
        $user->pushSubscriptions()->delete();
    }
}
