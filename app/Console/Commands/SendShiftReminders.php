<?php

namespace App\Console\Commands;

use App\Models\DutyEntry;
use App\Models\HostClient;
use App\Models\PushReminderLog;
use App\Models\PushSubscription;
use App\Models\User;
use App\Models\UserSetting;
use App\Services\Push\WebPushSender;
use Carbon\Carbon;
use Illuminate\Console\Command;

/**
 * Runs every minute (routes/console.php) and sends the two reminders as real push messages, so they
 * reach the phone with the app closed:
 *   - shift-start: OCC_REMINDER_START_MIN (20) minutes before the host client's time in
 *   - shift-end  : OCC_REMINDER_END_MIN   (10) minutes before the host client's time out
 *
 * Same rules as the in-app reminders in LogbookPage.jsx: the client the trainee logged hours under most
 * recently, and only on that client's working days. Each reminder is sent once per day (push_reminder_logs).
 */
class SendShiftReminders extends Command
{
    protected $signature = 'push:reminders {--at= : pretend it is this Y-m-d H:i (in OCC_TIMEZONE), for testing}';

    protected $description = 'Send the shift-start and clock-out reminders as Web Push';

    public function handle(WebPushSender $push): int
    {
        if (! $push->configured()) {
            $this->warn('Web Push is not configured (VAPID keys or the minishlink/web-push package are missing).');

            return self::SUCCESS;
        }

        $tz = (string) config('occ.timezone', 'Asia/Manila');
        $now = $this->option('at') ? Carbon::parse((string) $this->option('at'), $tz) : Carbon::now($tz);
        $date = $now->toDateString();
        $nowMin = $now->hour * 60 + $now->minute;
        $weekday = $now->isoWeekday(); // 1 = Monday ... 7 = Sunday, the same numbers the app saves in `days`
        $startLead = (int) config('occ.reminder_start_minutes', 20);
        $endLead = (int) config('occ.reminder_end_minutes', 10);
        // A time out logged this close to the end of the shift (or later) means they already clocked out.
        $clockedOutFrom = max($endLead, (int) config('occ.clock_out_window_minutes', 30));

        $sent = 0;
        $userIds = PushSubscription::query()->distinct()->pluck('user_id');

        foreach (User::whereIn('id', $userIds)->get() as $user) {
            $client = $this->clientFor($user);
            if (! $client) {
                continue;
            }
            $days = array_map('intval', (array) $client->days);
            if (! in_array($weekday, $days, true)) {
                continue;
            }

            $in = self::minutes($client->time_in);
            $out = self::minutes($client->time_out);
            $entries = DutyEntry::where('user_id', $user->id)->whereDate('duty_date', $date)
                ->where('host_client_id', $client->id)->get();

            // Shift start: skipped once hours for this client are already logged today.
            if ($in !== null && $nowMin >= $in - $startLead && $nowMin < $in && $entries->isEmpty()) {
                $left = $in - $nowMin;
                $sent += $this->send($push, $user, $client, 'shift-start', $date, [
                    'title' => 'Your OJT shift starts soon',
                    'body' => sprintf('%s starts at %s, about %d minute%s from now.', $client->name, self::time12($client->time_in), $left, $left === 1 ? '' : 's'),
                    'tag' => "shift-reminder-{$date}",
                ]);
            }

            // Clock-out: skipped when a time out close to the end of the shift (within
            // OCC_CLOCK_OUT_WINDOW_MIN of it) is already logged, e.g. they left a few minutes early.
            if ($out !== null && ($in === null || $out > $in) && $nowMin >= $out - $endLead && $nowMin < $out
                && ! $this->alreadyClockedOut($entries, $out - $clockedOutFrom)) {
                $left = $out - $nowMin;
                $sent += $this->send($push, $user, $client, 'shift-end', $date, [
                    'title' => 'Time to clock out soon',
                    'body' => sprintf('Your shift at %s ends at %s, about %d minute%s from now. Remember to log your time out.', $client->name, self::time12($client->time_out), $left, $left === 1 ? '' : 's'),
                    'tag' => "shift-end-{$date}",
                ]);
            }
        }

        // Tidy up once an hour.
        if ($now->minute === 0) {
            PushReminderLog::where('local_date', '<', $now->copy()->subDays(14)->toDateString())->delete();
        }

        $this->info("Reminders sent: {$sent}");

        return self::SUCCESS;
    }

    /** The client the trainee most recently logged under (or their only client). */
    private function clientFor(User $user): ?HostClient
    {
        $clients = HostClient::where('user_id', $user->id)->orderBy('position')->orderBy('id')->get();
        if ($clients->isEmpty()) {
            return null;
        }
        $last = UserSetting::where('user_id', $user->id)->value('last_client_uid');
        $match = $last ? $clients->firstWhere('client_uid', $last) : null;

        return $match ?? ($clients->count() === 1 ? $clients->first() : null);
    }

    /** Claims the reminder first (unique row), then sends; gives the claim back if no device got it. */
    private function send(WebPushSender $push, User $user, HostClient $client, string $kind, string $date, array $payload): int
    {
        $claimed = PushReminderLog::insertOrIgnore([[
            'user_id' => $user->id, 'client_uid' => $client->client_uid, 'kind' => $kind,
            'local_date' => $date, 'created_at' => now(), 'updated_at' => now(),
        ]]);
        if ($claimed === 0) {
            return 0; // already sent today
        }

        $accepted = $push->sendToUser($user, $payload + ['url' => '/logbook']);
        if ($accepted === 0) {
            PushReminderLog::where(['user_id' => $user->id, 'client_uid' => $client->client_uid, 'kind' => $kind, 'local_date' => $date])->delete();

            return 0;
        }

        return 1;
    }

    private function alreadyClockedOut($entries, int $fromMinute): bool
    {
        foreach ($entries as $e) {
            foreach ([$e->am_out, $e->pm_out, $e->ev_out] as $t) {
                $m = self::minutes($t);
                if ($m !== null && $m >= $fromMinute) {
                    return true;
                }
            }
        }

        return false;
    }

    public static function minutes(?string $hhmm): ?int
    {
        if (! $hhmm || ! preg_match('/^(\d{1,2}):(\d{2})$/', $hhmm, $m)) {
            return null;
        }

        return ((int) $m[1]) * 60 + (int) $m[2];
    }

    private static function time12(string $hhmm): string
    {
        $m = self::minutes($hhmm) ?? 0;

        return Carbon::createFromTime(intdiv($m, 60), $m % 60)->format('g:i A');
    }
}
