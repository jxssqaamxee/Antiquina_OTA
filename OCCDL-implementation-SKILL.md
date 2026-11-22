---
name: occdl-implementation
description: Phase-by-phase implementation guide for OCCDL (Opol Community College Duty Log), a Laravel 12 + React/Vite OJT logbook that is being extended with Admin and Coordinator roles, academic enrollment/sections, Coordinator-reviewed duty entries, and safe offline sync. Use this whenever the user continues OCCDL work in a new chat or account, mentions coordinator, admin, section, enrollment, roster, rollover, approval, verified hours, staff login, or "phase 1-8" of OCCDL, even if they only say "continue the OCCDL plan".
---

# OCCDL — Validated Implementation Guide

This file was produced by scanning the real `occdl.zip` source and checking the
"Final Research, System Analysis & Implementation Deliverables" spec against it.
Everything under "Verified facts" was read from the code. Nothing here was run:
the scan environment had **no PHP**, so the PHP test suite has NOT been executed.

## How to continue in a new chat / account

1. Upload the latest project zip (without `vendor/` and `node_modules/`) **and this file**.
2. Say: "Continue OCCDL. Do Phase N from OCCDL-implementation-SKILL.md."
3. Do **one phase per chat**. Each phase ends with a delivery gate; do not start the next phase until the gate passes.
4. After each phase, ask for a zip containing only changed files plus the new migrations, and update the "Progress log" at the bottom of this file.

Ground rules for every phase:
- Extend, never replace. Do not delete working files to make room.
- Migrations are **additive** and use the house style: `if (! Schema::hasTable(...))` / `if (! Schema::hasColumn(...))` guards. Never `migrate:fresh` on production.
- Migrations must work on **MySQL (local/prod) and SQLite in-memory (phpunit)**.
- All authorization is enforced in Laravel. React route guards are only for UX.
- Keep existing tests green, and add tests with every phase.
- After changing `.env` values, run `php artisan config:clear`. After changing React source, rebuild with `npm run build`.

---

## 0. Already done in earlier chats (do not redo)

| Change | Files |
|---|---|
| `OCC_ROSTER_ENFORCE=false` so students can register without a coordinator/roster | `.env`, `.envpro.txt`, `.env.example` |
| Sync now pauses on `403 email_unverified` instead of retrying forever (this was the repeated `PUT /api/sync/notifications-v1 403` console error). Data stays dirty locally and is pushed after verification via `hydrate()`. | `resources/js/utils/sync.js` (+ rebuilt `public/build`) |

Notes:
- The 403 was **correct server behavior** (`EnsureEmailVerified` closes `/api/sync` for unverified accounts). Only the client retry loop was wrong.
- The roster check only runs when `OCC_ROSTER_ENFORCE=true` (`RegisterRequest` → `Rule::exists('enrolled_students','student_id')`).

---

## 1. Verified facts about the current source

**Stack:** Laravel 12 (PHP ^8.2), React SPA with Vite, HttpOnly cookie sessions in the `sessions` table, CSRF via XSRF cookie, local DB is MySQL, phpunit uses SQLite `:memory:`.

**Users:** `users` has `student_id` (NOT NULL, unique, max 32), `course` (NOT NULL string 160), `email` unique, `password` nullable, `profile_photo`, `email_verified_at`. There is **no role, staff ID, or active flag**. `User::$fillable` does not contain a role, and `AuthController::register` builds an explicit array, so public registration is already immune to role injection (still add test AUTH-01).

**Auth:** `LoginRequest` forces `student_id` to match `/^\d{4}-\d-\d{5}$/`. `AuthController::login` looks up `User::where('student_id', …)` and rate-limits by student ID + IP. Staff cannot log in through this path as-is.

**Email rules:** `Formats::SCHOOL_EMAIL` (`occ.lastname.firstname@gmail.com`) is enforced in `RegisterRequest` and in `EmailVerificationController::changeEmail`. Staff emails may not fit this pattern.

**Verification gate:** `EnsureEmailVerified` returns 403 `{code: email_unverified}` for everything except `api/me`, `api/me/photo`, `api/auth/logout`, `api/email/*`.

**Profile:** `UpdateProfileRequest` + `ProfileController::update` + `ProfilePage.jsx` let the student change `course` themselves. This must move to Admin.

