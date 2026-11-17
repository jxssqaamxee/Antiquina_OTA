// ============================================================
// devtoolsGuard.js
// OCC Duty Log - hide the whole app while browser DevTools is open.
//
// Ported from sclf_APP, adapted for a PHONE-ONLY app.
//
// Imported FIRST in main.jsx, before React mounts and before the
// phone-only check, so it also covers:
//   - DevTools that was already open when the URL was typed,
//   - the "open on your phone" screen, and
//   - DevTools "device mode" (phone emulation), which passes the
//     phone-only check because it pretends to be a phone.
//
// While DevTools is detected the page is plain white and shows the same
// text as the <noscript> fallback. Close DevTools and the app comes back
// (no reload needed).
//
// ------------------------------------------------------------
// SWITCH (no rebuild needed):  OCC_INSPECT_PROTECTION in .env
//
//   OCC_INSPECT_PROTECTION=true    production: protection ON
//   OCC_INSPECT_PROTECTION=false   development: protection OFF
//
// The server writes it on <html data-inspect-protection="...">
// (resources/views/app.blade.php), so after changing it run
//   php artisan config:clear
// Anything unrecognised means OFF, so a typo can never lock everybody
// out. Optional build-time fallback if the attribute is missing:
// VITE_ENABLE_INSPECT_PROTECTION=true|false.
//
// While developing (npm run dev only) you can also add
// ?inspect_protection=false to any page URL.
//
// This is a deterrent, not a security boundary: it cannot stop a proxy
// or direct API calls. Real security stays on the server (auth,
// per-user queries, throttling).
// ============================================================

const ON = ['true', '1', 'on', 'yes'];
const flag = (v) => ON.includes(String(v ?? '').trim().toLowerCase());

export function isInspectProtectionEnabled() {
    if (typeof document === 'undefined') return false;
    if (import.meta.env?.DEV) {
        const q = new URLSearchParams(window.location.search).get('inspect_protection');
        if (q !== null) return flag(q);
    }
    const attr = document.documentElement.getAttribute('data-inspect-protection');
    if (attr !== null) return flag(attr);
    return flag(import.meta.env?.VITE_ENABLE_INSPECT_PROTECTION);
}

const COVER_HTML =
    '<h1>OCC Duty Log - Opol Community College</h1>' +
    '<p>On-the-job training duty log and hours tracker for Opol Community College trainees.</p>' +
    '<p>JavaScript is required to use OCC Duty Log. Please enable JavaScript in your ' +
    'browser, then reload this page.</p>';

const CHECK_MS = 1000;
const DOCKED_PX = 160;

let started = false;

function startGuard() {
    if (started || !isInspectProtectionEnabled()) return;
    started = true;

    const baseDPR = window.devicePixelRatio || 1;
    let cover = null;
    let hider = null;
    // Console probe: Chromium reads the "stack" of a logged Error only when the
    // console is open to print it (docked, undocked or device mode). Other engines
    // (Safari / Firefox / iOS browsers) can read it for other reasons, and a false alarm
    // would lock a real phone out, so the probe runs on Chromium only and needs two
    // checks in a row.
    const ua = navigator.userAgent || '';
    const chromium = /Chrome\/|Chromium\//.test(ua) && !/Firefox|FxiOS|CriOS|EdgiOS|jsdom/.test(ua);
    let consoleOpen = false;
    let consoleHits = 0;
    const probe = new Error('');
    Object.defineProperty(probe, 'stack', {
        configurable: true,
        get() { consoleOpen = true; return ''; },
    });

    const show = () => {
        // (Re)create both pieces every time, so deleting them from the
        // Elements panel does nothing - the next check puts them back.
        if (!hider || !hider.isConnected) {
            hider = document.createElement('style');
            hider.textContent = '#app{display:none !important}';
            (document.head || document.documentElement).appendChild(hider);
        }
        if (!cover || !cover.isConnected) {
            cover = document.createElement('div');
            cover.style.cssText =
                'position:fixed;inset:0;z-index:2147483647;background:#fff;' +
                'color:#111;font-family:Arial,Helvetica,sans-serif;padding:24px;';
            cover.innerHTML = COVER_HTML;
            (document.body || document.documentElement).appendChild(cover);
        }
    };

    const hide = () => {
        if (cover) { cover.remove(); cover = null; }
        if (hider) { hider.remove(); hider = null; }
    };

    // A text field is focused: the on-screen keyboard shrinks the page height,
    // so height-based signals are ignored while typing (never lock out a phone).
    const typing = () => {
        const a = document.activeElement;
        return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
    };

    const devtoolsOpen = () => {
        const zoom = (window.devicePixelRatio || 1) / baseDPR;
        const screenW = (window.screen && window.screen.width) || 0;
        const screenH = (window.screen && window.screen.height) || 0;

        // 1. Docked DevTools (side): the outer window gets wider than the page.
        //    A real phone has outerWidth === innerWidth, so this never fires there.
        if (window.outerWidth - window.innerWidth * zoom > DOCKED_PX) return true;

        // 2. Docked DevTools (bottom): same, vertically. Only on desktop-sized screens and
        //    never while typing: a phone's on-screen keyboard also shrinks the page height.
        if (Math.max(screenW, screenH) >= 992 && !typing() &&
            window.outerHeight - window.innerHeight * zoom > DOCKED_PX) return true;

        // 3. Device-mode emulation: the emulated screen is phone-sized but the
        //    real browser window is bigger than that screen. Impossible on a
        //    real phone, where the window can never exceed the screen.
        if (screenW && screenH && (window.outerWidth > screenW + 80 || window.outerHeight > screenH + 160)) return true;

        // 4. Console opened (also catches undocked DevTools). Chromium only.
        if (chromium) {
            consoleOpen = false;
            // eslint-disable-next-line no-console
            console.debug(probe);
            consoleHits = consoleOpen ? consoleHits + 1 : 0;
            if (consoleHits >= 2) return true;
        }
        return false;
    };

    const check = () => {
        try {
            if (devtoolsOpen()) show();
            else hide();
        } catch { /* never let the guard break the app */ }
    };

    check(); // before React mounts, so nothing is ever shown
    // One interval + two listeners for the whole page life, created once
    // (this module runs once), so there is nothing to leak.
    window.setInterval(check, CHECK_MS);
    window.addEventListener('resize', check);
    document.addEventListener('visibilitychange', check);

    // ---- Shortcuts / menus (hardware keyboards, desktop-class browsers) ----
    document.addEventListener('keydown', (e) => {
        const k = String(e.key || '').toLowerCase();
        const blocked =
            e.key === 'F12' ||
            ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c', 'k'].includes(k)) ||
            ((e.ctrlKey || e.metaKey) && ['u', 's'].includes(k)) ||
            (e.metaKey && e.altKey && ['i', 'j', 'c', 'u'].includes(k)); // macOS
        if (blocked) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    // Long-press / right-click menu ("Open image", "Inspect", "Save image").
    // Text fields keep their normal Paste / Select menu.
    document.addEventListener('contextmenu', (e) => {
        const t = e.target;
        const editable = t && t.closest && t.closest('input, textarea, [contenteditable="true"]');
        if (!editable) e.preventDefault();
    }, true);

    // Dragging a picture out of the page.
    document.addEventListener('dragstart', (e) => {
        if (e.target && e.target.tagName === 'IMG') e.preventDefault();
    }, true);
}

startGuard();
