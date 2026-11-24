<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Http\Requests\RegisterRequest;
use App\Http\Requests\AdminLoginRequest;
use App\Models\User;
use App\Services\Auth\SessionLogin;
use App\Support\Formats;
use App\Support\ProfilePhotoStorage;
use App\Support\SecurityLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(private SessionLogin $sessions) {}

    /** Public: the course list for the register form. (Also hands out the CSRF cookie.) */
    public function config(): JsonResponse
    {
        return response()->json(['courses' => config('occ.courses')]);
    }

    public function register(RegisterRequest $request): JsonResponse
    {
        $data = $request->validated();

        // Refuse an undecodable picture BEFORE the account exists (no half-registered user left behind).
        ProfilePhotoStorage::reencode($request->file('profile_photo'), 'profile_photo');

        $user = User::create([
            'student_id' => $data['student_id'],
            'first_name' => Formats::titleCase($data['first_name']),
            'middle_name' => ! empty($data['middle_name']) ? Formats::titleCase($data['middle_name']) : null,
            'last_name' => Formats::titleCase($data['last_name']),
            'email' => $data['email'],
            'course' => $data['course'],
            'password' => $data['password'],
            // Already validated by RegisterRequest (required image, max 5 MB).
            // The email must be verified before the app opens (code or link).
            'email_verified_at' => null,
        ]);

        // role/approval are not mass-assignable. With approval on, the account stays closed until reviewed.
        if (config('occ.registration_approval')) {
            $user->forceFill(['approval_status' => User::APPROVAL_PENDING])->save();
        }

        // No enrollment yet: the student joins their section (and shows up for the coordinator / admin)
        // only once the email is verified, see EmailVerificationController::enrollWhenVerified().

        ProfilePhotoStorage::save($user, $request->file('profile_photo'), 'profile_photo');

        // Sends the 6-digit code + link. Never fails registration if the mail server is down:
        // the verify screen has a "Resend email" button.
        EmailVerificationController::send($user);

        // Registering has no checkbox; it has always meant a persistent session.
        return response()->json($this->sessions->start($request, $user, true), 201);
    }

    /**
     * Always spends one full password hash, even for an unknown ID or an account with no password,
     * so the response time does not reveal which IDs exist (a real check took ~250 ms, a miss ~3 ms).
     */
    private function passwordMatches(?User $user, string $plain): bool
    {
        $hash = $user?->password;
        if (! $hash) {
            // A valid hash made with the app's current cost; computed once per process.
            static $dummy = null;
            $dummy ??= Hash::make(bin2hex(random_bytes(16)));
            Hash::check($plain, $dummy);

            return false;
        }

        return Hash::check($plain, $hash);
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $data = $request->validated();

        // Per Student ID + IP: the route throttle only counts requests per IP, so one
        // account could still be guessed slowly. 5 wrong passwords lock it for 5 minutes.
        $limiterKey = 'login|'.strtolower((string) $data['student_id']).'|'.$request->ip();
        $accountKey = 'login-account|'.strtolower((string) $data['student_id']);
        if (RateLimiter::tooManyAttempts($limiterKey, 5) || RateLimiter::tooManyAttempts($accountKey, 15)) {
            $minutes = max(1, (int) ceil(max(RateLimiter::availableIn($limiterKey), RateLimiter::availableIn($accountKey)) / 60));
            SecurityLog::failure('login_lockout', ['student_id' => $data['student_id']]);
            throw ValidationException::withMessages([
                'student_id' => "Too many sign-in attempts. Try again in {$minutes} minute".($minutes === 1 ? '' : 's').'.',
            ]);
        }

        $user = User::where('student_id', $data['student_id'])->where('role', User::ROLE_TRAINEE)->first();

        // Same message for "no such ID", "no password set" and "wrong password"
        // so the form never reveals which Student IDs exist.
        if (! $this->passwordMatches($user, $data['password'])) {
            RateLimiter::hit($limiterKey, 300);
            RateLimiter::hit($accountKey, 1800); // all IPs together: 15 wrong tries per 30 min
            SecurityLog::failure('login_failed', ['student_id' => $data['student_id']]);
            throw ValidationException::withMessages(['student_id' => 'Student ID or password is incorrect.']);
        }

        if (! $user->isActive()) {
            SecurityLog::failure('login_deactivated', ['student_id' => $user->student_id]);
            throw ValidationException::withMessages(['student_id' => 'This account has been deactivated. Please contact an administrator.']);
        }

        if ($user->approval_status === User::APPROVAL_REJECTED) {
            SecurityLog::failure('login_rejected', ['student_id' => $user->student_id]);
            throw ValidationException::withMessages(['student_id' => 'Your registration was not approved. Please contact your coordinator.']);
        }

        RateLimiter::clear($limiterKey);
        RateLimiter::clear($accountKey);
        SecurityLog::event('login_ok', ['student_id' => $user->student_id, 'user_id' => $user->id], 'info');


        return response()->json($this->sessions->start($request, $user, (bool) ($data['remember'] ?? false)));
    }


    /** Admin / Coordinator sign-in (Admin ID + password). Trainees never use this route. */
    public function adminLogin(AdminLoginRequest $request): JsonResponse
    {
        $data = $request->validated();

        $limiterKey = 'admin-login|'.strtolower($data['admin_id']).'|'.$request->ip();
        $accountKey = 'admin-login-account|'.strtolower($data['admin_id']);
        if (RateLimiter::tooManyAttempts($limiterKey, 5) || RateLimiter::tooManyAttempts($accountKey, 15)) {
            $minutes = max(1, (int) ceil(max(RateLimiter::availableIn($limiterKey), RateLimiter::availableIn($accountKey)) / 60));
            SecurityLog::failure('admin_login_lockout', ['admin_id' => $data['admin_id']]);
            throw ValidationException::withMessages([
                'admin_id' => "Too many sign-in attempts. Try again in {$minutes} minute".($minutes === 1 ? '' : 's').'.',
            ]);
        }

        $user = User::where('admin_id', $data['admin_id'])->whereIn('role', User::ADMIN_ACCESS_ROLES)->first();

        // One message for "no such ID", "no password set" and "wrong password".
        if (! $this->passwordMatches($user, $data['password'])) {
            RateLimiter::hit($limiterKey, 300);
            RateLimiter::hit($accountKey, 1800);
            SecurityLog::failure('admin_login_failed', ['admin_id' => $data['admin_id']]);
            throw ValidationException::withMessages(['admin_id' => 'ID or password is incorrect.']);
        }

        if (! $user->isActive()) {
            SecurityLog::failure('admin_login_deactivated', ['admin_id' => $user->admin_id]);
            throw ValidationException::withMessages(['admin_id' => 'This account has been deactivated. Please contact an administrator.']);
        }

        // Password was right. With two-factor on, no session is created yet: the client must answer the challenge.
        if ($user->hasTwoFactor()) {
            RateLimiter::clear($limiterKey);
            SecurityLog::event('admin_login_password_ok_2fa_pending', ['admin_id' => $user->admin_id], 'info');

            return response()->json([
                'two_factor_required' => true,
                'temp_token' => app(\App\Services\Auth\TwoFactorService::class)->issueChallenge($user, (bool) ($data['remember'] ?? false)),
            ]);
        }

        RateLimiter::clear($limiterKey);
        RateLimiter::clear($accountKey);
        SecurityLog::event('admin_login_ok', ['admin_id' => $user->admin_id, 'user_id' => $user->id, 'role' => $user->roleName()], 'info');

        return response()->json($this->sessions->start($request, $user, (bool) ($data['remember'] ?? false)));
    }

    /**
     * Public "who is signed in?" probe used when the app opens. Always answers 200:
     * { user: null } for a visitor, { user: {...} } when signed in. A visitor opening the
     * login page is normal, so it must not show up as a red 401 in the browser console.
     * (It also hands out the session + XSRF cookies, so the first POST is never a 419.)
     */
    public function session(Request $request): JsonResponse
    {
        $user = $request->user();

        // A deactivated account must not look signed in (its session rows are also revoked).
        if ($user && ! $user->isActive()) {
            $this->sessions->end($request);
            $user = null;
        }

        return response()->json(['user' => $user?->toClient()])
            ->header('Cache-Control', 'no-store');
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $request->user()->toClient()]);
    }

    public function logout(Request $request): JsonResponse
    {
        // This install must not keep receiving the signed-out person's reminders (shared phones).
        $installId = (string) $request->input('install_id', '');
        if ($request->user() && $installId !== '' && preg_match('/^[A-Za-z0-9_-]{1,64}$/', $installId)) {
            $request->user()->pushSubscriptions()->where('install_id', $installId)->delete();
        }

        $this->sessions->end($request);

        return response()->json(['ok' => true]);
    }
}
