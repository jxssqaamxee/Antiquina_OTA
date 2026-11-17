<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Phone-only switch  (OCC_MOBILE_ONLY)
    |--------------------------------------------------------------------------
    |
    | true  -> ON.  The app opens ONLY on a real phone (installed PWA or phone
    |          browser). Desktops, laptops, tablets and a desktop browser
    |          dragged narrow see a "Open on your phone" screen instead.
    | false -> OFF. The app opens on every device, as a normal responsive site.
    |
    | Runtime setting: after changing .env run `php artisan config:clear`
    | (no rebuild). Anything unrecognised is treated as false, so a typo can
    | never lock everyone out. See resources/views/app.blade.php and
    | resources/js/utils/mobileOnly.js.
    |
    */
    'mobile_only' => env('OCC_MOBILE_ONLY', 'true'),

    /*
    |--------------------------------------------------------------------------
    | DevTools / inspect protection  (OCC_INSPECT_PROTECTION)
    |--------------------------------------------------------------------------
    |
    | true  -> ON.  The app hides itself while browser DevTools is open
    |          (including DevTools "device mode" phone emulation) and blocks
    |          F12 / Ctrl+Shift+I / Ctrl+U / right-click / long-press menus.
    | false -> OFF. Use this while developing and debugging.
    |
    | Runtime setting, same as OCC_MOBILE_ONLY: after changing .env run
    | `php artisan config:clear` (no rebuild). Anything unrecognised is treated
    | as false so a typo can never lock everyone out. It is a deterrent only;
    | real security stays on the server. See resources/js/utils/devtoolsGuard.js.
    |
    */
    'inspect_protection' => env('OCC_INSPECT_PROTECTION', 'true'),

    // Time zone of the host agencies' schedules. The server runs in UTC, so the push reminders
    // (php artisan push:reminders) compare each schedule against THIS clock.
    'timezone' => env('OCC_TIMEZONE', 'Asia/Manila'),
    // How many minutes before the scheduled time-in / time-out the reminder is sent.
    'reminder_start_minutes' => (int) env('OCC_REMINDER_START_MIN', 20),
    'reminder_end_minutes' => (int) env('OCC_REMINDER_END_MIN', 10),
    // A time out logged within this many minutes of the scheduled time out counts as "already clocked
    // out" and silences the clock-out reminder (so leaving 15 minutes early stops it, while a 12:00
    // lunch time out does not). Never smaller than reminder_end_minutes.
    'clock_out_window_minutes' => (int) env('OCC_CLOCK_OUT_WINDOW_MIN', 30),

    // Registration is limited to Gmail addresses.
    'email_domain' => 'gmail.com',

    // Hard limit on how long a sign-in lasts (enforced on the server, see
    // App\Http\Middleware\EnforceSessionLifetime). "Keep me signed in" uses the long value.
    'session_hours' => (int) env('OCC_SESSION_HOURS', 12),
    'session_remember_days' => (int) env('OCC_SESSION_REMEMBER_DAYS', 30),

    // Colleges / courses (same list as sclf_APP's registration dropdown).
    'courses' => [
        ['college' => 'College of Teacher Education (CTE)', 'courses' => [
            'BEED — Bachelor of Elementary Education',
            'BSEd — Bachelor of Secondary Education (Major in English)',
        ]],
        ['college' => 'College of Information Technology (CIT)', 'courses' => [
            'BSIT — Bachelor of Science in Information Technology',
        ]],
        ['college' => 'College of Business Administration (CBA)', 'courses' => [
            'BSBA — Bachelor of Science in Business Administration (Major in Marketing Management)',
            'BSBA — Bachelor of Science in Business Administration (Major in Financial Management)',
        ]],
    ],

    // Keys of the per-user documents the logbook is allowed to sync.
    'document_keys' => ['logbook-v2', 'milestones-v1', 'shift-reminder-v1', 'onboarding-seen-v1', 'notifications-v1'],
    'document_max_bytes' => 4 * 1024 * 1024,
];
