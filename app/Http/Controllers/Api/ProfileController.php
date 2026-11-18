<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ChangePasswordRequest;
use App\Http\Requests\UpdateProfileRequest;
use App\Services\Auth\SessionLogin;
use App\Support\Formats;
use App\Support\Logbook\LogbookRules;
use App\Support\Logbook\LogbookStore;
use App\Support\ProfilePhotoStorage;
use App\Support\SecurityLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
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

    /** Account preferences saved on the server (colour theme), so they follow the person to any device. */
    public function preferences(Request $request, LogbookStore $store): JsonResponse
    {
        $data = $request->validate(['theme' => ['required', 'string', Rule::in(LogbookRules::THEMES)]]);

        $user = $request->user();
        $store->saveTheme($user, $data['theme']);

        return response()->json(['user' => $user->fresh()->toClient()]);
    }

    /** Change the password used for Student ID login. */
    public function password(ChangePasswordRequest $request, SessionLogin $sessions): JsonResponse
    {
        $user = $request->user();
        $data = $request->validated();

        if (! $user->password || ! Hash::check($data['current_password'] ?? '', $user->password)) {
            SecurityLog::failure('password_change_failed');
            throw ValidationException::withMessages(['current_password' => 'Your current password is incorrect.']);
        }

        $user->update(['password' => $data['password']]);
        SecurityLog::event('password_changed', [], 'notice');
        \App\Mail\PasswordChangedMail::notify($user);

        // Sign out every OTHER device: whoever had the old password (or a stolen session)
        // loses access. The device making this request stays signed in.
        $sessions->revokeOthers($user, $request->session()->getId());

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

        ProfilePhotoStorage::save($user, $request->file('photo'));

        return response()->json(['user' => $user->fresh()->toClient()]);
    }

    /** Remove the profile photo; the app falls back to the person's initials. */
    public function destroyPhoto(Request $request): JsonResponse
    {
        $user = $request->user();

        ProfilePhotoStorage::clear($user);

        return response()->json(['user' => $user->fresh()->toClient()]);
    }
}
