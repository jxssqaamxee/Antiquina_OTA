<?php

namespace App\Services\Academic;

use App\Models\DutyEntry;
use App\Models\TrainingHourException;
use App\Models\User;
use App\Models\UserSetting;
use App\Support\Logbook\LogbookRules;
use Illuminate\Support\Facades\DB;

class TrainingHourService
{
    public function __construct(private ActivityLogService $log, private ServerNotifier $notify) {}

    /** Required OJT hours: the latest Admin exception, else the default. The client's own value is never used. */
    public function requiredHours(User $user): int
    {
        $latest = TrainingHourException::where('user_id', $user->id)->orderByDesc('id')->value('new_hours');

        return $latest !== null ? (int) $latest : LogbookRules::DEFAULT_TARGET_HOURS;
    }

    /** Only APPROVED entries count as verified hours. */
    public function summary(User $user): array
    {
        $by = DutyEntry::where('user_id', $user->id)->selectRaw('status, sum(hours) as logged, sum(verified_hours) as verified')->groupBy('status')->get()->keyBy('status');
        $logged = fn (string ...$st) => round((float) collect($st)->sum(fn ($x) => $by[$x]->logged ?? 0), 2);

        return [
            'required' => $this->requiredHours($user),
            'verified' => round((float) ($by[DutyEntry::APPROVED]->verified ?? 0), 2),
            'pending' => $logged(DutyEntry::SUBMITTED),
            'draft' => $logged(DutyEntry::DRAFT, DutyEntry::REJECTED),
            'total' => $logged(DutyEntry::DRAFT, DutyEntry::SUBMITTED, DutyEntry::APPROVED, DutyEntry::REJECTED),
        ];
    }

    /** Admin exception: keeps previous/new hours, reason, admin and time. */
    public function setException(User $admin, User $trainee, int $hours, string $reason): TrainingHourException
    {
        return DB::transaction(function () use ($admin, $trainee, $hours, $reason) {
            $previous = $this->requiredHours($trainee);
            $row = TrainingHourException::create([
                'user_id' => $trainee->id, 'previous_hours' => $previous, 'new_hours' => $hours,
                'reason' => $reason, 'admin_id' => $admin->id, 'created_at' => now(),
            ]);
            $sectionId = \App\Models\StudentEnrollment::open()->where('user_id', $trainee->id)->value('section_id');
            $this->log->record($admin, 'hours.exception', 'trainee', $trainee->id, $sectionId, ['previous' => $previous, 'new' => $hours, 'reason' => $reason]);
            // The logbook document now carries a different target: stale devices must reload, not overwrite.
            UserSetting::firstOrCreate(['user_id' => $trainee->id]);
            UserSetting::where('user_id', $trainee->id)->increment('logbook_revision');
            $this->notify->notify($trainee, 'Required hours updated', "Your required OJT hours are now {$hours}h.");

            return $row;
        });
    }
}
