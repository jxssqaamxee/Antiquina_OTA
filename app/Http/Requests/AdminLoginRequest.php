<?php

namespace App\Http\Requests;

use App\Support\Formats;
use Illuminate\Foundation\Http\FormRequest;

/** Admin / Coordinator sign-in: an admin ID + password. Students use LoginRequest (Student ID). */
class AdminLoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['admin_id' => strtoupper(trim((string) $this->input('admin_id')))]);
    }

    public function rules(): array
    {
        return [
            'admin_id' => ['required', 'string', 'regex:'.Formats::ADMIN_ID],
            'password' => ['required', 'string', 'max:100'],
            'remember' => ['sometimes', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'admin_id.required' => 'Enter your Administrator ID.',
            'admin_id.regex' => 'ID may only contain letters, numbers, dashes, dots and underscores.',
            'password.required' => 'Enter your password.',
        ];
    }
}
