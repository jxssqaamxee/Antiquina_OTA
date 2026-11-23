<?php

namespace App\Http\Requests;

use App\Models\Course;
use App\Support\Formats;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

/**
 * Create-account rules (same conventions as sclf_APP):
 *  - Student ID  YYYY-N-NNNNN
 *  - E-mail      occ.lastname.firstname@gmail.com, lastname must match the Last name field
 *                (must then be verified with the emailed code / link)
 *  - Names       letters, spaces, hyphens, apostrophes
 *  - Password    8+ characters with upper-case, lower-case and a number
 *  - Photo       required JPG/PNG/WebP, max 5 MB (plain upload, no content checks)
 */
class RegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'student_id' => trim((string) $this->input('student_id')),
            'first_name' => Formats::squish($this->input('first_name')),
            'middle_name' => Formats::squish($this->input('middle_name')),
            'last_name' => Formats::squish($this->input('last_name')),
            'email' => strtolower(preg_replace('/\s+/', '', (string) $this->input('email'))),
        ]);
    }

    /** Roster check. One message for "not listed" and "wrong course" so the form never says which IDs exist. */
    private function onRoster(): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail) {
            $row = DB::table('enrolled_students')->where('student_id', $value)->first();
            $courseName = $row?->course_id ? Course::whereKey($row->course_id)->value('name') : null;

            // A row without a course (made by the old ID-only import) is matched on the Student ID alone.
            if (! $row || ($courseName !== null && $courseName !== (string) $this->input('course'))) {
                $fail('We could not match this Student ID and course to your coordinator’s list. Check both, or contact your coordinator.');
            }
        };
    }

    public function rules(): array
    {
        return [
            'student_id' => array_values(array_filter([
                'required', 'string', 'regex:'.Formats::STUDENT_ID, 'unique:users,student_id',
                // Only trainees on the coordinators' roster may register (OCC_ROSTER_ENFORCE=true): the Student ID
                // must be on the list AND the chosen course must be the one the coordinator imported for it.
                config('occ.roster_enforce') ? $this->onRoster() : null,
            ])),
            'first_name' => ['required', 'string', 'max:80', 'regex:'.Formats::NAME],
            'middle_name' => ['nullable', 'string', 'max:80', 'regex:'.Formats::NAME],
            'last_name' => ['required', 'string', 'max:80', 'regex:'.Formats::NAME],
            'email' => [
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
            // Required so admin can verify who you are.
            'profile_photo' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
            'password' => ['required', 'string', 'max:100', 'confirmed', Password::defaults()],
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
            'email.regex' => 'Email must follow the format occ.lastname.firstname@gmail.com (numbers after the first name are optional).',
            'email.unique' => 'That email address is already registered. Sign in instead, or use a different email.',
            'course.required' => 'Please choose your course.',
            'course.in' => 'Please choose your course from the list.',
            'profile_photo.required' => 'Profile photo is required so your coordinator can verify you.',
            'profile_photo.image' => 'That file is not a picture. Use a JPG, PNG or WebP photo.',
            'profile_photo.mimes' => 'Use a JPG, PNG or WebP photo.',
            'profile_photo.max' => 'The photo must be smaller than 5 MB.',
            'profile_photo.uploaded' => 'The photo could not be uploaded. It must be smaller than 5 MB.',
            'password.required' => 'Password is required.',
            'password.confirmed' => 'Passwords do not match.',
        ];
    }
}