**Logbook storage (`LogbookStore`, `LogbookValidator`):**
- Real tables: `user_settings`, `host_clients`, `duty_entries`, `user_notifications`. The browser still talks JSON documents via `/api/sync/{key}` (keys: `logbook-v2`, `milestones-v1`, `shift-reminder-v1`, `onboarding-seen-v1`, `notifications-v1`).
- **Hours are already computed server-side** from time ranges in `LogbookValidator` (browser total is ignored). This is NOT a gap.
- **`targetHours` is accepted from the client** (1–2000) and written to `user_settings.target_hours` (default 486). This IS a gap.
- **Whole-document replace:** `writeLogbook` deletes `duty_entries` and `host_clients` whose uid is missing from the incoming document; `writeNotifications` does the same to `user_notifications`. `clearLogbook` resets target to 486.
- **Revisions already exist:** per-document `*_revision` and `*_save_id` columns, `base_revision` on PUT, HTTP 409 with the server document on conflict, `duplicate` handling for keepalive resends. But `base_revision` is **optional** (null = last write wins for old clients).
- The client already adopts a server-corrected document (`occ-sync-applied` event when the response `value` differs). **Use this to protect entries without changing the sync protocol.**
- `duty_entries` has **no status column**. Client-visible entry id is `entry_uid` (string ≤32, unique per user, not global). Coordinator endpoints must use DB ids; trainee endpoints must use `entry_uid`.
- `host_clients` are per-user schedule objects (name, days, time_in/out) that drive `SendShiftReminders` and `duty_entries.host_client_id` (`nullOnDelete`).

**Roster (missing from the spec):** `enrolled_students(student_id)` table, `php artisan roster:import file.csv [--replace]`, and `OCC_ROSTER_ENFORCE`. It only stores IDs (no course/year/section).

**Frontend routing:** `main.jsx` runs `shouldBlockDevice()` **before** React mounts (`OCC_MOBILE_ONLY` currently `true` in `.env`), so a desktop browser never reaches login. `/logbook` is hard-coded in `ProtectedRoute`, `UnverifiedRoute`, `GuestRoute`, `SplashPage`, and the auth flow. `routes/index.js` has four route groups (public, guest, unverified, protected). `User::toClient()` returns no role.

**Courses:** `config/occ.php` `courses` contains exactly the five offerings: BEED, BSEd (Major in English), BSIT, BSBA (Marketing Management), BSBA (Financial Management). Student course strings are stored verbatim in `users.course`.

**Tests present:** AccessControl, AuthTest, InspectProtection, LogbookStorage, MobileOnly, PasswordReset, Push, PwaManifest, SessionSecurity, Sync (all named in the spec) **plus** AbuseProtection, HttpsAndCors, ProductionSafety, Schema, SecurityHeaders, SecurityLogging, and `tests/js/sync.test.mjs`. `SchemaTest` pins the table list (extend it, do not break it).

**Secrets/hygiene:** `.gitignore` already excludes `.env`, `.env.*` (except `.env.example`), `.envpro.txt`, and `storage/logs/*`. They only appear in the uploaded zip. `laravel.log` holds local setup errors (missing `sessions` table, an InnoDB tablespace error). `.envpro.txt` contains a real Gmail app password and VAPID private key → **rotate them** and do not re-share zips containing env files.

---

## 2. Corrections and clarifications to the pasted spec

