<?php

namespace App\Services\Academic;

use App\Models\DutyEntry;
use App\Models\HostClient;
use App\Models\TraineePlacement;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * Weekly duty timetable of ONE trainee (Monday to Sunday, Philippine date).
 *
 * Expected hours come from the host client's schedule: time_in to 12:00 is the morning block and 13:00 to
 * time_out the afternoon block (the logbook fixes lunch at 12:00-13:00). Each logged segment is compared with the
 * start of its expected block:
 *   on time (<= 0 min late)  -> ontime      green
 *   1-30 min late            -> late        yellow
 *   more than 30 min late    -> very_late   red
 *   evening / overtime entry -> overtime    blue (outside the host schedule)
 *   no expected block known  -> logged      neutral
 * A scheduled day in the past with no entry is "absent"; today without an entry is "not_logged".
 *
 * "Late" is derived from the times the trainee typed (the app has no clock-in), so it is only as honest as the
 * logbook; the coordinator's approval is the check on that.
 *
 * The caller decides WHO may see the trainee (coordinator scope / admin / own account); this class only builds data.
 */
class TimetableService
{
    public const LATE_MAX = 30;      // minutes: 1..30 late is yellow, above is red
    private const LUNCH_OUT = 720;   // 12:00
    private const LUNCH_IN = 780;    // 13:00
    private const DOW = [1 => 'Mon', 2 => 'Tue', 3 => 'Wed', 4 => 'Thu', 5 => 'Fri', 6 => 'Sat', 7 => 'Sun'];

    public function week(User $trainee, ?string $date = null): array
    {
        $tz = config('occ.timezone', 'Asia/Manila');
        $today = CarbonImmutable::now($tz)->startOfDay();
        $start = ($date ? CarbonImmutable::createFromFormat('Y-m-d', $date, $tz) : $today)->startOfWeek(CarbonImmutable::MONDAY)->startOfDay();
        $end = $start->addDays(6);

        $entries = DutyEntry::with('hostClient')->where('user_id', $trainee->id)
            ->whereBetween('duty_date', [$start->toDateString(), $end->toDateString()])
            ->orderBy('am_in')->orderBy('pm_in')->orderBy('id')->get();
        $placement = TraineePlacement::with('establishment')->where('user_id', $trainee->id)->whereNull('ended_at')->latest('id')->first();
        $hosts = $this->scheduleHosts($trainee, $entries, $placement);

        $scheduledDays = $hosts->flatMap(fn (array $h) => $h['days'])->unique()->values()->all();
        $entryDays = $entries->map(fn (DutyEntry $e) => (int) $e->duty_date->isoWeekday())->unique()->values()->all();
        $shown = array_values(array_unique(array_merge($scheduledDays ?: [1, 2, 3, 4, 5], $entryDays)));
        sort($shown);

        $days = [];
        $counts = ['ontime' => 0, 'late' => 0, 'very_late' => 0, 'absent' => 0];
        $tot = ['logged' => 0.0, 'verified' => 0.0, 'pending' => 0.0, 'draft' => 0.0, 'rejected' => 0.0];

        foreach ($shown as $dow) {
            $day = $start->addDays($dow - 1);
            $ymd = $day->toDateString();
            $expected = $hosts->filter(fn (array $h) => in_array($dow, $h['days'], true))
                ->map(fn (array $h) => ['host' => $h['name'], 'type' => $h['type']] + $this->expected($h))->values()->all();

            $cards = [];
            $rows = [];
            $hours = 0.0;
            foreach ($entries->filter(fn (DutyEntry $e) => $e->duty_date->toDateString() === $ymd) as $e) {
                $h = $e->hostClient ? $this->hostRow($e->hostClient) : $this->placementHost($placement);
                $exp = $this->expected($h);
                $overtime = $e->category !== 'regular';
                $segs = ['am' => [$e->am_in, $e->am_out], 'pm' => [$e->pm_in, $e->pm_out], 'ev' => [$e->ev_in, $e->ev_out]];
                foreach ($segs as $slot => [$in, $out]) {
                    if (! $in || ! $out) {
                        continue;
                    }
                    [$state, $late] = $overtime || $slot === 'ev' ? ['overtime', 0] : $this->state($in, $exp[$slot]);
                    $cards[] = [
                        'entry_id' => $e->id, 'slot' => $slot, 'in' => $in, 'out' => $out, 'hours' => round($this->span($in, $out), 2),
                        'state' => $state, 'late_minutes' => $late, 'expected_in' => $exp[$slot][0] ?? null,
                        'host' => $h['name'] ?? null, 'type' => $h['type'] ?? null, 'status' => $e->status,
                    ];
                    if ($e->status !== DutyEntry::REJECTED && isset($counts[$state])) {
                        $counts[$state]++;
                    }
                }
                $rows[] = ['id' => $e->id, 'host' => $h['name'] ?? null, 'type' => $h['type'] ?? null, 'status' => $e->status, 'category' => $e->category, 'hours' => (float) $e->hours, 'review_reason' => $e->review_reason];
                $this->addTotals($tot, $e);
                if ($e->status !== DutyEntry::REJECTED) {
                    $hours += (float) $e->hours;
                }
            }

            $scheduled = in_array($dow, $scheduledDays, true);
            $status = $rows ? 'logged' : ($scheduled ? ($day->lt($today) ? 'absent' : ($day->equalTo($today) ? 'not_logged' : 'upcoming')) : 'rest');
            if ($status === 'absent') {
                $counts['absent']++;
            }
            $days[] = [
                'date' => $ymd, 'dow' => $dow, 'label' => self::DOW[$dow], 'day' => $day->format('M j'),
                'is_today' => $day->equalTo($today), 'scheduled' => $scheduled, 'status' => $status,
                'expected' => $expected, 'cards' => $cards, 'entries' => $rows, 'hours' => round($hours, 2),
            ];
        }

        return [
            'trainee' => ['id' => $trainee->id, 'name' => $trainee->fullName(), 'student_id' => $trainee->student_id],
            'week' => [
                'start' => $start->toDateString(), 'end' => $end->toDateString(), 'is_current' => $start->equalTo($today->startOfWeek(CarbonImmutable::MONDAY)),
                'prev' => $start->subWeek()->toDateString(), 'next' => $start->addWeek()->toDateString(),
                'label' => $start->format('M j').' – '.$end->format($start->month === $end->month ? 'j, Y' : 'M j, Y'),
            ],
            'hosts' => $hosts->map(fn (array $h) => ['name' => $h['name'], 'type' => $h['type'], 'days' => $h['days'], 'time_in' => $h['time_in'], 'time_out' => $h['time_out']])->values()->all(),
            'has_schedule' => $hosts->isNotEmpty(),
            'late_after_minutes' => self::LATE_MAX,
            'days' => $days,
            'totals' => array_map(fn ($v) => round($v, 2), $tot) + ['counts' => $counts],
        ];
    }

