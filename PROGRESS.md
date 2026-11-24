# OCC Hardening Progress
Last updated: 2026-11-24   Session #: 5
Current phase: 5 PARTLY done (role matrix + static review done)   Next action: finish Phase 5 user-side items, then Phase 6 report

## Environment (verified this session)
PHP 8.3.6 / MariaDB 10.11.14 / Node 22.23 / Composer 2.7.1 (from apt)
Baseline (Phase 0): PHP 255/255 (1,439 assertions), JS sync 14/14, npm audit 0 vulnerabilities.
After Phase 1: PHP 263/263 (1,480 assertions). JS not touched.
After Phase 2: PHP 278/278 (1,580 assertions), re-run on a fresh copy with phase2.patch applied. JS not touched.
After Phase 3 (session 4, SQLite): PHP 299/299 (1,741), JS 14/14.
After Phase 4 (session 4, SQLite): PHP 319/319 (1,791 assertions), JS 15/15, npm audit 0 vulnerabilities, `vite build` OK.

## Phase checklist
- [x] Phase 0 Setup and baseline
- [x] Phase 1 Data integrity: [x] F1 overlap  [x] F2 future dates  [x] F8 approval lock
- [x] Phase 2 Config/registration (BACKEND): [x] preflight  [x] pending approval  [x] photo route  [x] proxies  [x] hygiene
- [x] Phase 2b Frontend for approval: waiting/rejected screen, Registrations tab for admin + coordinator, guards, sync pause, rebuilt public/build, npm test script
- [x] Phase 3 Accounts (code present in occdl_1.zip; verified in session 4 by running its tests; 2FA screens compiled, not click-tested)
- [x] Phase 4 Small hardening: [x] pw throttle  [x] login timing  [x] XML  [x] PDF  [x] photo  [x] progression  [x] FKs  [x] offline cache (warning only, see notes)
- [~] Phase 5 Unverified gaps: [x] COOP header + root-DB-user preflight WARN (Phase5HardeningTest, fail-before/pass-after) [x] role matrix (RoleMatrixTest, 10 tests) [x] static review headers/CORS/cookies/bundle [ ] composer audit (user) [ ] browser click-through [ ] MySQL 8 [ ] real prod env (user)
- [ ] Phase 6 Final report

After Phase 5 (session 5, SQLite): PHP 331/331 (1,829 assertions), JS 15/15, npm audit 0 vulnerabilities.

## Fast setup for a new session (Phase 0, about 2 min; see composer note)
```bash
cd /home/claude && mkdir -p occ_raw && unzip -q -o /mnt/user-data/uploads/occdl-updated.zip -d occ_raw
cp -a occ_raw/occdl orig && cp -a occ_raw/occdl occ        # orig = pristine copy for diffs
apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  php-cli php-mbstring php-xml php-curl php-zip php-gd php-mysql php-sqlite3 php-bcmath php-intl \
  unzip mariadb-server poppler-utils composer
cd occ && COMPOSER_ALLOW_SUPERUSER=1 composer install --no-interaction --no-progress
cp .env.example .env && php artisan key:generate -q
sed -i 's/^OCC_FORCE_HTTPS=.*/OCC_FORCE_HTTPS=false/; s/^OCC_CSP_ENFORCE=.*/OCC_CSP_ENFORCE=false/' .env
npm ci --silent
php artisan test                                              # expect 255 passed
node tests/js/sync.test.mjs resources/js/utils/sync.js        # expect 14 scenarios passed
```
Notes:
- PHPUnit uses SQLite in memory (phpunit.xml). MariaDB is needed only for the Phase 1 race test (F8); start it, migrate, seed and run in ONE bash call.
- Session 3: GitHub API zipballs were BLOCKED (403) so the default `composer install` hung. Use `composer install --prefer-source` (git clone works), run it detached with `setsid nohup ... &` and poll; the tool call itself times out at 2 min. About 6 min total.
- Packagist is blocked in the sandbox but composer.lock installs work via GitHub dists (when the API is reachable). `composer audit` still needs Packagist, so ask the user to run it locally.
- `public/build` is inside the zip; do not exclude it when extracting.

