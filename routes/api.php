<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DocumentController;
use App\Http\Controllers\Api\ProfileController;
use Illuminate\Support\Facades\Route;

Route::get('/config', [AuthController::class, 'config']);

Route::middleware('throttle:10,1')->group(function () {
    Route::post('/auth/login', [AuthController::class, 'login']);
    Route::post('/auth/google', [AuthController::class, 'google']);
    Route::post('/auth/register', [AuthController::class, 'register']);
});

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);

    Route::put('/profile', [ProfileController::class, 'update']);
    Route::put('/profile/password', [ProfileController::class, 'password']);
    Route::middleware('throttle:10,1')->group(function () {
        Route::post('/profile/photo', [ProfileController::class, 'photo']);
        Route::delete('/profile/photo', [ProfileController::class, 'destroyPhoto']);
    });

    Route::get('/sync', [DocumentController::class, 'index']);
    Route::put('/sync/{key}', [DocumentController::class, 'update']);
    Route::delete('/sync/{key}', [DocumentController::class, 'destroy']);
});
