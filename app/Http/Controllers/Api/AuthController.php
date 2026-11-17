<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Http\Requests\RegisterRequest;
use App\Models\User;
use App\Services\Auth\SessionLogin;
use App\Support\Formats;
use App\Support\ProfilePhotoStorage;
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
            'profile_photo' => ProfilePhotoStorage::store($request->file('profile_photo')),
            // The email must be verified before the app opens (code or link).
            'email_verified_at' => null,
        ]);

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
        if (RateLimiter::tooManyAttempts($limiterKey, 5)) {
            $minutes = max(1, (int) ceil(RateLimiter::availableIn($limiterKey) / 60));
            throw ValidationException::withMessages([
                'student_id' => "Too many sign-in attempts. Try again in {$minutes} minute".($minutes === 1 ? '' : 's').'.',
            ]);
        }

        $user = User::where('student_id', $data['student_id'])->first();

        // Same message for "no such ID", "no password set" and "wrong password"
        // so the form never reveals which Student IDs exist.
        if (! $user || ! $user->password || ! Hash::check($data['password'], $user->password)) {
            RateLimiter::hit($limiterKey, 300);
            throw ValidationException::withMessages(['student_id' => 'Student ID or password is incorrect.']);
        }

        RateLimiter::clear($limiterKey);

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
