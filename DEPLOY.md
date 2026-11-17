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

Profile photos are saved in `/var/www/html/storage/app/private`. A container's disk is wiped on every
redeploy, so mount a persistent volume on that path, otherwise every photo disappears after each deploy
(the app then shows initials). If you stay on SQLite, also mount `/var/www/html/database`.
A managed MySQL/PostgreSQL database is safer than SQLite.

## Health check

`GET /up` returns 200 when the app is running.