    /** Hosts that define the expected schedule: the coordinator-managed ones if any, else all; plus any host used this week. */
    private function scheduleHosts(User $trainee, $entries, ?TraineePlacement $placement)
    {
        $all = HostClient::where('user_id', $trainee->id)->orderBy('position')->orderBy('id')->get();
        $managed = $all->whereNotNull('placement_id');
        $usedIds = $entries->pluck('host_client_id')->filter()->all();
        $picked = ($managed->isNotEmpty() ? $managed : $all)->merge($all->whereIn('id', $usedIds))->unique('id');
        $hosts = $picked->map(fn (HostClient $h) => $this->hostRow($h))->values();

        if ($hosts->isEmpty() && ($p = $this->placementHost($placement))) {
            $hosts = collect([$p]);
        }

        return $hosts;
    }

    private function hostRow(HostClient $h): array
    {
        return ['name' => $h->name, 'type' => $h->type, 'days' => array_values(array_map('intval', $h->days ?? [])), 'time_in' => $h->time_in, 'time_out' => $h->time_out];
    }

    private function placementHost(?TraineePlacement $p): ?array
    {
        return $p ? ['name' => $p->establishment?->name, 'type' => $p->establishment?->type ?? 'custom', 'days' => array_values(array_map('intval', $p->days ?? [])), 'time_in' => $p->time_in, 'time_out' => $p->time_out] : null;
    }

    /** Expected [in, out] of the morning and afternoon block of a host (null when the host has no such block). */
    private function expected(?array $h): array
    {
        if (! $h || ! $h['time_in'] || ! $h['time_out']) {
            return ['am' => null, 'pm' => null];
        }
        $in = $this->min($h['time_in']);
        $out = $this->min($h['time_out']);

        return [
            'am' => $in < self::LUNCH_OUT ? [$h['time_in'], $out < self::LUNCH_OUT ? $h['time_out'] : '12:00'] : null,
            'pm' => $out > self::LUNCH_IN ? [$in > self::LUNCH_IN ? $h['time_in'] : '13:00', $h['time_out']] : null,
        ];
    }

    private function state(string $in, ?array $exp): array
    {
        if (! $exp) {
            return ['logged', 0];
        }
        $late = $this->min($in) - $this->min($exp[0]);

        return $late <= 0 ? ['ontime', 0] : ($late <= self::LATE_MAX ? ['late', $late] : ['very_late', $late]);
    }

    private function addTotals(array &$t, DutyEntry $e): void
    {
        $h = (float) $e->hours;
        match ($e->status) {
            DutyEntry::APPROVED => [$t['logged'] += $h, $t['verified'] += (float) ($e->verified_hours ?? $h)],
            DutyEntry::SUBMITTED => [$t['logged'] += $h, $t['pending'] += $h],
            DutyEntry::REJECTED => $t['rejected'] += $h,
            default => [$t['logged'] += $h, $t['draft'] += $h],
        };
    }

    private function min(string $hhmm): int
    {
        [$h, $m] = array_map('intval', explode(':', $hhmm)) + [0, 0];

        return $h * 60 + $m;
    }

    private function span(string $in, string $out): float
    {
        return max(0, $this->min($out) - $this->min($in)) / 60;
    }
}
