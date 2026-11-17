<?php

use App\Http\Controllers\Api\EmailVerificationController;
use App\Http\Controllers\PwaManifestController;
use Illuminate\Support\Facades\Route;

// Web-app manifest whose theme_color follows the saved theme. A static public/manifest.webmanifest
// would win over this route, so that file must not exist.
Route::get('/manifest.webmanifest', PwaManifestController::class)->name('pwa.manifest');

// Link from the verification email. Must come before the catch-all route below. The name
// 'verification.verify' is what Laravel's VerifyEmail notification uses to build the signed URL.
Route::get('/email/verify/{id}/{hash}', [EmailVerificationController::class, 'verify'])
    ->whereNumber('id')
    ->middleware('throttle:10,1')
    ->name('verification.verify');

// Everything that is not /api, /up or a real file is the React single-page app.
Route::view('/{any?}', 'app')->where('any', '^(?!api/|up$|email/).*');
