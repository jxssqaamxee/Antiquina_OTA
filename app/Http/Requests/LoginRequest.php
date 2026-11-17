<?php

namespace App\Http\Requests;

use App\Support\Formats;
use Illuminate\Foundation\Http\FormRequest;

class LoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['student_id' => trim((string) $this->input('student_id'))]);
    }

    public function rules(): array
    {
        return [
            'student_id' => ['required', 'string', 'regex:'.Formats::STUDENT_ID],
            'password' => ['required', 'string', 'max:100'],
            'remember' => ['sometimes', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'student_id.required' => 'Enter your Student ID.',
            'student_id.regex' => 'Student ID must follow the format YYYY-N-NNNNN, e.g. 2021-2-04062.',
            'password.required' => 'Enter your password.',
        ];
    }
}
