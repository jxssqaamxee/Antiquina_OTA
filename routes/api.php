<?php

use App\Http\Controllers\Api\AdminAcademicController;
use App\Http\Controllers\Api\AdminCoordinatorController;
use App\Http\Controllers\Api\AdminDashboardController;
use App\Http\Controllers\Api\AdminProgressionController;
use App\Http\Controllers\Api\AdminTrainingController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CoordinatorReviewController;
use App\Http\Controllers\Api\LogbookReviewController;
use App\Http\Controllers\Api\CoordinatorDashboardController;
use App\Http\Controllers\Api\DocumentController;
use App\Http\Controllers\Api\EmailVerificationController;
use App\Http\Controllers\Api\PasswordResetController;
use App\Http\Controllers\Api\PlacementController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\RosterController;
use App\Http\Controllers\MediaController;
use App\Http\Controllers\PushController;
use Illuminate\Support\Facades\Route;

Route::get('/config', [AuthController::class, 'config']);
// Open to visitors: answers 200 { user: null } instead of a 401 (see AuthController::session).
Route::middleware('session.fresh')->get('/session', [AuthController::class, 'session']);

Route::middleware('throttle:10,1')->group(function () {
    Route::post('/auth/login', [AuthController::class, 'login']);
    Route::post('/auth/admin-login', [AuthController::class, 'adminLogin']);
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
Route::middleware(['auth', 'session.fresh', 'active', 'email.verified', 'setup.complete'])->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    // Own profile photo: only the signed-in owner's session can open it (no shareable links).
    Route::get('/me/photo', [MediaController::class, 'mine']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);

    // Email verification: ask for a new code + link, finish with the 6-digit code,
    // or fix a mistyped address (only while still unverified).
    Route::middleware('throttle:3,1')->post('/email/verification-notification', [EmailVerificationController::class, 'resend']);
    Route::middleware('throttle:10,1')->post('/email/verify-code', [EmailVerificationController::class, 'verifyCode']);
    Route::middleware('throttle:5,1')->post('/email/change', [EmailVerificationController::class, 'changeEmail']);

    // Trainee-only: the logbook, its sync and Web Push reminders (see EnsureRole). Admin and
    // Coordinator accounts have no logbook, so these answer 403 for them.
    Route::middleware('role:trainee')->group(function () {
        // Web Push: reminders that reach the phone with the app closed (see PushController, public/sw.js).
        Route::get('/push/status', [PushController::class, 'status']);
        Route::middleware('throttle:20,1')->group(function () {
            Route::post('/push/subscribe', [PushController::class, 'subscribe']);
            Route::post('/push/unsubscribe', [PushController::class, 'unsubscribe']);
        });
        Route::middleware('throttle:3,1')->post('/push/test', [PushController::class, 'test']);
    });

    // Every role edits its own name and photo (Admin / Coordinator keep their admin ID and email locked).
    Route::put('/profile', [ProfileController::class, 'update']);
    Route::put('/profile/preferences', [ProfileController::class, 'preferences']);
    // First-login setup for an Admin / Coordinator account (photo, name, own password).
    Route::middleware(['role:admin,coordinator', 'throttle:10,1'])->post('/profile/complete-setup', [ProfileController::class, 'completeSetup']);
    Route::put('/profile/password', [ProfileController::class, 'password']);
    Route::middleware('throttle:10,1')->group(function () {
        Route::post('/profile/photo', [ProfileController::class, 'photo']);
        Route::delete('/profile/photo', [ProfileController::class, 'destroyPhoto']);
    });

    // The app debounces writes (one PUT per changed key), so 120/min is far above normal use.
    Route::middleware(['role:trainee', 'throttle:120,1'])->group(function () {
        Route::get('/sync', [DocumentController::class, 'index']);
        Route::put('/sync/{key}', [DocumentController::class, 'update']);
        Route::delete('/sync/{key}', [DocumentController::class, 'destroy']);
    });

    // Trainee review actions (drafts still sync through /api/sync).
    Route::middleware(['role:trainee', 'throttle:60,1'])->group(function () {
        Route::post('/logbook/entries/{entryUid}/submit', [LogbookReviewController::class, 'submit']);
        Route::get('/logbook/hours', [LogbookReviewController::class, 'hours']);
    });

    // Management areas. Each group is closed to every other role; later phases add the real modules.
    Route::prefix('admin')->middleware('role:admin')->group(function () {
        Route::get('/overview', [AdminDashboardController::class, 'show']);
        // Roster: Student ID + course allowed to register, one list per section (see RosterController).
        Route::get('/roster', [RosterController::class, 'index']);
        Route::middleware('throttle:10,1')->get('/roster.csv', [RosterController::class, 'export']);
        Route::middleware('throttle:10,1')->post('/roster/import', [RosterController::class, 'import']);
        Route::delete('/roster/{studentId}', [RosterController::class, 'destroy']);
        // Phase 2: academic structure.
        Route::get('/courses', [AdminAcademicController::class, 'courses']);
        Route::get('/academic-years', [AdminAcademicController::class, 'years']);
        Route::post('/academic-years', [AdminAcademicController::class, 'storeYear']);
        Route::post('/academic-years/{year}/make-current', [AdminAcademicController::class, 'makeYearCurrent']);
        Route::get('/sections', [AdminAcademicController::class, 'sections']);
        Route::post('/sections', [AdminAcademicController::class, 'storeSections']);
        Route::get('/sections/{section}', [AdminAcademicController::class, 'showSection']);
        Route::get('/enrollments', [AdminAcademicController::class, 'enrollments']);
        Route::get('/enrollments/unassigned', [AdminAcademicController::class, 'unassigned']);
        Route::post('/enrollments/{enrollment}/assign-section', [AdminAcademicController::class, 'assign']);
        // Phase 4: progression + transfers.
        Route::get('/academic-years/{year}/progression/prepare', [AdminProgressionController::class, 'prepare']);
        Route::post('/academic-years/{year}/progression/confirm', [AdminProgressionController::class, 'confirm']);
        Route::post('/enrollments/{enrollment}/transfer', [AdminProgressionController::class, 'transfer']);
        // Phase 5b: placements.
        Route::get('/establishments', [PlacementController::class, 'establishments']);
        Route::post('/establishments', [PlacementController::class, 'storeEstablishment']);
        Route::post('/trainees/{user}/placements', [PlacementController::class, 'place'])->whereNumber('user');
        Route::delete('/placements/{id}', [PlacementController::class, 'end'])->whereNumber('id');
        // Phase 5: required-hours exceptions.
        Route::get('/trainees/{user}/hours', [AdminTrainingController::class, 'show'])->whereNumber('user');
        Route::post('/trainees/{user}/hour-exception', [AdminTrainingController::class, 'setException'])->whereNumber('user');
        // Phase 3: coordinators.
        Route::get('/coordinators', [AdminCoordinatorController::class, 'index']);
        Route::post('/coordinators', [AdminCoordinatorController::class, 'store']);
        Route::post('/coordinators/{coordinator}/assign-section', [AdminCoordinatorController::class, 'assign']);
        Route::delete('/coordinators/{coordinator}/assignment', [AdminCoordinatorController::class, 'unassign']);
        Route::get('/activity', [AdminCoordinatorController::class, 'activity']);
        // Phase 7: reports + announcements.
        Route::get('/reports/trainees', [ReportController::class, 'trainees']);
        Route::middleware('throttle:10,1')->get('/reports/trainees.csv', [ReportController::class, 'export']);
        Route::get('/announcements', [ReportController::class, 'announcements']);
        Route::middleware('throttle:10,1')->post('/announcements', [ReportController::class, 'publish']);
    });
    Route::prefix('coordinator')->middleware('role:coordinator')->group(function () {
        Route::get('/overview', [CoordinatorDashboardController::class, 'show']);
        // Roster: Student ID + course allowed to register, one list per section (see RosterController).
        Route::get('/roster', [RosterController::class, 'index']);
        Route::middleware('throttle:10,1')->get('/roster.csv', [RosterController::class, 'export']);
        Route::middleware('throttle:10,1')->post('/roster/import', [RosterController::class, 'import']);
        Route::delete('/roster/{studentId}', [RosterController::class, 'destroy']);
        Route::get('/trainees', [CoordinatorDashboardController::class, 'trainees']);
        Route::get('/trainees/{id}', [CoordinatorDashboardController::class, 'trainee'])->whereNumber('id');
        Route::get('/activity', [CoordinatorDashboardController::class, 'activity']);
        // Phase 7: reports + announcements.
        Route::get('/reports/trainees', [ReportController::class, 'trainees']);
        Route::middleware('throttle:10,1')->get('/reports/trainees.csv', [ReportController::class, 'export']);
        Route::get('/announcements', [ReportController::class, 'announcements']);
        Route::middleware('throttle:10,1')->post('/announcements', [ReportController::class, 'publish']);
        // Phase 5b: placements.
        Route::get('/establishments', [PlacementController::class, 'establishments']);
        Route::post('/establishments', [PlacementController::class, 'storeEstablishment']);
        Route::post('/trainees/{user}/placements', [PlacementController::class, 'place'])->whereNumber('user');
        Route::delete('/placements/{id}', [PlacementController::class, 'end'])->whereNumber('id');
        // Phase 5: logbook review.
        Route::get('/approvals', [CoordinatorReviewController::class, 'pending']);
        Route::get('/trainees/{id}/entries', [CoordinatorReviewController::class, 'traineeEntries'])->whereNumber('id');
        Route::post('/entries/{id}/approve', [CoordinatorReviewController::class, 'approve'])->whereNumber('id');
        Route::post('/entries/{id}/reject', [CoordinatorReviewController::class, 'reject'])->whereNumber('id');
    });
});
