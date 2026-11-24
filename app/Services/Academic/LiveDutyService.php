<?php

namespace App\Services\Academic;

use App\Models\DutyEntry;
use App\Models\StudentEnrollment;
use App\Models\TraineePlacement;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * "Who is on duty right now": today's duty entries (Philippine date) of the trainees in scope, with the host
 * client each entry was logged under. The server only says WHAT was logged today; whether a segment is
 * running, upcoming or finished is derived from the wall clock in the browser (utils/liveProgress.js), so the
 * numbers tick without a request every second.
 *
 * Scope is decided by the caller: Admin passes null (every enrolled trainee), a Coordinator passes the query
 * from CoordinatorAccessService::traineesQuery (own section only).
 */
class LiveDutyService
{
    public function today(?Builder $traineesQuery = null): array
    {
        $tz = config('occ.timezone', 'Asia/Manila');
        $now = now($tz);
        $date = $now->toDateString();

        $users = ($traineesQuery ?? User::query()->where('role', User::ROLE_TRAINEE)->whereNotNull('email_verified_at')
            ->whereIn('id', StudentEnrollment::open()->select('user_id')))
            ->orderBy('last_name')->orderBy('first_name')->get();
        $ids = $users->pluck('id');

        $entries = DutyEntry::with('hostClient:id,name')->whereIn('user_id', $ids)->whereDate('duty_date', $date)
            ->orderBy('am_in')->orderBy('pm_in')->get()->groupBy('user_id');
        $sections = StudentEnrollment::open()->with('section.course')->whereIn('user_id', $ids)->get()->keyBy('user_id');
        $placements = TraineePlacement::with('establishment:id,name')->whereNull('ended_at')->whereIn('user_id', $ids)->get()->keyBy('user_id');

        $rows = $users->map(function (User $u) use ($entries, $placements, $sections) {
            $p = $placements->get($u->id);

            return [
                'user_id' => $u->id,
                'student_id' => $u->student_id,
                'name' => $u->fullName(),
                'section' => $sections->get($u->id)?->section?->code(),
                'placement' => $p?->establishment?->name,
                'entries' => ($entries[$u->id] ?? collect())->map(fn (DutyEntry $e) => [
                    'id' => $e->id, 'date' => $e->duty_date->format('Y-m-d'), 'category' => $e->category, 'status' => $e->status,
                    'host' => $e->hostClient?->name ?? $p?->establishment?->name,
                    'amIn' => $e->am_in, 'amOut' => $e->am_out, 'pmIn' => $e->pm_in, 'pmOut' => $e->pm_out, 'evIn' => $e->ev_in, 'evOut' => $e->ev_out,
                    'hours' => $e->hours, 'task' => $e->task,
                ])->values(),
            ];
        })->values();

        return ['date' => $date, 'server_time' => $now->format('H:i:s'), 'timezone' => $tz, 'trainees' => $rows];
    }
}
