#!/bin/sh
# Runs on every container start: prepares storage, migrates the database, caches config, starts Apache.
set -e
cd /var/www/html

if [ -z "$APP_KEY" ]; then
  echo "ERROR: APP_KEY is not set. Generate one with:  echo base64:\$(openssl rand -base64 32)" >&2
  exit 1
fi

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
