<?php

namespace App\Http\Requests;

use App\Support\Formats;
use Illuminate\Foundation\Http\FormRequest;

/** Admin / Coordinator sign-in: a staff ID + password. Students use LoginRequest (Student ID). */
class StaffLoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['staff_id' => strtoupper(trim((string) $this->input('staff_id')))]);
    }

    public function rules(): array
    {
        return [
            'staff_id' => ['required', 'string', 'regex:'.Formats::STAFF_ID],
            'password' => ['required', 'string', 'max:100'],
            'remember' => ['sometimes', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'staff_id.required' => 'Enter your Staff ID.',
            'staff_id.regex' => 'Staff ID may only contain letters, numbers, dashes, dots and underscores.',
            'password.required' => 'Enter your password.',
        ];
    }
}
