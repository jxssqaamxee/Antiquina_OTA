<?php

namespace App\Services\Academic;

use App\Models\AcademicYear;
use App\Models\EnrollmentProgression;
use App\Models\Section;
use App\Models\StudentEnrollment;
use App\Models\CoordinatorAssignment;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class EnrollmentProgressionService
{
    public const FINAL_YEAR = 4;

    public function __construct(private ActivityLogService $log, private ServerNotifier $notify, private TrainingHourService $hours, private CoordinatorNotifier $coordNotify) {}

    /**
     * Dry run: nothing is written. Lists each student with an open enrollment that belongs to an earlier
     * academic year and what would normally happen. Students waiting for placement or already moved are left out.
     */
    public function prepare(AcademicYear $target): array
    {
        $rows = StudentEnrollment::open()->where('academic_year_id', '!=', $target->id)
            ->whereIn('status', [StudentEnrollment::ACTIVE, StudentEnrollment::REPEATING])
            ->whereNotNull('year_level')->with(['user', 'course', 'section.course', 'academicYear'])->orderBy('course_id')->orderBy('year_level')->get();

        return $rows->map(function (StudentEnrollment $e) {
            $kind = $e->status === StudentEnrollment::REPEATING ? 'repeat'
                : ($e->year_level >= self::FINAL_YEAR ? 'complete' : 'promote');

            // Hours are shown so the Admin can see who really finished before marking anyone as completed.
            $h = $this->hours->summary($e->user);

            return $e->toClient() + [
                'verified_hours' => $h['verified'], 'required_hours' => $h['required'], 'hours_met' => $h['verified'] >= $h['required'],
                'kind' => $kind,
                'next_year_level' => $kind === 'promote' ? $e->year_level + 1 : ($kind === 'repeat' ? $e->year_level : null),
            ];
        })->all();
    }

    /**
     * Applies Admin-confirmed decisions in ONE transaction.
     * $items: [{enrollment_id, kind: promote|repeat|complete, section_id?}] (section required unless complete).
     * Anything not listed stays exactly as it was. Re-confirming an already processed enrollment is skipped.
     */
    public function confirm(User $admin, AcademicYear $target, array $items): array
    {
        $done = 0;
        $skipped = 0;
        DB::transaction(function () use ($admin, $target, $items, &$done, &$skipped) {
            foreach ($items as $i => $item) {
                $e = StudentEnrollment::whereKey($item['enrollment_id'])->lockForUpdate()->first();
                if (! $e || $e->ended_at !== null || EnrollmentProgression::where('from_enrollment_id', $e->id)->exists()) {
                    $skipped++;

                    continue;
                }
                $kind = $item['kind'];
                $this->assertEligible($e, $target, $kind, $i);
                $new = null;
                if ($kind !== 'complete') {
                    $section = Section::find($item['section_id'] ?? 0);
                    $level = $kind === 'promote' ? $e->year_level + 1 : $e->year_level;
                    if (! $section || $section->course_id !== $e->course_id || $section->academic_year_id !== $target->id
                        || $section->year_level !== $level || ! $section->is_active) {
                        throw ValidationException::withMessages(["items.$i.section_id" => 'Choose an active section of the same course, in the target year, at the next year level.']);
                    }
                }
                // Close the old row first: the one-open-enrollment-per-student index would reject two open rows.
                $e->update(['ended_at' => now(), 'status' => $kind === 'repeat' ? StudentEnrollment::REPEATING : StudentEnrollment::COMPLETED]);
                if ($kind !== 'complete') {
                    $new = StudentEnrollment::create([
                        'user_id' => $e->user_id, 'course_id' => $e->course_id, 'academic_year_id' => $target->id,
                        'section_id' => $section->id, 'year_level' => $level, 'status' => StudentEnrollment::ACTIVE, 'started_at' => now(),
                    ]);
                }
                EnrollmentProgression::create([
                    'from_enrollment_id' => $e->id, 'to_enrollment_id' => $new?->id, 'target_academic_year_id' => $target->id,
                    'kind' => $kind, 'confirmed_by' => $admin->id, 'confirmed_at' => now(),
                ]);
                $this->log->record($admin, "enrollment.{$kind}", 'enrollment', $e->id, $new?->section_id ?? $e->section_id);
                $this->tell($e->user, $kind, $new);
                $done++;
            }
        });

        return ['confirmed' => $done, 'skipped' => $skipped];
    }

    /**
     * Server-side twin of prepare(): the same rows, and only the decisions that make sense for them. A forged
     * or stale request can name any enrollment id, so the screen's filtering cannot be trusted. Any violation
     * aborts the whole batch (nothing is written).
     */
    private function assertEligible(StudentEnrollment $e, AcademicYear $target, string $kind, int|string $i): void
    {
        $listed = $e->academic_year_id !== $target->id
            && in_array($e->status, [StudentEnrollment::ACTIVE, StudentEnrollment::REPEATING], true)
            && $e->year_level !== null;
        $sensible = match ($kind) {
            'promote' => $e->status === StudentEnrollment::ACTIVE && $e->year_level < self::FINAL_YEAR,
            'repeat' => true,
            'complete' => $e->year_level >= self::FINAL_YEAR,
            default => false,
        };
        if (! $listed || ! $sensible) {
            throw ValidationException::withMessages(["items.$i.enrollment_id" => 'This enrollment cannot be moved that way (it is not in the rollover list, or the decision does not fit its year level / status).']);
        }
    }

    /** Admin-only course/section transfer. The previous enrollment is kept, closed as `transferred`. */
    public function transfer(User $admin, StudentEnrollment $enrollment, Section $to, ?string $reason): StudentEnrollment
    {
        return DB::transaction(function () use ($admin, $enrollment, $to, $reason) {
            $e = StudentEnrollment::whereKey($enrollment->id)->lockForUpdate()->firstOrFail();
            if ($e->ended_at !== null) {
                throw ValidationException::withMessages(['enrollment' => 'Only a current enrollment can be transferred.']);
            }
            if (! $to->is_active || $to->id === $e->section_id) {
                throw ValidationException::withMessages(['section_id' => 'Choose a different, active section.']);
            }
            $e->update(['ended_at' => now(), 'status' => StudentEnrollment::TRANSFERRED]);
            $new = StudentEnrollment::create([
                'user_id' => $e->user_id, 'course_id' => $to->course_id, 'academic_year_id' => $to->academic_year_id,
                'section_id' => $to->id, 'year_level' => $to->year_level, 'status' => StudentEnrollment::ACTIVE, 'started_at' => now(),
            ]);
            if ($to->course_id !== $e->course_id) {
                User::whereKey($e->user_id)->update(['course' => $to->course()->value('name')]);
            }
            EnrollmentProgression::create([
                'from_enrollment_id' => $e->id, 'to_enrollment_id' => $new->id, 'target_academic_year_id' => $to->academic_year_id,
                'kind' => 'transfer', 'reason' => $reason, 'confirmed_by' => $admin->id, 'confirmed_at' => now(),
            ]);
            $this->log->record($admin, 'enrollment.transfer', 'enrollment', $e->id, $to->id, ['from_section' => $e->section_id, 'reason' => $reason]);
            $this->tell($e->user, 'transfer', $new);

            return $new->load(['course', 'section.course', 'user']);
        });
    }

    private function tell(User $student, string $kind, ?StudentEnrollment $new): void
    {
        $new?->load('section.course');
        $code = $new?->section?->code();
        $msg = match ($kind) {
            'complete' => 'You have completed your program. Your records are kept.',
            default => "You are now enrolled in {$code}.",
        };
        $this->notify->notify($student, $kind === 'transfer' ? 'Section transfer' : 'Enrollment update', $msg);
        // The coordinator of the NEW section (and only that one) gets the bell notice.
        $this->coordNotify->traineeJoined($student, $new);
        // Entries already waiting for review now belong to the new coordinator; the old one's notice is removed.
        $this->coordNotify->entriesChanged($student, true);
    }
}
