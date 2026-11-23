<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Real push reminders (shift start + clock-out) for phones with the app closed.
// Needs the scheduler: docker/entrypoint.sh runs `php artisan schedule:run` every minute.
// Safe to run on two servers at once: push_reminder_logs lets each reminder go out only once.
Schedule::command('push:reminders')->everyMinute();

// Unverified sign-ups (mistyped email, mail never arrived) are removed after a day, so they never linger in the database.
Schedule::command('accounts:purge-unverified')->dailyAt('03:00');
