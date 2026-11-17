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

* `curl -i https://your-domain/manifest.webmanifest` must answer `200` with `Content-Type: application/manifest+json` and JSON (not HTML).
* `https://your-domain/apple-touch-icon.png` must open the shield icon.
* iPhone: delete the old home-screen icon first, reload the site once in Safari, then Share > Add to Home Screen again (iOS keeps the old/blank icon until you do).

## Health check

`GET /up` returns 200 when the app is running.