1. **"Do not trust browser hours" is already done.** The real gaps are `targetHours`, deletion semantics, and missing entry status.
2. **The roster system was omitted.** Evolve `enrolled_students` instead of ignoring it: add nullable `course_id`, `year_level`, `section_id` so registration can auto-create the enrollment. Keep `OCC_ROSTER_ENFORCE=false` until Coordinators exist.
3. **"Every student has one active enrollment with a section" conflicts with open registration.** Allow `student_enrollments.section_id` NULL with `status = pending_placement`. Admin gets an "Unassigned students" queue. Coordinators see only enrollments with a section in their assignment.
4. **Staff need nullable `student_id` and `course`** on `users` (currently NOT NULL). Use `->change()` (supported natively in Laravel 12) and test on both MySQL and SQLite.
5. **Use a separate staff login endpoint** (`POST /api/auth/staff-login`, own throttle and rate-limit keys, staff ID or email + password). Leave `LoginRequest` and the existing AuthTest untouched.
6. **Staff email policy:** Admin-created staff are created with `email_verified_at` set (or via an emailed set-password invite). Exempt staff from `SCHOOL_EMAIL` in `changeEmail`.
7. **Frontend role routing is bigger than listed.** Add a single `homePath(user)` helper and use it in `ProtectedRoute`, `UnverifiedRoute`, `GuestRoute`, `SplashPage`, `LoginPage`, `AuthContext`. Add `role`, `staff_id` to `toClient()` and the cached "me".
8. **Mobile-only gate:** the spec is right about the problem. Practical fix: make the gate **path-aware** (exempt `/admin*`, `/coordinator*`, `/staff-login`) in `main.jsx`/`mobileOnly.js`. The gate runs before auth, so it cannot be role-aware. Update `MobileOnlyTest`. Also check `devtoolsGuard` (`OCC_INSPECT_PROTECTION`) so it does not hide the UI for staff, and keep the manifest/install prompt only on trainee paths.
9. **Sync protection design (use what exists):**
   - Server-owned fields: `status`, `reviewed_by`, `reviewed_at`, `review_reason`, `verified_hours`. The validator merges incoming entries with existing rows and **ignores client values** for these.
   - Missing uid in an incoming doc: delete only if status is `draft` or `rejected`; otherwise keep it and return the canonical document (client adopts it via `occ-sync-applied`).
   - Edits to `submitted`/`approved` entries are discarded server-side the same way.
   - **A Coordinator approval must bump the trainee's `logbook_revision`**, so a stale offline device gets a 409 instead of overwriting.
   - Make `base_revision` mandatory once clients are updated.
10. **Server-created notifications would be deleted** by the next `notifications-v1` push. Add `user_notifications.source` (`client`|`server`); `writeNotifications` only replaces `source='client'` rows; announcements and approval notices are `server`.
11. **Target hours:** stop accepting the client's value; return the resolved requirement (default 486, or the latest `training_hour_exceptions` row) in the document. Keep `user_settings.target_hours` as legacy data, never bulk-reset it. `clearLogbook` must not reset an Admin exception. Make the target read-only in `LogbookPage.jsx`.
12. **Single write path:** keep `/api/sync` as the only trainee write path for draft content. Add only **action** endpoints (`POST /api/logbook/entries/{entry_uid}/submit`). Do not create a second entries CRUD API; the spec's `{id}` examples must be `entry_uid` for trainees.
13. **Establishments/placements vs `host_clients`:** do not duplicate. `host_establishments` = coordinator/admin catalog; `trainee_placements` = trainee ↔ establishment with dates/supervisor; add nullable `host_clients.placement_id`. When a placement exists, the schedule is server-managed and read-only in sync. `SendShiftReminders` keeps reading `host_clients`.
14. **Legacy entries need a defined status.** Open decision (see section 4). Recommended: backfill existing rows as `draft`, flagged `legacy`, and let the Coordinator bulk-approve after review so nobody's past hours silently vanish or silently count as verified.
15. **The "26/26 checked" checklist in the spec is misleading.** Nothing has been implemented. Reset every box.
16. **SCLF claims could not be verified** (`sclf.resources.zip` was not provided in this chat). The five course names do match `config/occ.php`. Year/section/progression rules are the OCCDL proposal, not verified SCLF behavior.
17. **Out-of-scope IDs:** return 404 (not 403) for a trainee outside the Coordinator's section so existence is not leaked. 403 is still right for role mismatches.
18. **Optional simplification:** `academic_year_levels` as a table is more than needed; a `year_level` tinyint on `sections` plus a seeded list satisfies "configurable". Keep the table only if Admin must rename levels.

---

## 3. Data model (additive)

Modify `users`: `role` (`admin|coordinator|trainee`, default `trainee`, indexed, **not** in `$fillable`), `staff_id` (nullable, unique), `is_active` (default true), `deactivated_at`; make `student_id`, `course` nullable. Add a DB check or app validation: trainees must have `student_id`, staff must have `staff_id`.

New tables: `courses`, `academic_years`, `academic_year_levels` (optional), `sections`, `student_enrollments`, `coordinator_assignments`, `enrollment_progressions`, `duty_entry_reviews`, `host_establishments`, `trainee_placements`, `training_hour_exceptions`, `announcements`, `announcement_recipients`, `activity_logs`.

Extend: `duty_entries` (`status`, `submitted_at`, `reviewed_by`, `reviewed_at`, `review_reason`, `verified_hours`, `legacy`), `user_notifications` (`source`), `host_clients` (`placement_id`), `enrolled_students` (`course_id`, `year_level`, `section_id`).

