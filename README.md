# OCC Duty Log (Laravel + Vite + React PWA)

OJT duty log and hours tracker for Opol Community College trainees (formerly "Antiquina OTA").
Built in the same structure as **sclf_APP**: a Laravel API (Sanctum tokens) + a React single-page app,
installable as a PWA and designed phone-first.

## Features
- **Register**: Student ID (`YYYY-N-NNNNN`), school Gmail (`occ.lastname.firstname@gmail.com`), first / middle (optional) / last name, course, password. Or *Sign up with Google* (no password; the Gmail comes from Google).
- **Login**: Student ID + password, or *Sign in with Google*. "Keep me signed in" keeps the session for 30 days; otherwise it ends with the tab/app.
- **Profile**: edit name/course, set/change password.
- **Logbook**: live duty clock, host clients, entries, history, PDF reports. Stored per account in the database and cached on the device, so it works offline and syncs when back online.
- **PWA**: manifest, service worker (offline shell, never caches `/api`), install prompt (Android + iOS steps), update notice, offline banner, no pinch/double-tap zoom, iOS keyboard fixes.

## Phone-only switch (`OCC_MOBILE_ONLY`)
```env
OCC_MOBILE_ONLY=true    # opens only on a real phone (installed PWA or phone browser)
OCC_MOBILE_ONLY=false   # opens on every device
```
After changing it run `php artisan config:clear` — **no rebuild needed** (the value is written onto `<html data-mobile-only>` by `resources/views/app.blade.php`).

- A device counts as a phone when its primary pointer is touch **and** its physical screen's short side is ≤ 600 px (`PHONE_MAX_SHORT_SIDE` in `resources/js/config/constant.js`).
  A desktop/laptop browser dragged narrow, responsive mode, tablets and touch laptops are all blocked.
- Blocked devices see only the "OCC Duty Log is for phones" screen: no router, API call, service worker or install prompt runs, and the web-app manifest is removed so desktop browsers never offer to install it.
- Anything other than `true / 1 / on / yes` means off, so a typo can never lock everyone out.
- Development only (`npm run dev`): add `?mobile_only=false` (or `true`) to any URL to override.
- This is a screen gate, not a security boundary: browser DevTools device mode pretends to be a phone and is let through (handy for testing).

## Validation (same conventions as sclf_APP)
Rules live in one place per side and must be changed together:
`app/Support/Formats.php` + `app/Http/Requests/*` (server) ↔ `resources/js/utils/validators.js` (browser).

| Field | Rule |
|---|---|
| Student ID | `YYYY-N-NNNNN` (auto-dashes as you type) |
| E-mail | `occ.lastname.firstname@gmail.com`, the lastname part must match the Last name field (Google sign-up: the verified Gmail is used) |
| Names | letters, spaces, hyphens, apostrophes; first and last required, middle optional |
| Password | 8+ characters with upper-case, lower-case and a number; confirmation must match |
| Login | Student ID and password both required |
| Profile | names and course required; new password must differ from the current one |
| Logbook | trainee name required (needed for the PDF), required hours 1–2000, host client needs a unique name, ≥ 1 working day and time-out after time-in; entries need a date, host client and a non-overlapping time range |

Required fields show a red `*`, errors appear under the field, and the first invalid field is focused.

## Structure
```
app/
  Http/Controllers/Api/   AuthController, ProfileController, DocumentController
  Http/Requests/          RegisterRequest, LoginRequest, GoogleCredentialRequest, UpdateProfileRequest, ChangePasswordRequest
  Services/Auth/          GoogleTokenVerifier, SessionTokenService
  Support/Formats.php     shared field formats
config/occ.php            OCC_MOBILE_ONLY, sign-in lifetime, courses, synced document keys
resources/js/
  main.jsx                phone-only gate -> loads bootstrap.jsx only on allowed devices
  bootstrap.jsx, RootApp.jsx, routes/index.js
  Components/{shared,auth,logbook}/
  Pages/{Auth,Logbook,Profile,Main}/
  config/                 constant.js, axiosConfig.js, serverConfig.js
  context/ hooks/ styles/ utils/
```

## Setup
```bash
composer setup            # installs, creates .env + sqlite DB, migrates, builds assets
php artisan db:seed       # optional demo trainee: 2024-0001 / password
composer dev              # or: php artisan serve  +  npm run dev
```
For production run `npm install && npm run build`, then `php artisan config:clear`. Use HTTPS (required for PWA install and Google sign-in).
Google sign-in: create a Web OAuth client in Google Cloud Console, add your site URL to *Authorized JavaScript origins*, put the ID in `.env` as `GOOGLE_CLIENT_ID`, then `npm run build`.
Tests: `php artisan test`.

## Notes
- Course list lives in `config/occ.php` (same as sclf_APP).
- Renamed from "Antiquina OTA": storage keys are now `occ_*` and the service-worker cache is `occ-v1`, so people already signed in are signed out once after updating.
- Removed earlier: Firebase, Firestore rules, Cloud Functions and the Vercel reminder cron. In-app and browser notifications work while the app is open; background push is not included.
