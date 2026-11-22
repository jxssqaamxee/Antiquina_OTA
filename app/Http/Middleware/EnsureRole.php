<?php

namespace App\Http\Middleware;

use App\Support\SecurityLog;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Role gate: ->middleware('role:admin') or ->middleware('role:admin,coordinator').
 * This is the REAL access rule. Hiding a menu or a page in React is only a convenience.
 */
class EnsureRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        if (! $user->hasRole(...$roles)) {
            SecurityLog::event('role_forbidden', ['path' => $request->path(), 'role' => $user->roleName(), 'needs' => implode('|', $roles)]);

            return response()->json([
                'code' => 'role_forbidden',
                'message' => 'You do not have access to this area.',
            ], 403);
        }

        return $next($request);
    }
}
