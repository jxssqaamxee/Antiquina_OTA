<?php

namespace App\Http\Requests;

use App\Services\Auth\GoogleTokenVerifier;
use App\Support\Formats;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

/**
 * Create-account rules (same conventions as sclf_APP):
 *  - Student ID  YYYY-N-NNNNN
 *  - E-mail      occ.lastname.firstname@gmail.com, lastname must match the Last name field
 *                (Google sign-up: the verified Gmail from Google is used as is)
 *  - Names       letters, spaces, hyphens, apostrophes
 *  - Password    8+ characters with upper-case, lower-case and a number
 */
class RegisterRequest extends FormRequest
{
    private ?array $googleProfile = null;

    public function authorize(): bool
    {
        return true;
    }

    /** The verified Google profile when signing up with Google, otherwise null. */
    public function googleProfile(): ?array
    {
        return $this->googleProfile;
    }

    protected function prepareForValidation(): void
    {
        $merge = [
            'student_id' => strtoupper(trim((string) $this->input('student_id'))),
            'first_name' => Formats::squish($this->input('first_name')),
            'middle_name' => Formats::squish($this->input('middle_name')),
            'last_name' => Formats::squish($this->input('last_name')),
        ];

        if ($this->filled('google_credential')) {
            $profile = app(GoogleTokenVerifier::class)->verify($this->input('google_credential'));
            if (! $profile) {
                throw ValidationException::withMessages(['google_credential' => 'Your Google sign-in expired. Please try again.']);
            }
            $this->googleProfile = $profile;
            // The e-mail of a Google sign-up is the Google account's, not what was typed.
            $merge['email'] = strtolower($profile['email']);
        } else {
            $merge['email'] = strtolower(trim((string) $this->input('email')));
        }

        $this->merge($merge);
    }

    public function rules(): array
    {
        $viaGoogle = $this->googleProfile !== null;

        return [
            'student_id' => ['required', 'string', 'regex:'.Formats::STUDENT_ID, 'unique:users,student_id'],
            'first_name' => ['required', 'string', 'max:80', 'regex:'.Formats::NAME],
            'middle_name' => ['nullable', 'string', 'max:80', 'regex:'.Formats::NAME],
            'last_name' => ['required', 'string', 'max:80', 'regex:'.Formats::NAME],
            'email' => $viaGoogle
                ? ['required', 'string', 'email', 'max:255', 'regex:'.Formats::GMAIL, 'unique:users,email']
                : [
                    'required', 'string', 'email', 'max:255', 'regex:'.Formats::SCHOOL_EMAIL, 'unique:users,email',
                    function (string $attribute, mixed $value, \Closure $fail) {
                        $expected = Formats::emailNameSegment((string) $this->input('last_name'));
                        $actual = explode('.', strtolower((string) $value))[1] ?? '';
                        if ($expected === '' || $actual !== $expected) {
                            $fail('The email must start with occ.'.($expected ?: 'lastname').'. so it matches your Last name.');
                        }
                    },
                ],
            'course' => ['required', 'string', Rule::in(Formats::courses())],
            'password' => $viaGoogle ? ['nullable'] : ['required', 'string', 'max:100', 'confirmed', Password::defaults()],
        ];
    }

    public function messages(): array
    {
        return [
            'student_id.required' => 'Student ID is required.',
            'student_id.regex' => 'Student ID must follow the format YYYY-N-NNNNN, e.g. 2021-2-04062.',
            'student_id.unique' => 'That Student ID is already registered. Sign in instead, or contact an administrator.',
            'first_name.required' => 'First name is required.',
            'first_name.regex' => 'First name can only contain letters, spaces, hyphens and apostrophes.',
            'middle_name.regex' => 'Middle name can only contain letters, spaces, hyphens and apostrophes.',
            'last_name.required' => 'Last name is required.',
            'last_name.regex' => 'Last name can only contain letters, spaces, hyphens and apostrophes.',
            'email.required' => 'Gmail address is required.',
            'email.regex' => $this->googleProfile
                ? 'Please use a Gmail address (name@gmail.com).'
                : 'Email must follow the format occ.lastname.firstname@gmail.com (numbers after the first name are optional).',
            'email.unique' => 'That email address is already registered. Sign in instead, or use a different email.',
            'course.required' => 'Please choose your course.',
            'course.in' => 'Please choose your course from the list.',
            'password.required' => 'Password is required.',
            'password.confirmed' => 'Passwords do not match.',
        ];
    }
}
