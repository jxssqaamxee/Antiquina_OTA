<?php

return [

    /*
    |--------------------------------------------------------------------------
    | VAPID keys (Web Push)
    |--------------------------------------------------------------------------
    |
    | Identify this server to the push services (Apple, Google, Mozilla) so they accept
    | its messages. Generate ONE pair with `php artisan webpush:vapid` and keep it in the
    | environment variables VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY. Never change it afterwards:
    | every phone subscribed under the old public key silently stops receiving reminders.
    |
    */

    // Only these push services may be stored as a device address. Anything else is refused, so a
    // signed-in user cannot make the server send requests to an arbitrary website (SSRF).
    // A host matches when it equals an entry or ends with ".entry".
    'allowed_hosts' => [
        'fcm.googleapis.com',       // Chrome / Edge / Android
        'push.apple.com',           // Safari / iPhone home-screen apps (web.push.apple.com)
        'push.services.mozilla.com', // Firefox
        'notify.windows.com',       // legacy Edge / Windows
    ],

    'vapid' => [
        // Must be "mailto:you@example.com" or an https:// address (Apple rejects a bare email).
        'subject' => env('VAPID_SUBJECT', env('MAIL_FROM_ADDRESS', 'admin@example.com')),
        'public_key' => env('VAPID_PUBLIC_KEY'),
        'private_key' => env('VAPID_PRIVATE_KEY'),
    ],

];