## Phase 0 findings (new)
- P0-a: `.env.example` ships `OCC_FORCE_HTTPS=true` and `OCC_CSP_ENFORCE=true`. A `.env` copied from it makes 218 tests fail (308 redirect) and 2 more fail on the CSP header tests. The tests depend on those being false and do not pin them in `phpunit.xml`. Low severity (test hygiene only). Suggested fix: pin both to false in `phpunit.xml`.
- P0-b: JS tests are not wired to `npm test`. The documented command `node --test tests/js` fails on Node 22 (needs a file) and the test also needs the path to `sync.js` as an argument. Suggested fix: add an npm "test" script.
- The zip has no `.env`, so the real production environment values are still unseen.

## Findings status
| # | Status | Notes |
|---|--------|-------|
| 1 | **Fixed+tested** (Phase 1) | Probe failed on current code, now passes. Check runs inside the sync transaction against stored locked entries |
| 2 | **Fixed+tested** (Phase 1) | Entries after today (OCC_TIMEZONE) rejected with 422 |
| 3 | **Fixed+tested (backend)** (Phase 2) | Roster enforce default true; preflight fails on false; pending-approval state (users.approval_status); coordinator/admin approve/reject/list + scoped photo routes. UI screens NOT built yet |
| 4 | Reproduced (earlier audit) | Phase 3 |
| 5 | **Fixed+tested** (Phase 4) | Dummy Hash::check for unknown id / no-password account on both logins. Test counts hash checks: 0 before, 1 after. Wall-clock timing NOT re-measured (test hasher uses low cost) |
| 6 | **Fixed+tested** (Phase 4) | throttle:5,1 on PUT /profile/password; 9 wrong guesses now reach 429 |
| 7 | **Reproduced again, Fixed+tested** (Phase 4) | 7 of 9 DOCTYPE/ENTITY payloads (all UTF-16, lowercase, DOCTYPE-only) were accepted; now all refused. Encoding normalised before the check, UTF-7/other encodings and NUL bytes refused, PARSEHUGE removed. No real exploit was ever shown |
| 8 | **Reproduced, then Fixed** (Phase 1) | MariaDB 10.11 REPEATABLE-READ: approve+reject both succeeded, 2 review rows, entry rejected but kept 8.00 verified hours. After `lockForUpdate()` on the entry: second request refused, 1 review row |
| 9 | **Partly fixed+tested** (Phase 2) | Default trust is now none; preflight FAILS on `*`; test proves forged X-Forwarded-For is ignored. NOT done: per-account lockout redesign (account+IP key). Still read only for that part |
| 10 | **Fixed+tested** (Phase 4) | confirm() re-checks eligibility inside the transaction (not in target year, status active/repeating, has year level; promote only ACTIVE and below year 4; complete only year 4+). Violation = 422 and the whole batch rolls back. Was reproduced by test before the fix |
| 11 | Read only | Phase 3 |
| 12 | **Fixed+tested** (Phase 4) | pdftotext 10 s timeout + kill, 10 MB PDF cap, no shell; undecodable image now 422 (raw-bytes fallback removed; register checks before creating the user); FKs on enrolled_students.course_id/section_id (migration stops on orphan rows) |
| 13 | **Partly fixed** (Phase 4) | Chose NOT to delete unsynced data (would lose hours). Added unsyncedCount() and a warning toast when the session ends or sign-out cannot reach the server with unsynced data. Data still stays on the device until that account signs in. UI not click-tested |
| 14 | **Partly done** (Phase 2) | tools/release-exclude.txt added; .gitignore already covered these paths. Secret rotation is the user's job and cannot be verified |

"Reproduced (earlier audit)" means a previous session ran a probe; it has not been re-run in this session. Findings 1, 2 and 8 were re-run in session 2.

