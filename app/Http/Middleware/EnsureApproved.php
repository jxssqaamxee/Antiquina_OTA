<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * A self-registered trainee is "pending" until a coordinator (own section) or an admin approves the
 * account. Until then only "who am I", the email-verification calls and sign-out are open, so the app
 * can show a waiting screen but no data is reachable. A rejected account stays closed.
 */
class EnsureApproved
{
    /** @var list<string> */
    protected array $allowedPaths = ['api/me', 'api/me/photo', 'api/auth/logout', 'api/email/*'];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && ! $user->isApproved() && ! $request->is(...$this->allowedPaths)) {
            $rejected = $user->approval_status === User::APPROVAL_REJECTED;

            return response()->json([
                'code' => $rejected ? 'account_rejected' : 'account_pending',
                'message' => $rejected
                    ? 'Your registration was not approved. Please contact your coordinator.'
                    : 'Your registration is waiting for approval by your coordinator or an administrator.',
            ], 403);
        }

        return $next($request);
    }
}
