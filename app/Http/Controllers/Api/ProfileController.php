<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ChangePasswordRequest;
use App\Http\Requests\UpdateProfileRequest;
use App\Support\Formats;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class ProfileController extends Controller
{
    public function update(UpdateProfileRequest $request): JsonResponse
    {
        $data = $request->validated();

        $user = $request->user();
        $user->update([
            'first_name' => Formats::titleCase($data['first_name']),
            'middle_name' => ! empty($data['middle_name']) ? Formats::titleCase($data['middle_name']) : null,
            'last_name' => Formats::titleCase($data['last_name']),
            'course' => $data['course'],
        ]);

        return response()->json(['user' => $user->fresh()->toClient()]);
    }

    /** Set or change the password used for Student ID login. */
    public function password(ChangePasswordRequest $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validated();

        if ($user->password && ! Hash::check($data['current_password'] ?? '', $user->password)) {
            throw ValidationException::withMessages(['current_password' => 'Your current password is incorrect.']);
        }

        $user->update(['password' => $data['password']]);

        return response()->json(['user' => $user->fresh()->toClient()]);
    }
}