## Patches (apply in order to a fresh extract)
- NOTE: the zip uploaded in session 3 ALREADY contained phase1 (do not apply phase1.patch to it). phase2.patch was made against that zip, so apply phase2.patch only. If you start from the ORIGINAL pre-fix zip, apply phase1.patch then phase2.patch.
- phase2.patch: from the project root run `patch -p1 < phase2.patch` (dry run + full suite verified on a fresh copy).
  Files: Preflight.php, config/occ.php, bootstrap/app.php, .env.example, phpunit.xml, AuthController, EmailVerificationController, MediaController, User model, CoordinatorAccessService, routes/api.php; new: EnsureApproved middleware, RegistrationApprovalService, RegistrationApprovalController, migration 2026_12_04_000000_add_approval_to_users, tests PreflightTest(+4), RegistrationApprovalTest(9), TrustedProxiesTest(1), tools/release-exclude.txt. Run `php artisan migrate` after applying.
- phase1.patch: from the project root of a fresh extract run `patch -p1 < phase1.patch` (dry run verified clean against the pristine zip).
  Files: app/Support/Logbook/LogbookStore.php (F1), app/Support/Logbook/LogbookValidator.php (F2), app/Services/Academic/DutyEntryApprovalService.php (F8), tests/Feature/LogbookIntegrityTest.php (new, 8 tests).
- tools/f8-race/ (setup.php, actor.php, run_race.sh): MariaDB race reproduction. Expects the project at /home/claude/occ. Run `./run_race.sh` in ONE call.

## Not verified yet
- composer audit, full frontend read, MySQL 8, real production env values. Phase 2 was tested on SQLite only (migration not run on MariaDB). The F8 MariaDB race was verified in session 2, not re-run.

## Notes for next session
- Phase 2 next. Same method: failing test first, then fix.
- Known side effects of Phase 1 to tell the user:
  * A draft ALREADY stored with a future date (or overlapping a locked entry) will now make the whole logbook push fail with 422 until the trainee edits it; the app stops retrying that key and fires `occ-sync-rejected` with the message.
  * The date input in resources/js/Pages/Logbook/LogbookPage.jsx (line ~1463) has no `max`, so the UI does not stop future dates up front. Optional UX follow-up: add `max={today}` (requires `npm run build`, since public/build is committed). Not done, to avoid a stale build.
  * The future-date rule uses the app's timezone (OCC_TIMEZONE, default Asia/Manila), no tolerance.
- SQLite cannot reproduce the F8 lock race (its grammar drops FOR UPDATE), so the PHPUnit guard only covers the stale-copy path; the MariaDB script is the real proof.

