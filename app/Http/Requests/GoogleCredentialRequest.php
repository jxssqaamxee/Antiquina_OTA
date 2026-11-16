<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class GoogleCredentialRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return ['credential' => ['required', 'string', 'max:4096']];
    }

    public function messages(): array
    {
        return ['credential.required' => 'Google sign-in did not return a credential. Please try again.'];
    }
}
