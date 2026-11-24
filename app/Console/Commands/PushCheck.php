<?php

namespace App\Console\Commands;

use App\Models\PushSubscription;
use App\Models\User;
use App\Services\Push\WebPushSender;
use Carbon\Carbon;
use Illuminate\Console\Command;

/**
 * "Why did this trainee get no reminder?" Prints, per account with a registered install: the installs, the
 * host client the reminders would use, its days / times, and whether a reminder is due right now.
 *   php artisan push:check            (everyone)    php artisan push:check --user=2021-2-00123   (Student ID or user id)
 */
class PushCheck extends Command
{
    protected $signature = 'push:check {--user= : Student ID, Admin ID or user id}';

    protected $description = 'Diagnose Web Push reminders: installs, host client and schedule per trainee';

    public function handle(WebPushSender $push): int
    {
        $this->line('VAPID + web-push library: '.($push->configured() ? 'OK' : 'MISSING (keys or package) - nothing can be sent'));
        $tz = (string) config('occ.timezone', 'Asia/Manila');
        $now = Carbon::now($tz);
        $this->line("Server clock in {$tz}: ".$now->format('D Y-m-d H:i').' (the scheduler must run `php artisan schedule:run` every minute)');

        $q = User::whereIn('id', PushSubscription::query()->distinct()->pluck('user_id'));
        if ($who = $this->option('user')) {
            $q->where(fn ($w) => $w->where('student_id', $who)->orWhere('admin_id', $who)->orWhere('id', is_numeric($who) ? (int) $who : 0));
        }
        $users = $q->get();
        if ($users->isEmpty()) {
            $this->warn('No account has a registered install yet: the person must open the app signed in and turn alerts on.');

            return self::SUCCESS;
        }

        $nowMin = $now->hour * 60 + $now->minute;
        $rows = [];
        foreach ($users as $user) {
            $installs = PushSubscription::where('user_id', $user->id)->get();
            $clients = SendShiftReminders::clientsFor($user);
            if ($clients->isEmpty()) {
                $rows[] = [$user->id, $user->student_id ?? $user->admin_id, $installs->count(), '-', '-', '-', 'NO host client: nothing to remind about'];

                continue;
            }
            foreach ($clients as $c) {
                $in = SendShiftReminders::minutes($c->time_in);
                $out = SendShiftReminders::minutes($c->time_out);
                $today = in_array($now->isoWeekday(), array_map('intval', (array) $c->days), true);
                $due = [];
                if ($today && $in !== null && $nowMin >= $in - (int) config('occ.reminder_start_minutes', 20) && $nowMin < $in) {
                    $due[] = 'start due';
                }
                if ($today && $out !== null && $nowMin >= $out - (int) config('occ.reminder_end_minutes', 10) && $nowMin < $out) {
                    $due[] = 'clock-out due';
                }
                $rows[] = [$user->id, $user->student_id ?? $user->admin_id, $installs->count(), $c->name, implode(',', (array) $c->days)." {$c->time_in}-{$c->time_out}", $today ? 'working day' : 'day off', implode(' ', $due) ?: 'nothing due now'];
            }
        }
        $this->table(['user', 'Student/Admin ID', 'installs', 'host client', 'days & times', 'today', 'status'], $rows);

        return self::SUCCESS;
    }
}
