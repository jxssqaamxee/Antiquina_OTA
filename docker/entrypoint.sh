#!/bin/sh
# Runs on every container start: prepares storage, migrates the database, caches config, starts Apache.
set -e
cd /var/www/html

if [ -z "$APP_KEY" ]; then
  echo "ERROR: APP_KEY is not set. Generate one with:  echo base64:\$(openssl rand -base64 32)" >&2
  exit 1
fi

# ---- Production safety checks: refuse the one dangerous setting, warn about weak ones -------
lower() { printf '%s' "$1" | tr 'A-Z' 'a-z'; }
warn() { echo "SECURITY WARNING: $1" >&2; }
if [ "$(lower "${APP_ENV:-production}")" = "production" ]; then
  case "$(lower "${APP_DEBUG:-false}")" in
    true|1|on|yes) echo "ERROR: APP_DEBUG is on in production (it shows secrets and stack traces). Set APP_DEBUG=false." >&2; exit 1 ;;
  esac
else
  warn "APP_ENV is '${APP_ENV}', not 'production'."
fi
case "${APP_URL:-}" in https://*) ;; *) warn "APP_URL is not an https:// address (reset and verification links will be insecure)." ;; esac
if [ "$(lower "${MAIL_MAILER:-log}")" = "log" ]; then warn "MAIL_MAILER=log: verification codes are written to the log and nobody receives email."; fi
if [ "$(lower "${LOG_LEVEL:-debug}")" = "debug" ]; then warn "LOG_LEVEL=debug: set LOG_LEVEL=warning in production."; fi
case "$(lower "${SESSION_SECURE_COOKIE:-true}")" in false|0|off|no) warn "SESSION_SECURE_COOKIE is off: remove it so cookies stay Secure." ;; esac
if [ "$(lower "${DB_CONNECTION:-sqlite}")" = "sqlite" ]; then warn "SQLite database: use a managed MySQL/PostgreSQL database and keep it private."; fi
if [ "${#APP_KEY}" -lt 40 ]; then warn "APP_KEY looks too short; generate it with: echo base64:\$(openssl rand -base64 32)"; fi

# A mounted volume starts empty: recreate the folders Laravel needs.
mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views \
         storage/logs storage/app/private/profile-pictures storage/app/public bootstrap/cache
if [ "${DB_CONNECTION:-sqlite}" = "sqlite" ]; then
  mkdir -p database && touch database/database.sqlite
  chown www-data:www-data database database/database.sqlite
fi
chown -R www-data:www-data storage bootstrap/cache

artisan() { runuser -u www-data -- php artisan "$@"; }

artisan migrate --force
artisan config:cache
artisan route:cache || echo "route:cache skipped"
artisan view:cache  || echo "view:cache skipped"

# Web Push needs two keys that never change. If they are missing, print a ready-made pair to copy.
if [ -z "$VAPID_PUBLIC_KEY" ] || [ -z "$VAPID_PRIVATE_KEY" ]; then
  echo "WARNING: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set, so reminders cannot reach a closed app." >&2
  echo "Add these two lines to the project's environment variables (generate them ONCE and keep them):" >&2
  artisan webpush:vapid --show >&2 || true
fi

# Scheduler: once a minute (aligned to the clock) it runs `push:reminders`. No cron needed.
(
  while true; do
    sleep $((60 - $(date +%S | sed 's/^0//')))
    runuser -u www-data -- php artisan schedule:run >/dev/null 2>&1 || true
  done
) &

exec apache2-foreground
