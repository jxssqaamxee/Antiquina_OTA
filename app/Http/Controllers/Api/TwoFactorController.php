<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Academic\ActivityLogService;
use App\Services\Auth\SessionLogin;
use App\Services\Auth\TwoFactorService;
use App\Support\SecurityLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

/**
 * Authenticator-app two-factor, same API shape as the SCLF app (/api/2fa/*):
 * setup -> confirm (shows recovery codes once) -> status / recovery-codes / disable (password), and
 * login-verify which finishes a sign-in that returned { two_factor_required, temp_token }.
 */
class TwoFactorController extends Controller
{
    // 5 wrong codes per account, then a 10-minute cooldown (as in SCLF).
    private const LOGIN_MAX_ATTEMPTS = 5;
    private const LOGIN_DECAY_SECONDS = 600;

    public function __construct(private TwoFactorService $tf, private ActivityLogService $log) {}

    private function needPassword(Request $request): void
    {
        $request->validate(['password' => ['required', 'string']]);
        if (! Hash::check((string) $request->input('password'), (string) $request->user()->password)) {
            SecurityLog::failure('two_factor_bad_password');
            throw ValidationException::withMessages(['password' => ['Your password is incorrect.']]);
        }
    }

    /** Step 1: a pending secret + otpauth URI for the QR code. 2FA is not on until confirm() succeeds. */
    public function setup(Request $request): JsonResponse
    {
        // Unlike a bare overwrite, an account that already has 2FA must turn it off (with its password) first.
        return response()->json($this->tf->beginSetup($request->user()));
    }

    /** Step 2: a real code proves the QR was scanned; 2FA turns on and the recovery codes are returned once. */
    public function confirm(Request $request, SessionLogin $sessions): JsonResponse
    {
        $request->validate(['code' => ['required', 'string', 'max:12']]);
        $codes = $this->tf->confirm($request->user(), $request->input('code'));
        if ($codes === null) {
            SecurityLog::failure('two_factor_bad_code');
            throw ValidationException::withMessages(['code' => ['Invalid authentication code.']]);
        }
        $sessions->revokeOthers($request->user(), $request->session()->getId());
        $this->log->record($request->user(), 'two_factor.enabled', 'user', $request->user()->id);

        return response()->json([
            'success' => true,
            'message' => 'Two-factor authentication is now enabled.',
            'recovery_codes' => $codes,
            'user' => $request->user()->fresh()->toClient(),
        ]);
    }

    public function status(Request $request): JsonResponse
    {
        $u = $request->user();

        return response()->json([
            'enabled' => $u->hasTwoFactor(),
            'recovery_codes_remaining' => $this->tf->recoveryCodesLeft($u),
        ]);
    }

    public function regenerateRecoveryCodes(Request $request): JsonResponse
    {
        $this->needPassword($request);
        if (! $request->user()->hasTwoFactor()) {
            throw ValidationException::withMessages(['password' => ['Two-factor authentication is not enabled.']]);
        }
        $this->log->record($request->user(), 'two_factor.recovery_codes_regenerated', 'user', $request->user()->id);

        return response()->json(['success' => true, 'recovery_codes' => $this->tf->regenerateRecoveryCodes($request->user())]);
    }

    public function disable(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->needPassword($request);
        if ($this->tf->required($user)) {
            return response()->json(['code' => 'two_factor_required', 'message' => 'Two-factor authentication is required for your role. Ask an administrator to reset it if you lost your device.'], 403);
        }
        $this->tf->disable($user);
        $this->log->record($user, 'two_factor.disabled', 'user', $user->id);

        return response()->json(['success' => true, 'message' => 'Two-factor authentication has been disabled.', 'user' => $user->fresh()->toClient()]);
    }

    /** Step 3 of a 2FA sign-in: temp_token (from the password step) + authenticator code OR recovery code. */
    public function verifyLogin(Request $request, SessionLogin $sessions): JsonResponse
    {
        $data = $request->validate([
            'temp_token' => ['required', 'string', 'max:100'],
            'code' => ['required', 'string', 'max:20'],
        ]);
        $code = trim($data['code']);

        $found = $this->tf->challenge($data['temp_token']);
        if (! $found || ! $found['user']->hasTwoFactor() || ! $found['user']->isActive()) {
            throw ValidationException::withMessages(['code' => ['This sign-in expired. Enter your ID and password again.']]);
        }
        $user = $found['user'];

        // Per ACCOUNT, so collecting fresh temp tokens never resets the budget.
        $lockKey = '2fa-login|'.$user->id;
        if (RateLimiter::tooManyAttempts($lockKey, self::LOGIN_MAX_ATTEMPTS)) {
            $minutes = max(1, (int) ceil(RateLimiter::availableIn($lockKey) / 60));
            SecurityLog::failure('two_factor_lockout', ['user_id' => $user->id]);
            $this->tf->forgetChallenge($data['temp_token']);
            throw ValidationException::withMessages(['code' => ["Too many incorrect codes. Please sign in again in {$minutes} minute".($minutes === 1 ? '' : 's').'.']]);
        }

        $ok = $this->tf->looksLikeRecoveryCode($code)
            ? $this->tf->useRecoveryCode($user, $code)
            : $this->tf->verifyCode($user, $code);

        if (! $ok) {
            RateLimiter::hit($lockKey, self::LOGIN_DECAY_SECONDS);
            $this->tf->failChallenge($data['temp_token']);
            SecurityLog::failure('two_factor_login_failed', ['user_id' => $user->id]);
            throw ValidationException::withMessages(['code' => ['That code is invalid or has expired.']]);
        }

        RateLimiter::clear($lockKey);
        RateLimiter::clear('admin-login-account|'.strtolower((string) $user->admin_id));
        $this->tf->forgetChallenge($data['temp_token']); // single use
        $recovery = $this->tf->looksLikeRecoveryCode($code);
        if ($recovery) {
            $this->log->record($user, 'two_factor.recovery_code_used', 'user', $user->id, null, ['remaining' => $this->tf->recoveryCodesLeft($user->fresh())]);
        }
        SecurityLog::event('admin_login_ok', ['admin_id' => $user->admin_id, 'user_id' => $user->id, 'role' => $user->roleName(), 'second_factor' => $recovery ? 'recovery' : 'totp'], 'info');

        return response()->json($sessions->start($request, $user, $found['remember']));
    }
}
