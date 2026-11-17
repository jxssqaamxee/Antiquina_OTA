@php
    // Phone-only switch: OCC_MOBILE_ONLY = true | false. Laravel turns a bare
    // true/false into a boolean, hence '1' and '' below. Unknown values mean
    // "off" so a typo can never lock everyone out.
    $occMobileOnly = match (strtolower(trim((string) config('occ.mobile_only', 'true')))) {
        'true', '1', 'on', 'yes' => 'true',
        default => 'false',
    };
@endphp
<!DOCTYPE html>
<html lang="en" data-mobile-only="{{ $occMobileOnly }}" style="background:#ffffff; overscroll-behavior-y: none; -webkit-text-size-adjust: 100%;">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
    <title>{{ config('app.name') }} | Opol Community College</title>
    <meta name="description" content="Real-time on-the-job training duty log and hours tracker for Opol Community College trainees.">
    <meta name="theme-color" content="#ffffff">
    <meta name="color-scheme" content="light dark">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <meta name="format-detection" content="telephone=no">
    <!-- Saved colour theme, applied before first paint (see resources/js/utils/theme.js). -->
    <script>
        try {
            var occBg = { white: '#ffffff', black: '#0a0c12', blue: '#f1f6fe', yellow: '#fdf8ec', maroon: '#fdf3f4' };
            var occTheme = localStorage.getItem('occ_theme');
            if (!occBg[occTheme]) occTheme = 'white';
            var occDark = occTheme === 'black';
            var root = document.documentElement;
            root.setAttribute('data-theme', occTheme);
            root.style.background = occBg[occTheme];
            // Native bits (scrollbars, form controls, overscroll) match from the very first frame.
            root.style.colorScheme = occDark ? 'dark' : 'light';
            document.querySelector('meta[name="theme-color"]').setAttribute('content', occBg[occTheme]);
            document.querySelector('meta[name="color-scheme"]').setAttribute('content', occDark ? 'dark' : 'light');
            document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]').setAttribute('content', occDark ? 'black' : 'default');
        } catch (e) { /* storage blocked: the default light theme is used */ }
    </script>

    <!-- PWA -->
    <link rel="manifest" href="/manifest.webmanifest">
    <meta name="application-name" content="OCC Duty Log">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-title" content="Duty Log">
    <link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/icons/icon-16.png">
    <link rel="apple-touch-icon" href="/icons/icon-180.png">

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
    <noscript>OCC Duty Log needs JavaScript. Please enable it and reload.</noscript>
</body>
</html>
