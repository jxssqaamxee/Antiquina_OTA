# OCCDL (Laravel + Vite + React PWA)

OJT duty log and hours tracker for Opol Community College trainees (formerly "Antiquina OTA").
Built in the same structure as **sclf_APP**: a Laravel API (HttpOnly cookie sessions stored in the database) + a React single-page app,
installable as a PWA and designed phone-first.

## Features
- **Register**: Student ID (`YYYY-N-NNNNN`), school Gmail (`occ.lastname.firstname@gmail.com`), first / middle (optional) / last name, course, password.
- **Email verification** (same as sclf_APP): after registering, a 6-digit code + a signed link (both valid 60 minutes) are emailed. The API stays closed (`email.verified` middleware) until the email is verified; the app shows `/verify-email` meanwhile, with *Resend email* and a fix for a mistyped address.
- **Login**: Student ID + password. "Keep me signed in" keeps the session for 30 days; otherwise it lasts 12 hours. The server enforces both limits and no token is ever stored in the browser.
- **Forgot password**: enter your Gmail; an email that is not in the database is reported as "not found" and nothing is sent. Reset links last 60 minutes, work once, and sign out every device.
- **Profile**: edit name/course, set/change password.
- **Logbook**: live duty clock, host clients, entries, history, PDF reports. Stored per account in real database tables (see *Where the data lives*) and cached on the device, so it works offline and syncs when back online.
- **PWA**: manifest, service worker (offline shell, never caches `/api`), install prompt (Android + iOS steps), update notice, offline banner, no pinch/double-tap zoom, iOS keyboard fixes.

## Phone-only switch (`OCC_MOBILE_ONLY`)
```env
OCC_MOBILE_ONLY=true    # opens only on a real phone (installed PWA or phone browser)
OCC_MOBILE_ONLY=false   # opens on every device
```
After changing it run `php artisan config:clear` — **no rebuild needed** (the value is written onto `<html data-mobile-only>` by `resources/views/app.blade.php`).

- A device counts as a phone when its primary pointer is touch **and** its physical screen's short side is ≤ 600 px (`PHONE_MAX_SHORT_SIDE` in `resources/js/config/constant.js`).
  A desktop/laptop browser dragged narrow, responsive mode, tablets and touch laptops are all blocked.
- Blocked devices see only the "OCCDL is for phones" screen: no router, API call, service worker or install prompt runs, and the web-app manifest is removed so desktop browsers never offer to install it.
- Anything other than `true / 1 / on / yes` means off, so a typo can never lock everyone out.
- Development only (`npm run dev`): add `?mobile_only=false` (or `true`) to any URL to override.
- This is a screen gate, not a security boundary: browser DevTools device mode pretends to be a phone and is let through while `OCC_INSPECT_PROTECTION=false` (handy for testing); with `OCC_INSPECT_PROTECTION=true` it is covered (see below).


## DevTools / inspect protection (`OCC_INSPECT_PROTECTION`)

```
OCC_INSPECT_PROTECTION=true    # production: the app hides itself while browser DevTools is open
OCC_INSPECT_PROTECTION=false   # development: protection off
```

Same pattern as the phone-only switch: run `php artisan config:clear` after changing it, **no rebuild needed** (written onto `<html data-inspect-protection>`). It also catches DevTools *device mode* (phone emulation), which would otherwise slip past the phone-only check, and blocks F12 / Ctrl+Shift+I / Ctrl+U / right-click / long-press menus. Anything unrecognised means off, so a typo never locks people out. Development only (`npm run dev`): add `?inspect_protection=false` to any URL. This is a deterrent, not security: all access control is enforced on the server.

## Validation (same conventions as sclf_APP)
Rules live in one place per side and must be changed together:
`app/Support/Formats.php` + `app/Http/Requests/*` (server) ↔ `resources/js/utils/validators.js` (browser).

| Field | Rule |
|---|---|
| Student ID | `YYYY-N-NNNNN` — numbers only, dashes are added as you type (sign-in, register) |
| Verification code | 6 digits, numbers only |
| E-mail | `occ.lastname.firstname@gmail.com`, the lastname part must match the Last name field; must be verified with the emailed code or link |
| Names | letters, spaces, hyphens, apostrophes; first and last required, middle optional |
| Password | 8+ characters with upper-case, lower-case and a number; confirmation must match |
| Login | Student ID and password both required |
| Profile | names and course required; new password must differ from the current one |
| Logbook | trainee name required (needed for the PDF), required hours 1–2000, host client needs a unique name, ≥ 1 working day and time-out after time-in; entries need a date, host client and a non-overlapping time range |

Required fields show a red `*`, errors appear under the field, and the first invalid field is focused.

## Structure
```
app/
  Http/Controllers/Api/   AuthController, EmailVerificationController, PasswordResetController, ProfileController, DocumentController
  Http/Requests/          RegisterRequest, LoginRequest, UpdateProfileRequest, ChangePasswordRequest
  Http/Middleware/        EnsureEmailVerified
  Services/Auth/          SessionLogin, EmailVerificationCodeService
  Support/Formats.php     shared field formats
config/occ.php            OCC_MOBILE_ONLY, OCC_INSPECT_PROTECTION, sign-in lifetime, courses, synced document keys
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
php artisan db:seed       # optional demo trainee: 2024-1-00001 / password (email already verified)
composer dev              # or: php artisan serve  +  npm run dev
```
For production run `npm install && npm run build`, then `php artisan config:clear`. Use HTTPS (required for PWA install), set `APP_URL` to the real site address (it is used in the emailed verification / reset links) and configure the `MAIL_*` settings so those emails can be delivered.
Existing database? Run `php artisan migrate` — it drops the old Google columns.
Tests: `php artisan test`.

## Notes
- Course list lives in `config/occ.php` (same as sclf_APP).
- Renamed from "Antiquina OTA": storage keys are now `occ_*` and the service-worker cache is `occ-v1`, so people already signed in are signed out once after updating.
- Removed earlier: Firebase, Firestore rules, Cloud Functions and the Vercel reminder cron. In-app and browser notifications work while the app is open; background push is not included.


## Where the data lives

Everything per user is saved on the server, in tables that belong to one account each (rows are deleted with the account):

| Table | What it holds |
|---|---|
| `user_settings` | student name, target hours, last client, **colour theme**, onboarding + shift-reminder flags, milestones |
| `host_clients` | each host client: name, **public / private / custom**, duty days, time in/out |
| `duty_entries` | each duty day: date, client, shift type, morning/afternoon/evening times, `coverage` (`full` = whole day), **hours computed by the server**, task |
| `user_notifications` | the bell history (read/unread), up to 200 per user |

The app still talks to `/api/sync` with the same JSON, but every save is validated first (`app/Support/Logbook/LogbookValidator.php`): bad data gets a `422` with a message per field, never a 500. Rules: names required/unique per user, target hours 1–2000, time out after time in, no overlapping entries on the same date, task text max 500 characters. The theme is saved with `PUT /api/profile/preferences`.

`user_documents` (the old JSON blobs) is never modified, it stays as a backup. Each account's old data is copied into the new tables automatically the first time it syncs, or for everyone at once with `php artisan occ:import-legacy`.

Known limit: a logbook save replaces the whole logbook, so a phone that was offline for a long time can overwrite entries another phone added meanwhile. Use one device at a time until a merge step is added.