Constraints to enforce:
- One active Coordinator per section: unique on `(section_id)` where `ended_at IS NULL`. MySQL has no partial unique index → use a generated `active_section_id` column (`section_id` when active, else NULL) with a unique index, plus transactional checks.
- One active enrollment per student: same generated-column technique on `(user_id)`.
- Coordinator has one active assignment: same technique on `(coordinator_id)`.
- Enrollment history is never overwritten; progression creates a new row and closes the old one.
- All academic changes inside `DB::transaction`.
- `activity_logs` is append-only (no update/delete routes).

Group code (e.g. `BSIT-4A`) is display only; relationships use primary keys.

---

## 4. Open decisions to confirm with the school before Phase 5

- Status for **existing** duty entries: `draft` + `legacy` (recommended) vs auto-`approved`.
- Whether a Coordinator may edit an entry's times when rejecting, or only comment.
- Whether `Resubmitted` is a separate stored state or just `submitted` with a review-history marker (recommended: store `submitted`, derive "resubmitted" from history).
- Who can create establishments: Coordinator for own section only, Admin global.
- What happens to a trainee with no section: can they log hours while `pending_placement`? (Recommended: yes, entries stay `draft`; review starts when a Coordinator is assigned.)

---

## 5. Phases

### Phase 1 — Foundation and account security (Critical)

**Do**
- Migration: `users` role/staff_id/is_active/deactivated_at, nullable `student_id`/`course`.
- `User`: role constants and helpers (`isAdmin()`, `isCoordinator()`, `isTrainee()`); keep role out of `$fillable`; `toClient()` adds `role`, `staff_id`.
- Artisan `staff:create-admin` (prompts for staff ID, name, email, password; production-safe; no admin registration page).
- `POST /api/auth/staff-login` with its own throttle and rate-limit keys; same session start (`SessionLogin::start`).
- Middleware `EnsureRole` (alias `role:admin,coordinator`) and `EnsureActiveAccount` (rejects deactivated users; deactivation calls `SessionLogin::revokeAll`).
- Register `role` aliases in `bootstrap/app.php`; add to relevant `routes/api.php` groups.
- Staff email exemption in `EmailVerificationController::changeEmail`.
- Frontend: `homePath(user)`, role-aware guards, staff login page at `/staff-login`, path-aware mobile gate.

**Tests:** AUTH-01..04, deactivated account cannot sign in and loses sessions, staff login rate limit, existing AuthTest/AccessControlTest/MobileOnlyTest still pass.

**Gate:** Admin, Coordinator, and Trainee can each sign in and land on the right home with correct API permissions.

### Phase 2 — Academic structure

**Do**
- Models + migrations: `courses` (seed the five with codes BEED, BSEd, BSIT, BSBA-MM, BSBA-FM and the exact legacy strings), `academic_years` (one `is_current`), `sections`, `student_enrollments` (status enum: `pending_placement`, `active`, `completed`, `transferred`, `repeating`).
- Data migration: for each existing trainee, map `users.course` string → `courses.id`, create an enrollment with status `pending_placement` (section NULL). Unknown strings → log and leave unmapped, never fail the migration.
- Extend `enrolled_students` with nullable `course_id`, `year_level`, `section_id`; extend `roster:import` to accept optional columns; on registration, if the roster row has a section, create an `active` enrollment, else `pending_placement`.
- Admin APIs: courses, sections (per course/year, configurable count), enrollments list, "Unassigned students" queue.
- Remove self-service course edit: drop `course` from `UpdateProfileRequest`/`ProfileController`/`ProfilePage.jsx`; show course read-only.
- Extend `SchemaTest` with the new tables.

**Tests:** BSIT-4A resolves and lists its students; migration preserves all existing users; profile update ignores `course`.

**Gate:** The system identifies BSIT-4A and exactly its enrolled students; existing users are untouched.

### Phase 3 — Coordinator assignment and section isolation

**Do**
- `coordinator_assignments` with the generated-column uniques (section active, coordinator active).
- Admin: create Coordinator (`POST /api/admin/coordinators`), assign/reassign (`…/assign-section`) in a transaction; reassignment closes the old row; all writes logged.
- `CoordinatorAccessService::traineesQuery($coordinator)` derived from active enrollments; **every** coordinator endpoint goes through it (no ID taken from the request can widen scope). Add `EnsureCoordinatorSection` and policies (`TraineePolicy`).
- Out-of-scope trainee id → 404.
- `ActivityLogService` + `activity_logs` (write on assignment changes).

