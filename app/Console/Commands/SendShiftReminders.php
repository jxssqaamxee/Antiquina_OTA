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
 *   - lunch-out / lunch-in : OCC_REMINDER_LUNCH_MIN (10) minutes before 12:00 and before 13:00 (shifts that cross lunch)
 *   - shift-done : right after the time out; on the client's last working day of the week it is the "week completed" message
 *
 * Every host client the trainee added is checked, and only on that client's own working days. Each reminder is sent once per day (push_reminder_logs).
 */
class SendShiftReminders extends Command
{
    private const LUNCH_OUT = 720; // 12:00, the logbook's fixed lunch
    private const LUNCH_IN = 780;  // 13:00

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
        $lunchLead = (int) config('occ.reminder_lunch_minutes', 10);
        $doneWindow = (int) config('occ.reminder_done_window_minutes', 10); // "good work" push goes out within this many minutes after time out
        // A time out logged this close to the end of the shift (or later) means they already clocked out.
        $clockedOutFrom = max($endLead, (int) config('occ.clock_out_window_minutes', 30));

        $sent = 0;
        $userIds = PushSubscription::query()->distinct()->pluck('user_id');

        foreach (User::whereIn('id', $userIds)->get() as $user) {
            foreach (self::clientsFor($user) as $client) {
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
                    'tag' => "shift-reminder-{$date}-{$client->client_uid}",
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
                    'tag' => "shift-end-{$date}-{$client->client_uid}",
                ]);
            }

            // Lunch (fixed 12:00-13:00 in the logbook), only for shifts that run across it.
            $crossesLunch = $in !== null && $out !== null && $in < self::LUNCH_OUT && $out > self::LUNCH_IN;
            if ($crossesLunch) {
                // 10 min before 12:00: lunch is coming, hours pause. Skipped once the morning time out is logged.
                if ($nowMin >= self::LUNCH_OUT - $lunchLead && $nowMin < self::LUNCH_OUT
                    && ! $entries->contains(fn ($e) => filled($e->am_out))) {
                    $left = self::LUNCH_OUT - $nowMin;
                    $sent += $this->send($push, $user, $client, 'lunch-out', $date, [
                        'title' => 'Your lunch break is coming',
                        'body' => sprintf('Lunch starts at 12:00 PM, about %d minute%s from now. Your hours stop at 12:00 and resume at 1:00 PM.', $left, $left === 1 ? '' : 's'),
                        'tag' => "lunch-out-{$date}-{$client->client_uid}",
                    ]);
                }

                // 10 min before 13:00: lunch is ending, hours resume. Skipped once the afternoon time in is logged.
                if ($nowMin >= self::LUNCH_IN - $lunchLead && $nowMin < self::LUNCH_IN
                    && ! $entries->contains(fn ($e) => filled($e->pm_in))) {
                    $left = self::LUNCH_IN - $nowMin;
                    $sent += $this->send($push, $user, $client, 'lunch-in', $date, [
                        'title' => 'Your lunch break is ending',
                        'body' => sprintf('Lunch ends at 1:00 PM, about %d minute%s from now. Your hours resume at 1:00 PM.', $left, $left === 1 ? '' : 's'),
                        'tag' => "lunch-in-{$date}-{$client->client_uid}",
                    ]);
                }
            }

            // End of the shift: a thank-you right after the time out. On the LAST working day of this
            // client's week (e.g. Friday for Mon-Fri) it becomes the "week completed, have a good rest" message.
            if ($out !== null && ($in === null || $out > $in) && $nowMin >= $out && $nowMin < $out + $doneWindow) {
                $lastDay = $weekday === max($days);
                $logged = $entries->isNotEmpty();
                if ($lastDay) {
                    $title = 'Week completed. Great job!';
                    $body = sprintf('You finished your last shift of the week at %s. Thank you for your hard work, have a good rest!', $client->name);
                } elseif ($logged) {
                    $title = 'Good work today!';
                    $body = sprintf('You successfully finished your shift at %s. Have a good rest and see you on your next duty day.', $client->name);
                } else {
                    $title = 'Your shift has ended';
                    $body = sprintf('Your shift at %s ended at %s. Remember to log your hours for today.', $client->name, self::time12($client->time_out));
                }
                $sent += $this->send($push, $user, $client, 'shift-done', $date, [
                    'title' => $title,
                    'body' => $body,
                    'tag' => "shift-done-{$date}-{$client->client_uid}",
                ]);
            }
            }
        }

        // Tidy up once an hour.
        if ($now->minute === 0) {
            PushReminderLog::where('local_date', '<', $now->copy()->subDays(14)->toDateString())->delete();
        }

        $this->info("Reminders sent: {$sent}");

        return self::SUCCESS;
    }

    /**
     * EVERY host client the trainee added, however many. handle() then keeps only the ones that work today and
     * whose reminder time is now, and each reminder is sent once per client per day (push_reminder_logs).
     *
     * @return \Illuminate\Support\Collection<int, HostClient>
     */
    public static function clientsFor(User $user): \Illuminate\Support\Collection
    {
        return HostClient::where('user_id', $user->id)->orderBy('position')->orderBy('id')->get();
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
