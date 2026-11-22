# OCCDL — Production checklist (Phase 8)

Run `php artisan occ:preflight` on the real server first. It checks settings, database, admin account and files, and
prints no secrets. The items below are the ones a command cannot do for you.

## 1. Before anything else
- [ ] **Rotate leaked secrets.** `.envpro.txt` (shared in an earlier zip) contained a Gmail app password and the VAPID private key.
      Revoke the Gmail app password and create a new one. Rotating VAPID keys invalidates every phone's push subscription:
      do it once, now, before real users subscribe (`php artisan webpush:vapid --show`).
- [ ] Never share a zip that contains `.env`, `.envpro.txt`, `storage/logs`, or a database file again.
- [ ] Put the real values in the host's environment variables (see `.env.example`), not in a file inside the web root.

## 2. Backup, then rehearse the migration
- [ ] Take a full database backup and **test restoring it** on another machine.
- [ ] Restore that backup into a scratch MySQL/MariaDB database, point a copy of the app at it, and run
      `php artisan migrate`. Confirm: no errors, user count unchanged, every old duty entry is `draft` + `legacy`,
      every trainee has a `pending_placement` enrollment.
- [ ] Only then run `php artisan migrate --force` on production. Never `migrate:fresh`.
- [ ] Verified in this project's sandbox: the Phase 2-3 table definitions (stored generated columns with a unique index,
      including `ON DELETE CASCADE` on the base column) run on **MariaDB 10.11**. Not verified: MySQL 8 and the PHP migrations
      themselves. The rehearsal above covers that.

## 3. Settings (all in `occ:preflight`)
`APP_ENV=production`, `APP_DEBUG=false`, HTTPS URL, `OCC_FORCE_HTTPS=true`, `OCC_CSP_ENFORCE=true`, `SESSION_DRIVER=database`,
secure cookies, real mail (not `log`), `OCC_TRUSTED_PROXIES` = your proxy IPs (not `*`).
Then: `php artisan config:cache && php artisan route:cache && php artisan view:cache`.

## 4. Create the first Admin, then turn things on in order
- [ ] `php artisan staff:create-admin`, sign in at `/staff-login`.
- [ ] Add the academic year, mark it current, create sections, create Coordinators and assign them.
- [ ] Assign existing trainees (Enrollments → Unassigned students).
- [ ] Only now consider `OCC_ROSTER_ENFORCE=true` (needs `php artisan roster:import file.csv`).
- [ ] Coordinators bulk-review legacy `draft` entries with trainees before counting them as verified.

## 5. Run the tests properly
- [ ] `php artisan test` (SQLite, fast) — all green.
- [ ] Run the same suite once against **MySQL/MariaDB**: create an empty test database, set `DB_CONNECTION=mysql` and
      `DB_DATABASE=occdl_test` for the run (phpunit.xml normally forces SQLite; override it for this one run). Never point it at real data.
- [ ] `node --test tests/js` (sync tests).

## 6. Manual passes
- [ ] Phone (installed PWA): sign in, log an entry offline, reconnect, submit, see it approved, see the bell notice.
- [ ] Stale device: edit on phone A offline, approve on desktop, reconnect A → A reloads the server copy (no overwrite).
- [ ] Desktop: Admin and Coordinator flows end to end; Coordinator cannot open another section's trainee (404).
- [ ] Unverified account stays closed out of everything except verification.
- [ ] A deactivated account cannot sign in and loses sessions.

## 7. Operations
- [ ] Scheduler running every minute (`php artisan schedule:run`) for shift reminders.
- [ ] Log alerts configured (`LOG_SECURITY_STACK`, webhook) and someone watches them.
- [ ] Daily backups with a retention period; restore tested (section 2).
- [ ] Disk space and log rotation checked.
