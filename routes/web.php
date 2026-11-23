<?php

use App\Http\Controllers\Api\EmailVerificationController;
use App\Http\Controllers\PwaManifestController;
use Illuminate\Support\Facades\Route;

// Web-app manifest whose theme_color follows the saved theme. Served at /manifest.json, the same address
// sclf_APP uses: a path ending in ".webmanifest" is treated as a static file by some hosts / proxies, which
// then answer with an HTML 404 page, and the browser reports that as
// "Manifest: Line: 1, column: 1, Syntax error". A static public/manifest.json would win over this route,
// so that file must not exist.
//
// It is STATELESS: withoutMiddleware('web') removes the whole web group (cookies, session, CSRF) by its
// GROUP NAME, so it works whatever middleware classes this Laravel version puts in that group. A session
// or database hiccup right after a redeploy can therefore never turn the manifest into an HTML error page.
Route::get('/manifest.json', PwaManifestController::class)->withoutMiddleware('web')->name('pwa.manifest');
// Old address, kept so a page cached by an earlier version still finds a valid manifest.
Route::get('/manifest.webmanifest', PwaManifestController::class)->withoutMiddleware('web');
// Staff (Administrator / Coordinator) app: installs from /administrator, opens on /administrator.
Route::get('/manifest-administrator.json', [PwaManifestController::class, 'staff'])->withoutMiddleware('web')->name('pwa.manifest.staff');

// Link from the verification email. Must come before the catch-all route below. The name
// 'verification.verify' is what Laravel's VerifyEmail notification uses to build the signed URL.
Route::get('/email/verify/{id}/{hash}', [EmailVerificationController::class, 'verify'])
    ->whereNumber('id')
    ->middleware('throttle:10,1')
    ->name('verification.verify');

// Everything that is not /api, /up or a real file is the React single-page app.
Route::view('/{any?}', 'app')->where('any', '^(?!api/|up$|email/|manifest(-administrator)?\\.(json|webmanifest)$).*');
