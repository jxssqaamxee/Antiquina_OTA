<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Auth\EmailVerificationCodeService;
use App\Support\Formats;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\URL;
use Illuminate\Validation\ValidationException;

/** Email verification: emailed link + 6-digit code (same flow as sclf_APP). */
class EmailVerificationController extends Controller
{
    public function __construct(protected EmailVerificationCodeService $codes) {}

    /**
     * The link in the email lands here (web route, GET /email/verify/{id}/{hash}).
     *
     * It does NOT need the person to be signed in: many people open the email on
     * one device but registered on another. Trust comes from the signed, expiring
     * URL plus the hash of the email address. Always ends in a redirect to the
     * login page with a short status flag, so a stale link just shows a message.
     */
    public function verify(Request $request, int $id, string $hash)
    {
        if (! URL::hasValidSignature($request)) {
            return redirect('/login?verify=invalid');
        }

        $user = User::find($id);

        if (! $user || ! hash_equals(sha1($user->getEmailForVerification()), $hash)) {
            return redirect('/login?verify=invalid');
        }

        if (! $user->hasVerifiedEmail()) {
            $user->markEmailAsVerified();
        }

        return redirect('/login?verify=ok');
    }

    /** Verify with the 6-digit code from the email, typed inside the app. */
    public function verifyCode(Request $request): JsonResponse
    {
        $request->validate(['code' => ['required', 'digits:6']], [
            'code.required' => 'Enter the 6-digit code from your email.',
            'code.digits' => 'The code is 6 digits, numbers only.',
        ]);

        $user = $request->user();

        if ($user->hasVerifiedEmail()) {
            return response()->json(['message' => 'Your email is already verified.', 'email_verified' => true]);
        }

        $result = $this->codes->check($user, (string) $request->input('code'));

        if ($result !== EmailVerificationCodeService::OK) {
            $messages = [
                EmailVerificationCodeService::INVALID => 'That code is not correct. Please check it and try again.',
                EmailVerificationCodeService::EXPIRED => 'That code has expired. Press "Resend email" to get a new one.',
                EmailVerificationCodeService::LOCKED => 'Too many wrong attempts. Press "Resend email" to get a new code.',
            ];

            return response()->json(['message' => $messages[$result], 'email_verified' => false], 422);
        }

        $user->markEmailAsVerified();

        return response()->json([
            'message' => 'Your email is verified.',
            'email_verified' => true,
            'user' => $user->fresh()->toClient(),
        ]);
    }

    /** Send (or re-send) the verification email for the signed-in account. */
    public function resend(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->hasVerifiedEmail()) {
            return response()->json(['message' => 'Your email is already verified.', 'email_verified' => true]);
        }

        if (! self::send($user)) {
            return response()->json(['message' => 'We could not send the email right now. Please try again in a moment.', 'email_verified' => false], 503);
        }

        return response()->json([
            'message' => 'A new verification email has been sent. The code and link expire in 60 minutes.',
            'email_verified' => false,
        ]);
    }

    /**
     * Fix a mistyped address while the account is still unverified. Needs the
     * current password; the new address must follow the same school-email rule
     * as registration, and a fresh code/link is sent to it.
     */
    public function changeEmail(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->hasVerifiedEmail()) {
            return response()->json(['message' => 'Your email is already verified.'], 422);
        }

        $request->merge(['email' => strtolower(trim((string) $request->input('email')))]);

        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'email' => [
                'required', 'string', 'email', 'max:255', 'regex:'.Formats::SCHOOL_EMAIL, 'unique:users,email',
                function (string $attribute, mixed $value, \Closure $fail) use ($user) {
                    $expected = Formats::emailNameSegment((string) $user->last_name);
                    $actual = explode('.', strtolower((string) $value))[1] ?? '';
                    if ($expected === '' || $actual !== $expected) {
                        $fail('The email must start with occ.'.($expected ?: 'lastname').'. so it matches your Last name.');
                    }
                },
            ],
        ], [
            'current_password.required' => 'Enter your current password.',
            'email.required' => 'Gmail address is required.',
            'email.regex' => 'Email must follow the format occ.lastname.firstname@gmail.com (numbers after the first name are optional).',
            'email.unique' => 'That email address is already registered.',
        ]);

        if (! $user->password || ! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages(['current_password' => 'Your current password is incorrect.']);
        }

        $user->forceFill(['email' => $data['email'], 'email_verified_at' => null])->save();

        $sent = self::send($user);

        return response()->json([
            'message' => $sent
                ? 'Email updated. We sent a new code and link to the new address.'
                : 'Email updated, but we could not send the message yet. Press "Resend email".',
            'user' => $user->fresh()->toClient(),
        ]);
    }

    /**
     * Send the email without ever failing the caller. If the mail server is down,
     * registering must still succeed; the person can press "Resend".
     */
    public static function send(User $user): bool
    {
        try {
            $user->sendEmailVerificationNotification();

            return true;
        } catch (\Throwable $e) {
            Log::warning('Could not send verification email', ['user_id' => $user->id, 'error' => $e->getMessage()]);

            return false;
        }
    }
}