**Tests:** COORD-01..04, assignment races (two admins assigning same section), reassignment keeps history.

**Gate:** A Coordinator cannot read or write anything outside their section, including via URL/body tampering.

### Phase 4 — Academic progression

**Do**
- `EnrollmentProgressionService` + `enrollment_progressions`: `prepare` (dry run for an academic-year rollover: next year level per eligible student; repeaters, transfers, incomplete, and 4th-years excluded or marked `completed`) and `confirm` (Admin picks the destination section; new active enrollment created, old one closed, history kept).
- Unconfirmed rows keep the old enrollment active.
- Course/section transfer = Admin-only, preserves previous enrollment.
- Notify student and new Coordinator through **server** notifications (needs Phase 5's `source` column; if done earlier, add the column here).

**Tests:** ENROLL-01..04, 4th-year → `completed`, double-confirm is idempotent, rollover inside one transaction.

**Gate:** Students progress without losing prior enrollment, Coordinator, or OJT history.

### Phase 5 — Logbook review and OJT management (highest risk)

Do these in order, each with tests, because they touch live sync:
1. Migration: `duty_entries` status/review/verified columns, `user_notifications.source`, `duty_entry_reviews`, `training_hour_exceptions`. Backfill existing entries per the decision in section 4.
2. `LogbookStore`/`LogbookValidator`: server-owned fields, protected deletes, ignore client `targetHours`, return resolved target, notifications `source` handling. Update `tests/js/sync.test.mjs` and `LogbookStorageTest`/`SyncTest` for the new behavior (keep existing cases passing where semantics are unchanged).
3. `POST /api/logbook/entries/{entry_uid}/submit` (+ resubmit after rejection).
4. `DutyEntryApprovalService`: approve/reject with required reason, immutable `duty_entry_reviews`, bump trainee `logbook_revision`, create server notification, write `activity_logs`.
5. `TrainingHourService`: verified vs pending vs total; Admin hour exceptions (`training_hour_exceptions` with previous/new hours, reason, admin, timestamp). Only `approved` counts toward official verified hours.
6. Placements: `host_establishments`, `trainee_placements`, `host_clients.placement_id`; placement-managed schedules are read-only in sync.
7. Attendance verification as a per-entry verified flag on review (do not build a separate attendance subsystem unless the school requires one).
8. Frontend (trainee): show status chips, "Submit for review", read-only locked entries, verified vs pending hours, read-only target.

**Tests:** LOG-01..05, HOURS-01..02, DATA-01..02, PWA-01; stale device pushing an old doc cannot delete/alter submitted or approved entries; approval bumps revision and triggers 409 on the stale device; server notifications survive a client notification push.

**Gate:** Approved entries and the required-hours target cannot be changed by any trainee request, online or offline.

### Phase 6 — Management interfaces

**Do:** `Pages/Admin/*` and `Pages/Coordinator/*` with a desktop layout (separate from the phone-first trainee shell), `services/adminService.js` and `coordinatorService.js`, lazy routes under `/admin/*` and `/coordinator/*` using `homePath`. Start with the screens that unblock work: Admin (Users, Coordinators, Sections, Enrollments + Unassigned queue, Progression, Training Requirements) then Coordinator (Dashboard, Trainees, Logbook Approvals, Progress). Announcements and reports come in Phase 7.

**Tests:** DESKTOP-01, DESKTOP-02; route guard smoke tests; confirm every UI action is also enforced by the API.

**Gate:** Both management roles complete their core workflows end to end on desktop.

### Phase 7 — Reports, notifications, audit

**Do:** section and global reports (verified hours only), PDF/CSV export restricted to scope, announcements + `announcement_recipients` (server notifications, web push optional via existing push infrastructure), activity log viewer (Admin global, Coordinator own section).

**Gate:** Management can trace every approval, assignment, and exception, and exports contain only authorized data.

### Phase 8 — Production readiness

**Do:** run the full PHP + JS test suites (including on MySQL, not just SQLite); rehearse migrations on a copy of production data with a backup first; verify HTTPS/proxy settings (`OCC_FORCE_HTTPS`, `OCC_TRUSTED_PROXIES` ideally a real proxy list, not `*`), `APP_DEBUG=false`, `OCC_CSP_ENFORCE`; rotate leaked credentials; confirm `.env`/logs are not in any repo or shared zip; test mobile PWA offline + desktop admin; review rate limits on new endpoints; confirm backups.

**Gate:** No critical authorization, data-loss, or migration issue remains.

---

## 6. Acceptance test IDs (from the spec, kept)

AUTH-01..04, COORD-01..04, ENROLL-01..04, LOG-01..05, HOURS-01..02, DATA-01..02, PWA-01, DESKTOP-01..02. Add: STAFF-LOGIN-RATE-LIMIT, DEACTIVATE-REVOKES-SESSIONS, ROSTER-AUTO-ENROLL, SERVER-NOTIFS-SURVIVE-SYNC, APPROVAL-BUMPS-REVISION.

## 7. Progress log (update after every phase)

| Phase | Status | Date | Notes |
|---|---|---|---|
| 0 Roster off + sync pause fix | Done (not verified on a running server) | 2026-11-23 | See section 0 |
| 1 Foundation | Done (confirmed by user) | 2026-11-23 | |
| 2 Academic structure | Code written; PHP tests not run in sandbox (could not install vendor) | 2026-11-23 | Run migrate + test + npm run build |
| 3 Coordinator assignment | Code written; PHP tests not run | 2026-11-23 | Run migrate + test |
| 4 Progression | Code written; PHP tests not run. Adds user_notifications.source (server notices survive sync) | 2026-11-23 | Run migrate + test |
| 5 Logbook review | 5a + 5b written (status, submit, approve/reject, protected sync, hours, exceptions, placements, trainee UI); PHP tests for 5b not run; `npm run build` needed | 2026-11-23 | Decisions used: legacy=draft+legacy; coordinator comments only; resubmission derived from history; pending_placement trainees may log drafts. Coordinator/Admin screens come in Phase 6 |
| 6 Interfaces | Code written; `vite build` passes in sandbox; PHP tests not run. Admin (Overview, Coordinators, Sections, Enrollments + Unassigned, Progression, Training requirements, Activity) and Coordinator (Dashboard, Trainees + entries + placement, Approvals, Activity) as tabbed desktop pages; `services/adminService.js`, `coordinatorService.js`, `Components/staff/ui.jsx`; `StaffInterfaceTest` (DESKTOP-01/02) | 2026-11-23 | Tabs are in-page state (single `/admin`, `/coordinator` route), not nested routes. No admin UI yet for: user deactivation, creating Admin accounts (CLI only), establishments management beyond create. |
| 7 Reports/notifications/audit | Code written; `vite build` passes; PHP tests not run. Hours report (verified = approved only) + CSV (formula-safe, scope-pinned, logged), print-to-PDF from browser (no server PDF), announcements (all/course/section for Admin; own section only for Coordinator) delivered as server notifications, audit viewer with actor names + action filter. New: `announcements`, `announcement_recipients`, `ReportController`, `ReportService`, `AnnouncementService`, `ReportsAnnouncementsTest` | 2026-11-23 | Run migrate + test + npm run build |
| 8 Production readiness | Code written; PHP tests not run. Added `php artisan occ:preflight` (read-only go-live check), `PreflightTest`, `PRODUCTION-CHECKLIST.md`. Stored-generated-column DDL verified on MariaDB 10.11 in sandbox (not MySQL 8). Remaining items are manual (rotate secrets, backup + migration rehearsal, MySQL test run, device passes) | 2026-11-23 | Run `occ:preflight` on the server |

## 8. Prompt to paste into the next chat

> I'm continuing OCCDL. I've attached the current project zip (no vendor/node_modules) and OCCDL-implementation-SKILL.md. Do Phase N only. Follow the ground rules and corrections in the file, write additive migrations that work on MySQL and SQLite, add the phase's tests, tell me exactly which commands to run (`php artisan migrate`, `php artisan test`, `npm run build`, `php artisan config:clear`), and give me a zip of only the changed/new files plus an updated progress log.

## 9. First Admin from .env (added after Phase 8)

`INITIAL_ADMIN_NAME/EMAIL/PASSWORD/ID` in `.env` + `php artisan db:seed --class=AdminSeeder` (also called by `DatabaseSeeder`, which still skips the demo trainee in production). Same variables as sclfAPP. The seeded account has `must_change_password=true`: `StaffShell` shows only a change-password form until the password is replaced; `PUT /api/profile/password` clears the flag; re-seeding never touches the account afterwards. The block is front-end only (the API is not closed to a flagged account). Staff sign in with **Staff ID** (INITIAL_ADMIN_ID) at `/staff-login`, not email. `staff:create-admin` still works. Never put real values in `.env.example`.
