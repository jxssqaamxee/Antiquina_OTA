<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The web-app manifest, served dynamically (like sclf_APP) so the installed app's title-bar colour
 * follows the visitor's saved theme: NAVY on the light themes, WHITE on the dark theme.
 * The theme comes from the "occ-theme" cookie that resources/js/utils/theme.js writes.
 */
class PwaManifestController extends Controller
{
    /** Page background per theme (same values as resources/js/utils/theme.js). */
    private const BACKGROUNDS = [
        'white' => '#ffffff',
        'black' => '#0a0c12',
        'blue' => '#f1f6fe',
        'yellow' => '#fdf8ec',
        'maroon' => '#fdf3f4',
    ];

    public function __invoke(Request $request): JsonResponse
    {
        $theme = (string) $request->cookie('occ-theme', 'white');
        $theme = array_key_exists($theme, self::BACKGROUNDS) ? $theme : 'white';

        $icon = fn (string $file, string $size, string $purpose) => [
            'src' => "/icons/{$file}?v=3", 'sizes' => "{$size}x{$size}", 'type' => 'image/png', 'purpose' => $purpose,
        ];

        $manifest = [
            'id' => '/',
            'name' => 'OCCDL',
            'short_name' => 'OCCDL',
            'description' => 'OCCDL: real-time on-the-job training duty log and hours tracker for Opol Community College trainees.',
            'start_url' => '/?source=pwa',
            'scope' => '/',
            'display' => 'standalone',
            'display_override' => ['standalone', 'minimal-ui'],
            'orientation' => 'portrait',
            'prefer_related_applications' => false,
            'background_color' => self::BACKGROUNDS[$theme],
            // Title-bar colour of the installed app: navy on light themes, white on the dark theme.
            'theme_color' => $theme === 'black' ? '#ffffff' : '#01215f',
            'lang' => 'en',
            'dir' => 'ltr',
            'categories' => ['education', 'productivity'],
            'icons' => [
                $icon('icon-48.png', '48', 'any'),
                $icon('icon-96.png', '96', 'any'),
                $icon('icon-144.png', '144', 'any'),
                $icon('icon-192.png', '192', 'any'),
                $icon('icon-384.png', '384', 'any'),
                $icon('icon-512.png', '512', 'any'),
                $icon('icon-192-maskable.png', '192', 'maskable'),
                $icon('icon-512-maskable.png', '512', 'maskable'),
            ],
            'shortcuts' => [
                ['name' => 'Logbook', 'short_name' => 'Logbook', 'url' => '/logbook', 'icons' => [['src' => '/icons/icon-192.png?v=3', 'sizes' => '192x192']]],
                ['name' => 'Profile', 'short_name' => 'Profile', 'url' => '/profile', 'icons' => [['src' => '/icons/icon-192.png?v=3', 'sizes' => '192x192']]],
            ],
        ];

        // Built by hand (not response()->json) so nothing else can ever change the body: it is
        // always plain JSON, whatever the server is doing.
        return new JsonResponse(
            $manifest,
            200,
            ['Content-Type' => 'application/manifest+json; charset=UTF-8', 'Cache-Control' => 'no-cache', 'Vary' => 'Cookie'],
        );
    }
}
