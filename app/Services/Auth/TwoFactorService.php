<?php

namespace App\Services\Auth;

use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

/** TOTP two-factor for Admin / Coordinator accounts: enrollment, verification, recovery codes, sign-in challenge. */
class TwoFactorService
{
    public const CHALLENGE_TTL = 300;
    public const CHALLENGE_MAX_TRIES = 5;

    /** Staff must have 2FA on (config OCC_2FA_REQUIRED). */
    public function required(User $user): bool
    {
        return $user->hasAdminAccess() && (bool) config('occ.two_factor_required');
    }

    /** Creates a NEW unconfirmed secret (replaces an earlier unconfirmed one). Refuses when 2FA is already on. */
    public function beginSetup(User $user): array
    {
        abort_if($user->hasTwoFactor(), 409, 'Two-factor authentication is already enabled.');
        $secret = Totp::generateSecret();
        $user->forceFill(['two_factor_secret' => $secret, 'two_factor_confirmed_at' => null, 'two_factor_recovery_codes' => null, 'two_factor_last_step' => null])->save();

        return ['secret' => $secret, 'otpauth_uri' => Totp::uri($secret, (string) ($user->email ?: $user->admin_id), 'OCCDL')];
    }

    /** Confirms enrollment with a first valid code. Returns the one-time plain recovery codes, or null on a wrong code. */
    public function confirm(User $user, string $code): ?array
    {
        return DB::transaction(function () use ($user, $code) {
            $u = User::lockForUpdate()->findOrFail($user->id);
            if (! $u->two_factor_secret || $u->two_factor_confirmed_at) {
                return null;
            }
            $step = Totp::matchStep($u->two_factor_secret, $code);
            if ($step === null) {
                return null;
            }
            $plain = $this->newRecoveryCodes();
            $u->forceFill([
                'two_factor_confirmed_at' => now(),
                'two_factor_last_step' => $step,
                'two_factor_recovery_codes' => array_map(fn ($c) => Hash::make($c), $plain),
            ])->save();

            return $plain;
        });
    }

    /** Valid TOTP code that has not been used before (replay-safe). */
    public function verifyCode(User $user, string $code): bool
    {
        return DB::transaction(function () use ($user, $code) {
            $u = User::lockForUpdate()->findOrFail($user->id);
            if (! $u->hasTwoFactor()) {
                return false;
            }
            $step = Totp::matchStep($u->two_factor_secret, $code);
            if ($step === null || ($u->two_factor_last_step !== null && $step <= (int) $u->two_factor_last_step)) {
                return false;
            }
            $u->forceFill(['two_factor_last_step' => $step])->save();

            return true;
        });
    }

    /** Consumes one recovery code (each works once). Accepts it with or without dash, any case. */
    public function useRecoveryCode(User $user, string $code): bool
    {
        $code = $this->normalizeRecoveryCode($code);

        return DB::transaction(function () use ($user, $code) {
            $u = User::lockForUpdate()->findOrFail($user->id);
            if (! $u->hasTwoFactor()) {
                return false;
            }
            $codes = (array) ($u->two_factor_recovery_codes ?? []);
            foreach ($codes as $i => $hash) {
                if (Hash::check($code, (string) $hash)) {
                    unset($codes[$i]);
                    $u->forceFill(['two_factor_recovery_codes' => array_values($codes)])->save();

                    return true;
                }
            }

            return false;
        });
    }

    /** Phones type recovery codes without the dash, with spaces or in lowercase: normalise to XXXX-XXXX. */
    public function normalizeRecoveryCode(string $code): string
    {
        $clean = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $code) ?? '');

        return strlen($clean) === 8 ? substr($clean, 0, 4).'-'.substr($clean, 4) : $clean;
    }

    /** True when the text is not a 6-digit authenticator code, so it is checked as a recovery code. */
    public function looksLikeRecoveryCode(string $code): bool
    {
        return ! preg_match('/^\d{6}$/', preg_replace('/[\s-]/', '', $code) ?? '');
    }

    public function regenerateRecoveryCodes(User $user): array
    {
        $plain = $this->newRecoveryCodes();
        $user->forceFill(['two_factor_recovery_codes' => array_map(fn ($c) => Hash::make($c), $plain)])->save();

        return $plain;
    }

    public function disable(User $user): void
    {
        $user->forceFill(['two_factor_secret' => null, 'two_factor_recovery_codes' => null, 'two_factor_confirmed_at' => null, 'two_factor_last_step' => null])->save();
    }

    public function recoveryCodesLeft(User $user): int
    {
        return count((array) ($user->two_factor_recovery_codes ?? []));
    }

    /* ---- sign-in challenge: password was right, the second factor is still owed ---- */

    public function issueChallenge(User $user, bool $remember): string
    {
        $token = Str::random(48);
        Cache::put($this->challengeKey($token), ['user_id' => $user->id, 'remember' => $remember], self::CHALLENGE_TTL);

        return $token;
    }

    /** @return array{user:User,remember:bool}|null */
    public function challenge(string $token): ?array
    {
        $data = Cache::get($this->challengeKey($token));
        $user = $data ? User::find($data['user_id']) : null;

        return $user ? ['user' => $user, 'remember' => (bool) $data['remember']] : null;
    }

    /** Counts a wrong try; after CHALLENGE_MAX_TRIES the challenge is destroyed and the password must be entered again. */
    public function failChallenge(string $token): void
    {
        $k = 'tf-challenge-tries|'.hash('sha256', $token);
        RateLimiter::hit($k, self::CHALLENGE_TTL);
        if (RateLimiter::attempts($k) >= self::CHALLENGE_MAX_TRIES) {
            $this->forgetChallenge($token);
        }
    }

    public function forgetChallenge(string $token): void
    {
        Cache::forget($this->challengeKey($token));
    }

    private function challengeKey(string $token): string
    {
        return 'tf-challenge|'.hash('sha256', $token);
    }

    /** 8 codes shaped XXXX-XXXX, no 0/O/1/I so they are easy to read and type on a phone. */
    private function newRecoveryCodes(): array
    {
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $part = function () use ($alphabet) {
            $out = '';
            for ($i = 0; $i < 4; $i++) {
                $out .= $alphabet[random_int(0, strlen($alphabet) - 1)];
            }

            return $out;
        };

        return collect(range(1, 8))->map(fn () => $part().'-'.$part())->all();
    }
}