## Phase 2 notes (session 3)
- Behaviour changes to tell the user:
  * `OCC_ROSTER_ENFORCE` now defaults to TRUE (code default and .env.example). Imported roster rows are required to register.
  * `OCC_REGISTRATION_APPROVAL` (new, default TRUE): new self-registered trainees are `pending`: /api/me, email/*, logout work; everything else 403 `account_pending`. `rejected` => 403 `account_rejected` and login refused. Enrolment now happens at approval (and only if the email is verified), not at email verification. Existing accounts migrate as `approved`.
  * Coordinator sees only pending registrants whose roster row (enrolled_students.section_id) is in their own section. A registrant with no roster section is visible to ADMIN only.
  * New routes (both /api/admin and /api/coordinator): GET registrations, GET registrations/{id}/photo, POST registrations/{id}/approve|reject. Plus GET coordinator/trainees/{id}/photo (own section, else 404) and GET admin/trainees/{id}/photo.
  * A second decision on the same registration gets 404 (no longer pending); the locked re-check in the service refuses a stale concurrent one (unit-tested, not raced on MariaDB).
  * `OCC_TRUSTED_PROXIES` default is empty = trust none. Behind a host proxy/CDN, without the real IPs every visitor shares one IP and https detection fails (preflight WARNs on empty, FAILs on `*`). `bootstrap/app.php` reads it with env(), so with `php artisan config:cache` it must be a real process env var.
  * Preflight (production mode) now FAILs on: ROSTER_ENFORCE=false, TRUSTED_PROXIES=*, INITIAL_ADMIN_PASSWORD still set, APP_DEBUG=true, APP_KEY missing/not 32 bytes.
- phpunit.xml now pins OCC_FORCE_HTTPS/CSP_ENFORCE/ROSTER_ENFORCE/REGISTRATION_APPROVAL=false (fixes P0-a). Real env vars override these (the tests were also run with OCC_TRUSTED_PROXIES='*' to prove the proxy test fails there).
- (RESOLVED in 2b, kept for history) gap: no frontend yet. A pending trainee who registers will hit 403 account_pending in the React app, and nobody can approve from the UI. Until Phase 2b is done the user can set OCC_REGISTRATION_APPROVAL=false, or approve via the API.
- Phase 2b TODO: (1) `u.approval_status === 'pending'|'rejected'` waiting screen: update chunkFor in SplashPage.jsx, ProtectedRoute.jsx, utils/roles.js (same places that handle email_verified === false), and add `account_pending`/`account_rejected` to the pause list in utils/sync.js (line ~157). (2) Coordinator + admin "Registrations" screen using the new routes, with photo preview. (3) `npm run build` (public/build is committed). Optional: `registration:approve {student_id}` artisan command as a no-UI fallback.
- Existing test leaks one profile photo per run into the real storage/app/private (pre-existing; tests that do not Storage::fake). Not fixed.
- Not done in Phase 2: per-account lockout redesign (F9 second half); duplicate Student ID claim was already refused (unique rule, message names nobody), a regression test was added.

## Phase 2b notes (session 3)
- Frontend added: Pages/Auth/PendingApprovalPage.jsx (/pending-approval, polls /api/me every 15 s), Components/admin/RegistrationsPanel.jsx (new "Registrations" tab in admin and coordinator dashboards, photo preview, approve/reject), PendingRoute + isBlockedByApproval guards, sync.js pauses on account_pending/account_rejected, AuthContext hydrates the logbook once verified AND approved. `npm test` now runs the JS sync tests (fixes P0-b).
- public/build was rebuilt with `npm run build`; REPLACE the whole public/build folder (old hashed files are gone). Result: PHP 278/278, JS 14/14, build OK.
- NOT verified: the new screens were never opened in a browser (no UI click-through); only compiled, and the backend routes they call are covered by PHP tests.
- Optional UX follow-up still open: LogbookPage date input has no `max={today}`.

## Phase 4 notes (session 4)
- Method kept: probe tests first (tests/Feature/Phase4HardeningTest.php, 20 tests). Before fixes 9 failed; XML probes initially passed by accident because my test xlsx lacked xl/workbook.xml, fixed and re-run: that is when F7 really reproduced.
- phase4.patch covers source/tests only (not public/build). Apply to occdl_1.zip contents with `patch -p1 < phase4.patch`; public/build must be REPLACED as a whole folder (delete the old one first). The new build has 53 files; the old folder had 127 orphaned older files, now gone. Old installed PWAs that still ask for an old hashed file will reload on next visit.
- Behaviour changes to tell the user:
  * PUT /profile/password: 5 attempts per minute, then 429.
  * Roster upload: PDFs over 10 MB refused; pdftotext killed after 10 s; XML with a DOCTYPE/ENTITY, UTF-32, UTF-7 or odd encoding is refused ("unsafe content").
  * Profile photo / registration photo that GD cannot decode is now refused with 422 (before: stored raw). If the server has no GD, every upload is refused. Photos are always stored as .jpg.
  * Rollover confirm can now answer 422 for enrollments not in the rollover list. Anyone with a screen that offered "promote" for a PENDING_PLACEMENT student will see this.
  * NEW MIGRATION 2026_12_06: STOPS with a list of Student IDs if enrolled_students has rows pointing at a missing course or section. Cleanup SQL is in the file header. Take a DB backup first.
- NOT verified in Phase 4: the FK migration on MariaDB/MySQL (only SQLite ran); real login timing in ms; browser behaviour of the new warning toast; test hasher uses cost 4.
- Existing issue still open: tests leak profile photos into storage/app/private; .phpunit.result.cache is in the zip.
- Phase 5 TODO (unchanged): composer audit (ask user to run locally), full frontend read, role-matrix tests, MySQL 8 run, real prod env values, CORS/headers/cookie flags check.

## Phase 5 notes (session 5)
- Sandbox lesson: `composer install --prefer-source` fills the disk (full git clones, ~10 GB). Guard disk, run `rm -rf ~/.cache/composer/vcs` and `find vendor -maxdepth 3 -name .git -prune -exec rm -rf {} +` between retries. Generate APP_KEY AFTER vendor exists (key:generate silently failed earlier = 274 failures).
- NEW tests/Feature/RoleMatrixTest.php (10 tests, all pass, no app code changed): coordinator vs other section for entry approve/reject/read, roster delete, roster import (lands only in own section), announcements (section/all/course), placement create/end, section-bound establishment, trainee photo + registration approve; role/id mass-assignment via PUT /profile; trainee cross-access; invalid duty hours 422. No new vulnerability found: the matrix held.
- The matrix items already covered by older tests: unauthenticated 401, trainee/coordinator vs admin 403, deactivated session, unassigned coordinator, duplicate enrollment.
- READ ONLY (not run): CORS same-origin, supports_credentials=false (ok). Headers: nosniff, XFO DENY, Permissions-Policy, Referrer-Policy ok; HSTS only when request is secure (needs correct OCC_TRUSTED_PROXIES); CSP report-only unless OCC_CSP_ENFORCE=true, style-src 'unsafe-inline'; no COOP header. Session cookie: HttpOnly, SameSite strict, encrypted; Secure flag defaults off when APP_ENV=local/testing. Photos: 5 MB, roster 10 MB (web-server limits unseen). Bundle: no secrets; /api/me cached in localStorage; media photos cached privately 1 year.
- FINDING (hygiene, user action): the uploaded zip contained a real .env with APP_ENV=local, APP_DEBUG=true, DB_USERNAME=root with a password, and leading spaces before DB_PORT/DB_DATABASE/DB_USERNAME/DB_PASSWORD lines. Rotate that DB password, never ship .env, use a non-root DB user, APP_ENV=production, APP_DEBUG=false, run `php artisan occ:preflight` in production mode.
- Still NOT verified: composer audit (Packagist blocked), browser click-through of new screens, MySQL 8, real production env/web-server config.
- Phase 5 code changes (session 5): SecurityHeaders.php adds `Cross-Origin-Opener-Policy: same-origin`; Preflight.php (production mode) WARNs when the DB user is `root`. Preflight ALREADY failed on APP_ENV!=production, APP_DEBUG=true and non-Secure session cookie (checked, no change needed). tests: RoleMatrixTest (10), Phase5HardeningTest (2).
- Not done on purpose: `max={today}` on LogbookPage date input (needs `npm run build` and replacing public/build).
- Deliver: occ-phase5-updates.zip = 5 files, copy over the project (no migration, no rebuild).

## Tooltips (session 5, user request: same tooltip as sclf_APP)
- Ported sclf's Components/shared/Tooltip (portal, hover+focus, disabled on touch, viewport clamp) with two deliberate changes: NO wrapper element (handlers are cloned onto the child, so flex/grid layouts and `.parent > button` CSS are unchanged) and colours come from `html[data-theme]` (all 9 themes) instead of detecting a shell. Also adds flip-to-opposite-side, Escape/click to close, prefers-reduced-motion.
- Files: resources/js/Components/shared/Tooltip.jsx + Tooltip.css (new). Wrapped ~25 icon-only controls in: AdminShell (rail nav when collapsed, hamburger/collapse, account buttons, brand, black/white toggle, photo), AccountMenu, AppBar (back/refresh/announcements), NotificationCenter, Sheet, DeveloperCredit, HelpGuide, ToastContext (dismiss), AuthShell (theme toggle, password eye), TwoFactorPanel (copy, show key), EntryHistoryPanel, LogbookPage (edit trainee, edit client), ProfilePage, SetupAccountPage, RegisterPage (photo). Native `title=` removed from wrapped controls so no double tooltip. aria-labels kept.
- Intentionally NOT wrapped: mobile-only bottom nav / FAB / install banner (tooltips are off on touch anyway), the disabled delete-client button (browsers send no hover events to disabled buttons), spans using native title for truncated text (RankedBars, EntryCard).
- Tests: tests/js/tooltip.test.mjs (7 scenarios, real component in jsdom; needs `npm i --no-save jsdom esbuild`, not in `npm test`). Result: 7/7. PHP 331/331, JS 15/15, `vite build` OK (public/build rebuilt, REPLACE the whole folder).
- NOT verified: real browser look/position (jsdom has no layout, so clamp/flip maths was not exercised), every theme colour on screen.
