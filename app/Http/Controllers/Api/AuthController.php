<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\GoogleCredentialRequest;
use App\Http\Requests\LoginRequest;
use App\Http\Requests\RegisterRequest;
use App\Models\User;
use App\Services\Auth\GoogleTokenVerifier;
use App\Services\Auth\SessionTokenService;
use App\Support\Formats;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(
        private GoogleTokenVerifier $google,
        private SessionTokenService $tokens,
    ) {}

    /** Public: course list + whether Google sign-in is configured. */
    public function config(): JsonResponse
    {
        return response()->json([
            'google_client_id' => config('occ.google_client_id'),
            'courses' => config('occ.courses'),
        ]);
    }

    public function register(RegisterRequest $request): JsonResponse
    {
        $data = $request->validated();
        $profile = $request->googleProfile();

        $user = User::create([
            'student_id' => $data['student_id'],
            'first_name' => Formats::titleCase($data['first_name']),
            'middle_name' => ! empty($data['middle_name']) ? Formats::titleCase($data['middle_name']) : null,
            'last_name' => Formats::titleCase($data['last_name']),
            'email' => $data['email'],
            'course' => $data['course'],
            'password' => $profile ? null : $data['password'],
            'google_id' => $profile['sub'] ?? null,
            'avatar' => $profile['picture'] ?? null,
            'email_verified_at' => $profile ? now() : null,
        ]);

        // Registering has no checkbox; it has always meant a persistent session.
        return response()->json($this->tokens->issue($user, true), 201);
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $data = $request->validated();

        $user = User::where('student_id', $data['student_id'])->first();

        // Same message for "no such ID", "no password set" and "wrong password"
        // so the form never reveals which Student IDs exist.
        if (! $user || ! $user->password || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['student_id' => 'Student ID or password is incorrect.']);
        }

        return response()->json($this->tokens->issue($user, (bool) ($data['remember'] ?? false)));
    }

    public function google(GoogleCredentialRequest $request): JsonResponse
    {
        $profile = $this->google->verify($request->validated('credential'));
        if (! $profile) {
            throw ValidationException::withMessages(['credential' => 'Google sign-in could not be verified. Please try again.']);
        }

        $user = User::where('google_id', $profile['sub'])->first()
            ?? User::where('email', $profile['email'])->first();

        if (! $user) {
            // First time with this Google account: the app finishes sign-up
            // (Student ID, names, course) and calls /register with the credential.
            return response()->json([
                'status' => 'needs_registration',
                'profile' => [
                    'email' => $profile['email'],
                    'first_name' => $profile['first_name'],
                    'last_name' => $profile['last_name'],
                    'picture' => $profile['picture'],
                ],
            ], 202);
        }

        $user->forceFill([
            'google_id' => $user->google_id ?: $profile['sub'],
            'avatar' => $user->avatar ?: $profile['picture'],
            'email_verified_at' => $user->email_verified_at ?: now(),
        ])->save();

        return response()->json($this->tokens->issue($user, true));
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $request->user()->toClient()]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['ok' => true]);
    }
}
