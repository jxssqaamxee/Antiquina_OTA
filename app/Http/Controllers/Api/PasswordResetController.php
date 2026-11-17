<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Auth\SessionLogin;
use Carbon\Carbon;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules;

/**
 * Forgot / reset password: ask for a link -> check link -> reset.
 *
 * Asking for a link answers the SAME way for every email (registered or not), so this
 * form can never be used to find out who has an account. The email, if there is an
 * account, is sent after the response. Each email + IP is rate limited.
 */
class PasswordResetController extends Controller
{
    private const MAX_ASKS = 5;
    private const DECAY_SECONDS = 600; // 10 minutes, per email + IP

    private const SENT = 'If an account uses this email, a password reset link is on its way. Check your inbox and the spam folder.';
    private const LINK_INVALID = 'This reset link is no longer valid. It may have already been used, been replaced by a newer link, or never belonged to this account. Please request a new link.';
    private const LINK_EXPIRED = 'This reset link has expired. For your security, links only work for a short time. Please request a new one.';

    /** Email the reset link (also used to resend). Same answer for every address. */
    public function sendResetLink(Request $request): JsonResponse
    {
        $request->validate(['email' => 'required|email']);

        $email = strtolower(trim($request->email));
        $key = 'forgot-password|'.$email.'|'.$request->ip();

        if (RateLimiter::tooManyAttempts($key, self::MAX_ASKS)) {
            $minutes = max(1, (int) ceil(RateLimiter::availableIn($key) / 60));

            return response()->json([
                'success' => false,
                'code' => 'throttled',
                'message' => "Too many attempts. Please try again in {$minutes} minute".($minutes === 1 ? '' : 's').'.',
            ], 429);
        }

        RateLimiter::hit($key, self::DECAY_SECONDS);

        // After the response is sent, so the answer is not slower for real accounts.
        // Laravel's broker applies its own 60-second per-account throttle.
        defer(function () use ($email) {
            try {
                Password::sendResetLink(['email' => $email]);
            } catch (\Throwable $e) {
                report($e);
            }
        });

        return response()->json(['success' => true, 'message' => self::SENT]);
    }

    /**
     * 'ok' | 'expired' | 'invalid'. Laravel keeps ONE row per account: a newer link
     * replaces the old row and a successful reset deletes it, so "no row", "wrong
     * token" and "unknown account" are all 'invalid' on purpose.
     */
    private function linkState(string $email, string $token): string
    {
        $user = User::where('email', $email)->first();
        if (! $user) {
            return 'invalid';
        }

        $table = config('auth.passwords.users.table', 'password_reset_tokens');
        $row = DB::table($table)->where('email', $user->getEmailForPasswordReset())->first();

        if (! $row || ! Hash::check($token, $row->token)) {
            return 'invalid';
        }

        $minutes = (int) config('auth.passwords.users.expire', 60);

        return Carbon::parse($row->created_at)->addMinutes($minutes)->isPast() ? 'expired' : 'ok';
    }

    /** Read-only: is this emailed link still usable? Always 200. */
    public function checkToken(Request $request): JsonResponse
    {
        $request->validate(['token' => 'required|string', 'email' => 'required|email']);

        $state = $this->linkState(strtolower(trim($request->email)), (string) $request->token);

        return response()->json([
            'success' => true,
            'data' => [
                'valid' => $state === 'ok',
                'reason' => $state,
                'message' => match ($state) {
                    'expired' => self::LINK_EXPIRED,
                    'invalid' => self::LINK_INVALID,
                    default => null,
                },
            ],
        ]);
    }

    public function reset(Request $request): JsonResponse
    {
        $request->validate([
            'token' => 'required',
            'email' => 'required|email',
            'password' => ['required', 'confirmed', Rules\Password::defaults()],
        ]);

        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function (User $user, string $password) {
                $user->forceFill([
                    'password' => $password, // hashed by the model cast
                    'remember_token' => Str::random(60),
                ])->save();

                // The old password may have been compromised: sign out every device.
                app(SessionLogin::class)->revokeAll($user);

                event(new PasswordReset($user));
            }
        );

        if ($status === Password::PASSWORD_RESET) {
            return response()->json([
                'success' => true,
                'message' => 'Your password has been reset successfully. You can now sign in with your new password.',
            ]);
        }

        if ($status === Password::RESET_THROTTLED) {
            return response()->json([
                'success' => false,
                'code' => 'throttled',
                'message' => 'Too many attempts. Please wait a minute and try again.',
            ], 429);
        }

        $state = $this->linkState(strtolower(trim($request->email)), (string) $request->token);

        return response()->json([
            'success' => false,
            'code' => $state === 'expired' ? 'link_expired' : 'link_invalid',
            'message' => $state === 'expired' ? self::LINK_EXPIRED : self::LINK_INVALID,
        ], 422);
    }
}
