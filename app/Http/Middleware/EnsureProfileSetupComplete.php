<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Server half of the first-login setup (same idea as sclf_APP): an Admin or Coordinator account created
 * with a password somebody else knows (must_change_password) can do nothing else until it has been through
 * the setup page (photo, name, own password). Only the calls the setup screen needs stay open.
 */
class EnsureProfileSetupComplete
{
    /** @var list<string> */
    protected array $allowedPaths = [
        'api/me',
        'api/me/photo',
        'api/auth/logout',
        'api/email/*',
        'api/profile/complete-setup',
        'api/profile/password',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && $user->hasAdminAccess() && $user->must_change_password && ! $request->is(...$this->allowedPaths)) {
            return response()->json([
                'code' => 'setup_required',
                'message' => 'Please finish setting up your account before continuing.',
            ], 423);
        }

        return $next($request);
    }
}
