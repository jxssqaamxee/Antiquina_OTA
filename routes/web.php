<?php

use App\Http\Controllers\Api\EmailVerificationController;
use Illuminate\Support\Facades\Route;

// Link from the verification email. Must come before the catch-all route below. The name
// 'verification.verify' is what Laravel's VerifyEmail notification uses to build the signed URL.
Route::get('/email/verify/{id}/{hash}', [EmailVerificationController::class, 'verify'])
    ->whereNumber('id')
    ->middleware('throttle:10,1')
    ->name('verification.verify');

// Everything that is not /api, /up or a real file is the React single-page app.
Route::view('/{any?}', 'app')->where('any', '^(?!api/|up$|email/).*');
