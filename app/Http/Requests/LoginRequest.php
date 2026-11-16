<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class LoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['student_id' => strtoupper(trim((string) $this->input('student_id')))]);
    }

    public function rules(): array
    {
        return [
            'student_id' => ['required', 'string', 'max:40'],
            'password' => ['required', 'string', 'max:100'],
            'remember' => ['sometimes', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'student_id.required' => 'Enter your Student ID.',
            'password.required' => 'Enter your password.',
        ];
    }
}
