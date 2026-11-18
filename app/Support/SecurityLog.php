<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * One place for security events (failed logins, lockouts, password changes ...).
 *
 * Rules: NEVER pass passwords, reset tokens or verification codes in $context.
 * Every line gets the IP and a short user agent automatically.
 *
 * Alerts: failures are counted in a rolling window. When the count reaches OCC_ALERT_FAILURES
 * (default 20) inside OCC_ALERT_WINDOW_MIN (default 10) minutes, ONE "security_alert" line is
 * written at level error. Point LOG_SECURITY_STACK at the security_slack channel (see
 * config/logging.php) to get that line as a Slack/Discord-style webhook message.
 */
final class SecurityLog
{
    public static function event(string $event, array $context = [], string $level = 'warning'): void
    {
        try {
            $request = request();
            Log::channel('security')->{$level}($event, $context + [
                'ip' => $request?->ip(),
                'ua' => mb_substr((string) $request?->userAgent(), 0, 120),
                'user_id' => $request?->user()?->id,
            ]);
        } catch (\Throwable) {
            // Logging must never break the request.
        }
    }

    /** Log a failure and raise the alert once when too many happen in a short time. */
    public static function failure(string $event, array $context = []): void
    {
        self::event($event, $context, 'warning');

        try {
            $window = max(1, (int) config('occ.alert_window_minutes', 10));
            $limit = max(1, (int) config('occ.alert_failures', 20));
            $key = 'security-failures-window';
            Cache::add($key, 0, now()->addMinutes($window));
            $count = (int) Cache::increment($key);
            if ($count === $limit) {
                self::event('security_alert', ['failures' => $count, 'window_minutes' => $window], 'error');
            }
        } catch (\Throwable) {
            // Cache trouble must not break sign-in.
        }
    }

    /** Short stable fingerprint for an email so logs never hold full addresses. */
    public static function fingerprint(string $value): string
    {
        return substr(hash('sha256', strtolower(trim($value))), 0, 12);
    }
}
