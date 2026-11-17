<?php

use App\Http\Controllers\Api\EmailVerificationController;
use App\Http\Controllers\PwaManifestController;
use Illuminate\Support\Facades\Route;

// Web-app manifest whose theme_color follows the saved theme. A static public/manifest.webmanifest
// would win over this route, so that file must not exist.
// It is STATELESS (no session, cookies or CSRF): right after a redeploy the database may not be
// ready yet, and a session error would turn the manifest into an HTML error page, which the
// browser reports as "Manifest: Line: 1, column: 1, Syntax error".
Route::get('/manifest.webmanifest', PwaManifestController::class)
    ->withoutMiddleware([
        \Illuminate\Cookie\Middleware\EncryptCookies::class,
        \Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse::class,
        \Illuminate\Session\Middleware\StartSession::class,
        \Illuminate\View\Middleware\ShareErrorsFromSession::class,
        \Illuminate\Foundation\Http\Middleware\ValidateCsrfToken::class,
        \Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class,
    ])
    ->name('pwa.manifest');

// Link from the verification email. Must come before the catch-all route below. The name
// 'verification.verify' is what Laravel's VerifyEmail notification uses to build the signed URL.
Route::get('/email/verify/{id}/{hash}', [EmailVerificationController::class, 'verify'])
    ->whereNumber('id')
    ->middleware('throttle:10,1')
    ->name('verification.verify');

// Everything that is not /api, /up or a real file is the React single-page app.
Route::view('/{any?}', 'app')->where('any', '^(?!api/|up$|email/).*');
