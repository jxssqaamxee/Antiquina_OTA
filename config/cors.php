<?php

/*
| CORS: the React app and the API share ONE origin, so no other website needs access.
| Only your own address (APP_URL) is allowed, and cookies are never shared cross-origin.
*/
return [
    'paths' => ['api/*'],
    'allowed_methods' => ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    'allowed_origins' => array_values(array_filter([rtrim((string) env('APP_URL', ''), '/')])),
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['Content-Type', 'X-Requested-With', 'X-XSRF-TOKEN', 'Accept'],
    'exposed_headers' => [],
    'max_age' => 600,
    'supports_credentials' => false,
];
