# Deploying OCCDL on EthioDeploy

The project ships a `Dockerfile`, so EthioDeploy's **Builder = Auto (Dockerfile if present)** will use it.
It builds the React app, installs PHP packages, runs `php artisan migrate` on every start and serves
the site with Apache. Install / Build / Start commands are not needed: leave them empty.

## Environment variables (set these in the project's settings)

| Variable | Value |
|---|---|
| `APP_NAME` | `OCCDL` |
| `APP_ENV` | `production` |
| `APP_DEBUG` | `false` |
| `APP_KEY` | `base64:...` generate with `echo base64:$(openssl rand -base64 32)` (keep it forever; changing it signs everyone out) |
| `APP_URL` | `https://your-domain` (used in verification and reset links) |
| `LOG_CHANNEL` | `stderr` |
| `DB_CONNECTION` | `mysql` or `pgsql` (recommended), plus `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` |
| `SESSION_DRIVER` | `database` |
| `CACHE_STORE` | `file` (the default; do NOT use `database`: there is no cache table) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Web Push keys, see "Reminders on a closed app" below |
| `VAPID_SUBJECT` | `mailto:you@gmail.com` |
| `OCC_TIMEZONE` | `Asia/Manila` (default) |
| `MAIL_MAILER` | `smtp` (NOT `log`: with `log`, nobody ever receives the verification code) |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_SCHEME` | from your mail provider (e.g. Gmail app password, Brevo, Resend) |
| `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME` | sender shown in the emails |
| `OCC_MOBILE_ONLY` | `true` (phones only) or `false` |
| `OCC_INSPECT_PROTECTION` | `true` for production |

Do not set `SESSION_SECURE_COOKIE`: in production it defaults to secure, which needs HTTPS (EthioDeploy domains are HTTPS).

## Persistent storage

Profile photos are now stored **in the database** (table `user_photos`), so they survive every
redeploy as long as the database does. Use a managed MySQL/PostgreSQL database (or mount a volume on
`/var/www/html/database` if you stay on SQLite). A copy is also written to
`/var/www/html/storage/app/private`, but that disk may be wiped and nothing depends on it.
Photos that were saved on disk by an older version are copied into the database automatically the
next time their owner opens the app (while the file still exists).

## Checking the PWA after a deploy

* `curl -i https://your-domain/manifest.json` must answer `200` with `Content-Type: application/manifest+json` and JSON (not HTML).
* `https://your-domain/images/apple-touch-icon.png` must open the shield icon (the exact same file SCLF uses).
* iPhone: delete the old home-screen icon first, reload the site once in Safari, then Share > Add to Home Screen again (iOS keeps the old/blank icon until you do).

## Reminders on a closed app (Web Push)

The shift-start (20 min before time in) and clock-out (10 min before time out) reminders are real push
messages. They need three things, all included in the Dockerfile / entrypoint:

1. **VAPID keys, created once.** Deploy once without them: the container log prints a ready-made
   `VAPID_PUBLIC_KEY=...` / `VAPID_PRIVATE_KEY=...` pair (or run `php artisan webpush:vapid --show`).
   Copy both lines into the project's environment variables, then redeploy. Never change them afterwards.
2. **The scheduler.** `docker/entrypoint.sh` runs `php artisan schedule:run` every minute (which runs
   `push:reminders`). No cron setup needed. Keep ONE running container; two are harmless too (each reminder is sent once).
3. **Tables** `push_subscriptions` and `push_reminder_logs` (created by `php artisan migrate`, automatic on start).

Check it: sign in on the phone, open the bell, tap **Turn on alerts**, then **Send a test**.
Test the schedule logic without waiting: `php artisan push:reminders --at="2026-11-16 16:50"` (Monday, Manila time).

iPhone: Web Push only works for the app added to the Home Screen (iOS 16.4 or newer), opened from that icon.

After the first build, refresh the lock file on your computer so builds are exactly reproducible:
`composer update minishlink/web-push` and commit `composer.lock`.

## Health check

`GET /up` returns 200 when the app is running.
