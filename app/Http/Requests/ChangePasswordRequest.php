<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

/** Change the password: current password + a new, different one. */
class ChangePasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'max:100', 'confirmed', Password::defaults(), 'different:current_password'],
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
