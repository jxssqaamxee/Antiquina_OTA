<?php

use App\Http\Controllers\MediaController;
use Illuminate\Support\Facades\Route;

// Profile photos from the private disk. Access is the signed link itself (an <img>
// tag cannot send a bearer token); see App\Support\PrivateMedia. Must come before
// the catch-all route below.
Route::get('/media/{dir}/{file}', [MediaController::class, 'show'])
    ->middleware(['signed:relative', 'throttle:600,1'])
    // Stateless: an image request should not open a session or set cookies.
    ->withoutMiddleware([
        \Illuminate\Cookie\Middleware\EncryptCookies::class,
        \Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse::class,
        \Illuminate\Session\Middleware\StartSession::class,
        \Illuminate\View\Middleware\ShareErrorsFromSession::class,
        \Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class,
    ])
    ->name('media.show');

// Everything that is not /api, /up or a real file is the React single-page app.
Route::view('/{any?}', 'app')->where('any', '^(?!api/|up$|media/).*');
