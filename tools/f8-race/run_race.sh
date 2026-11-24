#!/bin/bash
# One-shot: start MariaDB, migrate, seed, race approve vs reject. Prints verdict.
set -u
export DB_CONNECTION=mysql DB_HOST=127.0.0.1 DB_PORT=3306 DB_DATABASE=occ_race DB_USERNAME=race DB_PASSWORD=race
export CACHE_STORE=array SESSION_DRIVER=array QUEUE_CONNECTION=sync MAIL_MAILER=array APP_ENV=local OCC_FORCE_HTTPS=false
mkdir -p /run/mysqld && chown mysql:mysql /run/mysqld
pgrep -x mariadbd >/dev/null || (mysqld_safe --bind-address=127.0.0.1 >/tmp/mysqld.log 2>&1 &)
for i in $(seq 1 40); do mysqladmin ping --silent 2>/dev/null && break; sleep 1; done
mysql -e "DROP DATABASE IF EXISTS occ_race; CREATE DATABASE occ_race; CREATE USER IF NOT EXISTS 'race'@'127.0.0.1' IDENTIFIED BY 'race'; GRANT ALL ON occ_race.* TO 'race'@'127.0.0.1'; FLUSH PRIVILEGES;"
cd /home/claude/occ
echo "isolation: $(mysql -N -e 'select @@tx_isolation') / $(mysql -N -e 'select version()')"
php artisan migrate --force -q || { echo MIGRATE FAILED; exit 1; }
php /home/claude/race/setup.php
# A approves and holds the lock 3s; B (rejects) starts 1s later, so it takes its snapshot before A commits.
php /home/claude/race/actor.php approve 0 3 > /tmp/a.out 2>&1 &
php /home/claude/race/actor.php reject 1 0 > /tmp/b.out 2>&1 &
wait
cat /tmp/a.out /tmp/b.out
echo "--- final state"
mysql -N -e "select 'entry status:', status, ifnull(verified_hours,'-') from occ_race.duty_entries where entry_uid='race1';
             select 'review rows (approved/rejected):', count(*) from occ_race.duty_entry_reviews where action in ('approved','rejected');
             select 'activity rows entry.*:', count(*) from occ_race.activity_logs where action like 'entry.%';"
