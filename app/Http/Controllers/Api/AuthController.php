<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Http\Requests\RegisterRequest;
use App\Http\Requests\StaffLoginRequest;
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

        try {
            app(\App\Services\Academic\EnrollmentService::class)->enrollOnRegistration($user);
        } catch (\Throwable $e) {
            report($e); // never block registration; Admin sees the student in the unassigned queue
        }

        ProfilePhotoStorage::save($user, $request->file('profile_photo'));

        // Sends the 6-digit code + link. Never fails registration if the mail server is down:
        // the verify screen has a "Resend email" button.
        EmailVerificationController::send($user);

        // Registering has no checkbox; it has always meant a persistent session.
        return response()->json($this->sessions->start($request, $user, true), 201);
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
        if (! $user || ! $user->password || ! Hash::check($data['password'], $user->password)) {
            RateLimiter::hit($limiterKey, 300);
            RateLimiter::hit($accountKey, 1800); // all IPs together: 15 wrong tries per 30 min
            SecurityLog::failure('login_failed', ['student_id' => $data['student_id']]);
            throw ValidationException::withMessages(['student_id' => 'Student ID or password is incorrect.']);
        }

        if (! $user->isActive()) {
            SecurityLog::failure('login_deactivated', ['student_id' => $user->student_id]);
            throw ValidationException::withMessages(['student_id' => 'This account has been deactivated. Please contact an administrator.']);
        }

        RateLimiter::clear($limiterKey);
        RateLimiter::clear($accountKey);
        SecurityLog::event('login_ok', ['student_id' => $user->student_id, 'user_id' => $user->id], 'info');


        return response()->json($this->sessions->start($request, $user, (bool) ($data['remember'] ?? false)));
    }


    /** Admin / Coordinator sign-in (Staff ID + password). Trainees never use this route. */
    public function staffLogin(StaffLoginRequest $request): JsonResponse
    {
        $data = $request->validated();

        $limiterKey = 'staff-login|'.strtolower($data['staff_id']).'|'.$request->ip();
        $accountKey = 'staff-login-account|'.strtolower($data['staff_id']);
        if (RateLimiter::tooManyAttempts($limiterKey, 5) || RateLimiter::tooManyAttempts($accountKey, 15)) {
            $minutes = max(1, (int) ceil(max(RateLimiter::availableIn($limiterKey), RateLimiter::availableIn($accountKey)) / 60));
            SecurityLog::failure('staff_login_lockout', ['staff_id' => $data['staff_id']]);
            throw ValidationException::withMessages([
                'staff_id' => "Too many sign-in attempts. Try again in {$minutes} minute".($minutes === 1 ? '' : 's').'.',
            ]);
        }

        $user = User::where('staff_id', $data['staff_id'])->whereIn('role', User::STAFF_ROLES)->first();

        // One message for "no such staff ID", "no password set" and "wrong password".
        if (! $user || ! $user->password || ! Hash::check($data['password'], $user->password)) {
            RateLimiter::hit($limiterKey, 300);
            RateLimiter::hit($accountKey, 1800);
            SecurityLog::failure('staff_login_failed', ['staff_id' => $data['staff_id']]);
            throw ValidationException::withMessages(['staff_id' => 'Staff ID or password is incorrect.']);
        }

        if (! $user->isActive()) {
            SecurityLog::failure('staff_login_deactivated', ['staff_id' => $user->staff_id]);
            throw ValidationException::withMessages(['staff_id' => 'This account has been deactivated. Please contact an administrator.']);
        }

        RateLimiter::clear($limiterKey);
        RateLimiter::clear($accountKey);
        SecurityLog::event('staff_login_ok', ['staff_id' => $user->staff_id, 'user_id' => $user->id, 'role' => $user->roleName()], 'info');

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
        $this->sessions->end($request);

        return response()->json(['ok' => true]);
    }
}
