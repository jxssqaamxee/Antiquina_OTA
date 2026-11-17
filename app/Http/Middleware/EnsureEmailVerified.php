<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Blocks the API for accounts whose email has not been verified yet.
 *
 * The React app sends unverified people to /verify-email; this makes the rule
 * real on the server so it cannot be skipped by calling the API directly.
 *
 * Only a few calls stay open so the person can see who they are, ask for a
 * new link or code, correct a mistyped address, or sign out.
 */
class EnsureEmailVerified
{
    /** @var list<string> */
    protected array $allowedPaths = [
        'api/me',
        'api/me/photo',
        'api/auth/logout',
        'api/email/*',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && ! $user->hasVerifiedEmail() && ! $request->is(...$this->allowedPaths)) {
            return response()->json([
                'code' => 'email_unverified',
                'message' => 'Please verify your email address to continue. Check your inbox for the code or link, or request a new one.',
            ], 403);
        }

        return $next($request);
    }
}
