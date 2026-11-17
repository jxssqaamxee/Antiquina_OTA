<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DocumentController;
use App\Http\Controllers\Api\EmailVerificationController;
use App\Http\Controllers\Api\PasswordResetController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\MediaController;
use Illuminate\Support\Facades\Route;

Route::get('/config', [AuthController::class, 'config']);
// Open to visitors: answers 200 { user: null } instead of a 401 (see AuthController::session).
Route::middleware('session.fresh')->get('/session', [AuthController::class, 'session']);

Route::middleware('throttle:10,1')->group(function () {
    Route::post('/auth/login', [AuthController::class, 'login']);
    Route::post('/auth/register', [AuthController::class, 'register']);
});

// Forgot / reset password (same flow as sclf_APP). Opening the reset page only runs the
// read-only link check, so it has its own, larger budget.
Route::middleware('throttle:6,1')->group(function () {
    Route::post('/forgot-password', [PasswordResetController::class, 'sendResetLink']);
    Route::post('/reset-password', [PasswordResetController::class, 'reset']);
});
Route::middleware('throttle:30,1')->post('/password/reset-token/check', [PasswordResetController::class, 'checkToken']);

// Signed in, but the email may still be unverified: /me, logout and the /email/* calls stay
// open for unverified accounts (see EnsureEmailVerified); everything else needs a verified email.
Route::middleware(['auth', 'session.fresh', 'email.verified'])->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    // Own profile photo: only the signed-in owner's session can open it (no shareable links).
    Route::get('/me/photo', [MediaController::class, 'mine']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);

    // Email verification: ask for a new code + link, finish with the 6-digit code,
    // or fix a mistyped address (only while still unverified).
    Route::middleware('throttle:3,1')->post('/email/verification-notification', [EmailVerificationController::class, 'resend']);
    Route::middleware('throttle:10,1')->post('/email/verify-code', [EmailVerificationController::class, 'verifyCode']);
    Route::middleware('throttle:5,1')->post('/email/change', [EmailVerificationController::class, 'changeEmail']);

    Route::put('/profile', [ProfileController::class, 'update']);
    Route::put('/profile/password', [ProfileController::class, 'password']);
    Route::put('/profile/preferences', [ProfileController::class, 'preferences']);
    Route::middleware('throttle:10,1')->group(function () {
        Route::post('/profile/photo', [ProfileController::class, 'photo']);
        Route::delete('/profile/photo', [ProfileController::class, 'destroyPhoto']);
    });

    // The app debounces writes (one PUT per changed key), so 120/min is far above normal use.
    Route::middleware('throttle:120,1')->group(function () {
        Route::get('/sync', [DocumentController::class, 'index']);
        Route::put('/sync/{key}', [DocumentController::class, 'update']);
        Route::delete('/sync/{key}', [DocumentController::class, 'destroy']);
    });
});
