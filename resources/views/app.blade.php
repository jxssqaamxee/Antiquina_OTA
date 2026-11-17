@php
    // Colour theme, read from the "occ-theme" cookie that utils/theme.js writes (white | black | blue | yellow | maroon).
    $occTheme = request()->cookie('occ-theme', 'white');
    $occTheme = in_array($occTheme, ['white', 'black', 'blue', 'yellow', 'maroon'], true) ? $occTheme : 'white';
    // Browser bar / status bar / installed-app title bar: NAVY on light themes, WHITE on the dark theme (same as sclf_APP).
    $occBarColor = $occTheme === 'black' ? '#ffffff' : '#01215f';
    // Phone-only switch: OCC_MOBILE_ONLY = true | false. Laravel turns a bare
    // true/false into a boolean, hence '1' and '' below. Unknown values mean
    // "off" so a typo can never lock everyone out.
    $occMobileOnly = match (strtolower(trim((string) config('occ.mobile_only', 'true')))) {
        'true', '1', 'on', 'yes' => 'true',
        default => 'false',
    };

    // DevTools / inspect protection: OCC_INSPECT_PROTECTION = true | false (same rules).
    $occInspect = match (strtolower(trim((string) config('occ.inspect_protection', 'true')))) {
        'true', '1', 'on', 'yes' => 'true',
        default => 'false',
    };
@endphp
<!DOCTYPE html>
<html lang="en" data-mobile-only="{{ $occMobileOnly }}" data-inspect-protection="{{ $occInspect }}" style="background:#ffffff; overscroll-behavior-y: none; -webkit-text-size-adjust: 100%;">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
    <title>{{ config('app.name') }} | Opol Community College</title>
    <meta name="description" content="Real-time on-the-job training duty log and hours tracker for Opol Community College trainees.">
    <meta name="theme-color" content="{{ $occBarColor }}">
    <meta name="color-scheme" content="light dark">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <meta name="format-detection" content="telephone=no">
    <!-- Saved colour theme, applied before first paint (see resources/js/utils/theme.js). -->
    <script>
        try {
            var occBg = { white: '#ffffff', black: '#0a0c12', blue: '#f1f6fe', yellow: '#fdf8ec', maroon: '#fdf3f4' };
            var occBar = function (t) { return t === 'black' ? '#ffffff' : '#01215f'; }; // navy on light themes, white on dark
            var occTheme = localStorage.getItem('occ_theme');
            if (!occBg[occTheme]) occTheme = 'white';
            var occDark = occTheme === 'black';
            var root = document.documentElement;
            root.setAttribute('data-theme', occTheme);
            root.style.background = occBg[occTheme];
            // Native bits (scrollbars, form controls, overscroll) match from the very first frame.
            root.style.colorScheme = occDark ? 'dark' : 'light';
            document.querySelector('meta[name="theme-color"]').setAttribute('content', occBar(occTheme));
            document.querySelector('meta[name="color-scheme"]').setAttribute('content', occDark ? 'dark' : 'light');
            document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]').setAttribute('content', occDark ? 'black' : 'default');
        } catch (e) { /* storage blocked: the default light theme is used */ }
    </script>

    <!-- PWA -->
    <!-- Served by PwaManifestController: its theme_color follows the saved theme (cookie), so the cookie
         must be sent with the manifest request (use-credentials). -->
    <link rel="manifest" href="{{ route('pwa.manifest', [], false) }}" crossorigin="use-credentials">
    <meta name="application-name" content="OCCDL">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-title" content="OCCDL">
    <link rel="icon" href="/favicon.ico" sizes="any">
    <link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-32.png?v=3">
    <link rel="icon" type="image/png" sizes="16x16" href="/icons/icon-16.png?v=3">
    <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png?v=3">
    <!-- iPhone / iPad home-screen icon: opaque 180px tile (a transparent one turns black on iOS). -->
    <!-- No query string and a brand-new file name: iOS keeps a failed/blank icon per URL, so a new URL
         makes it fetch again. /apple-touch-icon.png (root) is the address iOS tries by itself. -->
    <link rel="apple-touch-icon" sizes="180x180" href="/icons/occdl-touch-180.png">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <meta name="msapplication-TileImage" content="/icons/icon-192.png?v=3">
    <meta name="msapplication-TileColor" content="#01215f">

    <!-- iOS zooms the page when a field with text smaller than 16px gets focus.
         On touch screens keep every text field at 16px so tapping one never zooms. -->
    <style>
        @media (pointer: coarse) {
            input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="color"]):not([type="button"]):not([type="submit"]),
            select,
            textarea { font-size: 16px !important; }
        }
    </style>

    @viteReactRefresh
    @vite('resources/js/main.jsx')
</head>
<body style="margin:0; overscroll-behavior-y: none; touch-action: pan-x pan-y; min-height: 100vh; min-height: 100dvh;">
    <div id="app"></div>
    <noscript>OCCDL needs JavaScript. Please enable it and reload.</noscript>
</body>
</html>
