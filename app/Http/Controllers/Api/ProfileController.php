<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ChangePasswordRequest;
use App\Http\Requests\UpdateProfileRequest;
use App\Support\Formats;
use App\Support\ProfilePhotoStorage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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

    /** Upload or replace the profile photo. Multipart field: `photo`. */
    public function photo(Request $request): JsonResponse
    {
        $request->validate([
            'photo' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
        ], [
            'photo.required' => 'Please choose a photo.',
            'photo.image' => 'That file is not a picture. Use a JPG, PNG or WebP photo.',
            'photo.mimes' => 'Use a JPG, PNG or WebP photo.',
            'photo.max' => 'The photo must be smaller than 5 MB.',
            'photo.uploaded' => 'The photo could not be uploaded. It must be smaller than 5 MB.',
        ]);

        $user = $request->user();
        $old = $user->profile_photo;

        $user->update(['profile_photo' => ProfilePhotoStorage::store($request->file('photo'))]);
        ProfilePhotoStorage::delete($old);

        return response()->json(['user' => $user->fresh()->toClient()]);
    }

    /** Remove the profile photo; the picture falls back to the Google avatar, then initials. */
    public function destroyPhoto(Request $request): JsonResponse
    {
        $user = $request->user();
        $old = $user->profile_photo;

        $user->update(['profile_photo' => null]);
        ProfilePhotoStorage::delete($old);

        return response()->json(['user' => $user->fresh()->toClient()]);
    }
}
