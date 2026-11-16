<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

/** Set a first password (Google sign-ups) or change the existing one. */
class ChangePasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $hasPassword = $this->user()?->password !== null;

        return [
            'current_password' => [$hasPassword ? 'required' : 'nullable', 'string'],
            'password' => array_values(array_filter([
                'required', 'string', 'max:100', 'confirmed', Password::defaults(),
                $hasPassword ? 'different:current_password' : null,
            ])),
        ];
    }

    public function messages(): array
    {
        return [
            'current_password.required' => 'Enter your current password.',
            'password.required' => 'Enter a new password.',
            'password.confirmed' => 'Passwords do not match.',
            'password.different' => 'Your new password must be different from your current password.',
        ];
    }
}
