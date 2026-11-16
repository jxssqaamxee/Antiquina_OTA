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

    // Google Identity Services "Web client ID" (same value as VITE_GOOGLE_CLIENT_ID).
    'google_client_id' => env('GOOGLE_CLIENT_ID', env('VITE_GOOGLE_CLIENT_ID')),

    // Registration is limited to Gmail addresses.
    'email_domain' => 'gmail.com',

    // How long a sign-in lasts. "Keep me signed in" uses the long value.
    'token_hours' => (int) env('OCC_TOKEN_HOURS', 12),
    'token_remember_days' => (int) env('OCC_TOKEN_REMEMBER_DAYS', 30),

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
    'document_max_bytes' => 2 * 1024 * 1024,
];
