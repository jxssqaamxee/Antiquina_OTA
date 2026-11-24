<?php

namespace App\Http\Middleware;

use App\Services\Auth\TwoFactorService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** When OCC_2FA_REQUIRED is on, an Admin / Coordinator without two-factor can only open the enrolment calls. */
class EnsureTwoFactorEnrolled
{
    /** @var list<string> */
    protected array $allowedPaths = [
        'api/me',
        'api/me/photo',
        'api/auth/logout',
        'api/email/*',
        'api/profile/password',
        'api/profile/complete-setup',
        'api/2fa/*',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && app(TwoFactorService::class)->required($user) && ! $user->hasTwoFactor() && ! $request->is(...$this->allowedPaths)) {
            return response()->json([
                'code' => 'two_factor_setup_required',
                'message' => 'Set up two-factor authentication to continue.',
            ], 403);
        }

        return $next($request);
    }
}
