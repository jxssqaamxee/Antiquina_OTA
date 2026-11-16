<?php

namespace App\Services\Auth;

use App\Models\User;

/**
 * Issues the Sanctum access token for a sign-in.
 *
 *  - "Keep me signed in" ticked  -> long lifetime (OCC_TOKEN_REMEMBER_DAYS).
 *  - not ticked                  -> short lifetime (OCC_TOKEN_HOURS); the app
 *    also keeps the token in sessionStorage, so it ends with the tab/app.
 */
class SessionTokenService
{
    /** @return array{status:string,token:string,expires_at:string,user:array} */
    public function issue(User $user, bool $remember): array
    {
        $expires = $remember
            ? now()->addDays(config('occ.token_remember_days'))
            : now()->addHours(config('occ.token_hours'));

        return [
            'status' => 'ok',
            'token' => $user->createToken('web', ['*'], $expires)->plainTextToken,
            'expires_at' => $expires->toIso8601String(),
            'user' => $user->toClient(),
        ];
    }
}
