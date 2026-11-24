<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 8: read-only go-live check. Prints PASS / WARN / FAIL per item and exits 1 if anything FAILs.
 *
 *   php artisan occ:preflight            # production checks (use on the real server)
 *   php artisan occ:preflight --local    # only checks that make sense on a dev machine
 *
 * It changes nothing and prints no secret values.
 */
class Preflight extends Command
{
    protected $signature = 'occ:preflight {--local : Skip production-only checks}';

    protected $description = 'Check production settings, database and accounts before going live';

    private int $fails = 0;

    private int $warns = 0;

    private function row(string $level, string $label, string $hint = ''): void
    {
        match ($level) {
            'FAIL' => $this->fails++,
            'WARN' => $this->warns++,
            default => null,
        };
        $line = sprintf('  %-5s %s%s', $level, $label, $hint !== '' ? " — {$hint}" : '');
        $level === 'FAIL' ? $this->error($line) : ($level === 'WARN' ? $this->warn($line) : $this->line($line));
    }

    private function check(bool $ok, string $label, string $failHint, string $level = 'FAIL'): void
    {
        $ok ? $this->row('PASS', $label) : $this->row($level, $label, $failHint);
    }

    /** A real Laravel key: "base64:" + 32 random bytes (AES-256) or exactly 32 raw characters. */
    private function appKeyIsValid(string $key): bool
    {
        if (str_starts_with($key, 'base64:')) {
            $raw = base64_decode(substr($key, 7), true);

            return $raw !== false && strlen($raw) === 32;
        }

        return strlen($key) === 32;
    }

    public function handle(): int
    {
        $prod = ! $this->option('local');
        $this->info('OCCDL preflight'.($prod ? ' (production)' : ' (local)'));

        $this->line('Application');
        $this->check($this->appKeyIsValid((string) config('app.key')), 'APP_KEY is set', 'missing or not a real key: run php artisan key:generate (never change it later: sessions and encrypted data break)');
        if ($prod) {
            $this->check(config('app.env') === 'production', 'APP_ENV=production', 'set APP_ENV=production');
            $this->check(config('app.debug') === false, 'APP_DEBUG=false', 'debug pages leak secrets; set APP_DEBUG=false');
            $this->check(str_starts_with((string) config('app.url'), 'https://'), 'APP_URL uses https', 'set APP_URL=https://your-domain');
            $this->check((bool) config('occ.force_https'), 'OCC_FORCE_HTTPS=true', 'set OCC_FORCE_HTTPS=true behind HTTPS');
            $this->check((bool) config('occ.csp_enforce'), 'OCC_CSP_ENFORCE=true', 'set OCC_CSP_ENFORCE=true (report-only does not block anything)');
            $this->check((bool) config('session.secure'), 'session cookie is Secure', 'set SESSION_SECURE_COOKIE=true');
            $this->check((bool) config('occ.roster_enforce'), 'OCC_ROSTER_ENFORCE=true', 'with false anyone can claim any Student ID; set OCC_ROSTER_ENFORCE=true and import the roster');
            $proxies = trim((string) config('occ.trusted_proxies'));
            $this->check($proxies !== '*' && $proxies !== '**', 'OCC_TRUSTED_PROXIES is not "*"', 'list your proxy IPs/CIDRs; "*" lets anyone forge X-Forwarded-For and dodge rate limits');
            if ($proxies === '') {
                $this->row('WARN', 'OCC_TRUSTED_PROXIES is empty', 'no proxy is trusted: behind a host proxy/CDN every visitor shares one IP and https detection fails; list the proxy IPs');
            }
            $this->check(blank(config('occ.initial_admin_password')), 'INITIAL_ADMIN_PASSWORD removed from .env', 'remove INITIAL_ADMIN_PASSWORD (and INITIAL_ADMIN_*) from .env once the first admin exists');
            $this->check(! in_array(config('mail.default'), ['log', 'array'], true), 'mail is really sent', 'MAIL_MAILER=log means verification and reset emails are never delivered');
            $dbUser = (string) config('database.connections.'.config('database.default').'.username');
            $this->check(strtolower($dbUser) !== 'root', 'database user is not root', 'create a dedicated DB user with rights on this database only; root can read and drop every database on the server', 'WARN');
            $this->check(config('database.default') === 'mysql' || config('database.default') === 'mariadb', 'database is MySQL/MariaDB', 'production should not run on SQLite', 'WARN');
        }
        $this->check(config('session.driver') === 'database', 'sessions are stored in the database', 'set SESSION_DRIVER=database (sessions can be revoked per user)');
        $this->check(filled(config('webpush.vapid.public_key')) && filled(config('webpush.vapid.private_key')), 'Web Push (VAPID) keys are set', 'run php artisan webpush:vapid --show once; reminders will not push without them', 'WARN');

        $this->line('Database');
        try {
            DB::connection()->getPdo();
            $this->row('PASS', 'database connection works');
            foreach (['users', 'sessions', 'duty_entries', 'student_enrollments', 'coordinator_assignments', 'announcements'] as $t) {
                $this->check(Schema::hasTable($t), "table {$t} exists", 'run php artisan migrate --force');
            }
            if (Schema::hasColumn('users', 'role')) {
                $this->check(User::where('role', User::ROLE_ADMIN)->where('is_active', true)->exists(), 'an active Admin exists', 'run php artisan admin:create');
                $this->check(User::where('role', 'trainee')->where(fn ($q) => $q->whereNull('student_id'))->doesntExist(), 'every trainee has a Student ID', 'fix trainee rows that have no student_id');
            }
        } catch (\Throwable $e) {
            $this->row('FAIL', 'database connection works', 'cannot connect: check DB_* settings');
        }

        $this->line('Files');
        $this->check(is_writable(storage_path('logs')) && is_writable(storage_path('framework')), 'storage/ is writable', 'chmod/chown storage and bootstrap/cache for the web user');
        $this->check(file_exists(public_path('build/manifest.json')), 'frontend is built', 'run npm ci && npm run build');
        if ($prod) {
            $leak = array_filter(['.env.example', '.envpro.txt'], fn ($f) => file_exists(public_path($f)));
            $this->check($leak === [], 'no env files inside public/', 'remove env files from the web root');
        }

        $this->newLine();
        $this->line("Result: {$this->fails} failed, {$this->warns} warnings.");
        $this->line('Also do by hand: backups, secret rotation, MySQL test run — see PRODUCTION-CHECKLIST.md.');

        return $this->fails > 0 ? self::FAILURE : self::SUCCESS;
    }
}
