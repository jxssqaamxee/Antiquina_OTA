<?php

return [
    // Google Identity Services "Web client ID" (same value as VITE_GOOGLE_CLIENT_ID).
    'google_client_id' => env('GOOGLE_CLIENT_ID', env('VITE_GOOGLE_CLIENT_ID')),

    // Registration is limited to Gmail addresses.
    'email_domain' => 'gmail.com',

    // How long a sign-in lasts. "Keep me signed in" uses the long value.
    'token_hours' => (int) env('OTA_TOKEN_HOURS', 12),
    'token_remember_days' => (int) env('OTA_TOKEN_REMEMBER_DAYS', 30),

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
