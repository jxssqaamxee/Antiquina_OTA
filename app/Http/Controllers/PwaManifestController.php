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
        'dark-white' => '#0a0a0a',
        'dark-blue' => '#060d1f',
        'dark-yellow' => '#120b02',
        'dark-maroon' => '#14060a',
    ];

    /** Trainee app: installs from the main address and opens on "/". */
    public function __invoke(Request $request): JsonResponse
    {
        return $this->build($request, [
            'id' => '/',
            'name' => 'OCCDL',
            'short_name' => 'OCCDL',
            'description' => 'OCCDL: real-time on-the-job training duty log and hours tracker for Opol Community College trainees.',
            'start_url' => '/?source=pwa',
        ], true);
    }

    /**
     * Staff app (Administrator + Coordinator): installs from /administrator and opens there. It has its own
     * `id`, so it is a SEPARATE installed app from the trainee one (both can live on the same device), and it
     * is never sent to the phone-only screen because /administrator is a management address.
     */
    public function staff(Request $request): JsonResponse
    {
        return $this->build($request, [
            'id' => '/administrator',
            'name' => 'OCCDL Administrator',
            'short_name' => 'OCCDL Admin',
            'description' => 'OCCDL for Administrators and Coordinators of Opol Community College: manage trainees, rosters and logbook approvals.',
            'start_url' => '/administrator?source=pwa',
        ], false);
    }

    private function build(Request $request, array $identity, bool $traineeShortcuts): JsonResponse
    {
        $theme = (string) $request->cookie('occ-theme', 'white');
        $theme = array_key_exists($theme, self::BACKGROUNDS) ? $theme : 'white';

        $manifest = $identity + [
            'scope' => '/',
            'display' => 'standalone',
            'display_override' => ['standalone', 'minimal-ui'],
            'orientation' => 'portrait',
            'prefer_related_applications' => false,
            'background_color' => self::BACKGROUNDS[$theme],
            // Title-bar colour of the installed app: navy on light themes, white on the dark theme.
            'theme_color' => ($theme === 'black' || str_starts_with($theme, 'dark-')) ? '#ffffff' : '#01215f',
            'lang' => 'en',
            'dir' => 'ltr',
            'categories' => ['education', 'productivity'],
            'icons' => [
                // Same three icons as SCLF: the shield on a transparent background, and a full-bleed
                // navy "maskable" version that Android can crop to a circle / squircle.
                ['src' => '/images/icon-192.png', 'sizes' => '192x192', 'type' => 'image/png', 'purpose' => 'any'],
                ['src' => '/images/icon-512.png', 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'any'],
                ['src' => '/images/icon-maskable-512.png', 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'maskable'],
            ],
            'shortcuts' => $traineeShortcuts ? [
                ['name' => 'Logbook', 'short_name' => 'Logbook', 'url' => '/logbook', 'icons' => [['src' => '/images/icon-192.png', 'sizes' => '192x192']]],
                ['name' => 'Profile', 'short_name' => 'Profile', 'url' => '/profile', 'icons' => [['src' => '/images/icon-192.png', 'sizes' => '192x192']]],
            ] : [
                ['name' => 'Coordinator', 'short_name' => 'Coordinator', 'url' => '/coordinator', 'icons' => [['src' => '/images/icon-192.png', 'sizes' => '192x192']]],
                ['name' => 'Admin', 'short_name' => 'Admin', 'url' => '/admin', 'icons' => [['src' => '/images/icon-192.png', 'sizes' => '192x192']]],
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
