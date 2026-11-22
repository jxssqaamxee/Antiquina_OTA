<?php

namespace App\Services\Academic;

use App\Models\DutyEntry;
use App\Models\StudentEnrollment;
use App\Models\TrainingHourException;
use App\Support\Logbook\LogbookRules;
use Illuminate\Support\Collection;

/** Hour reports. Verified hours = APPROVED entries only (same rule as TrainingHourService). */
class ReportService
{
    /** @return Collection<int,array<string,mixed>> one row per trainee with an open enrollment in scope */
    public function trainees(?int $sectionId = null, ?int $courseId = null): Collection
    {
        $q = StudentEnrollment::open()->with(['user', 'course', 'section.course'])->whereHas('user', fn ($u) => $u->where('role', 'trainee'));
        if ($sectionId !== null) {
            $q->where('section_id', $sectionId);
        }
        if ($courseId !== null) {
            $q->where('course_id', $courseId);
        }
        $enr = $q->get()->sortBy(fn ($e) => [$e->section?->code() ?? 'zzz', $e->user->last_name])->values();
        $ids = $enr->pluck('user_id');

        $by = DutyEntry::whereIn('user_id', $ids)->selectRaw('user_id, status, sum(hours) as logged, sum(verified_hours) as verified')
            ->groupBy('user_id', 'status')->get()->groupBy('user_id');
        $req = TrainingHourException::whereIn('user_id', $ids)->orderBy('id')->get()->groupBy('user_id')->map(fn ($g) => (int) $g->last()->new_hours);

        return $enr->map(function ($e) use ($by, $req) {
            $s = ($by[$e->user_id] ?? collect())->keyBy('status');
            $required = $req[$e->user_id] ?? LogbookRules::DEFAULT_TARGET_HOURS;
            $verified = round((float) ($s[DutyEntry::APPROVED]->verified ?? 0), 2);

            return [
                'user_id' => $e->user_id, 'student_id' => $e->user->student_id, 'name' => $e->user->fullName(),
                'course' => $e->course?->code, 'section' => $e->section?->code(), 'required' => $required, 'verified' => $verified,
                'pending' => round((float) ($s[DutyEntry::SUBMITTED]->logged ?? 0), 2),
                'percent' => $required > 0 ? round(min(100, $verified / $required * 100), 1) : 0,
            ];
        });
    }

    /** CSV text. Cells that a spreadsheet would run as a formula get a leading apostrophe. */
    public function csv(Collection $rows): string
    {
        $cols = ['student_id' => 'Student ID', 'name' => 'Name', 'course' => 'Course', 'section' => 'Section', 'required' => 'Required hours', 'verified' => 'Verified hours', 'pending' => 'Pending review', 'percent' => 'Percent complete'];
        $safe = fn ($v) => preg_match('/^[=+\-@\t\r]/', (string) $v) ? "'".$v : $v;
        $fh = fopen('php://temp', 'r+');
        fputcsv($fh, array_values($cols));
        foreach ($rows as $r) {
            fputcsv($fh, array_map(fn ($k) => $safe($r[$k] ?? ''), array_keys($cols)));
        }
        rewind($fh);

        return "\xEF\xBB\xBF".stream_get_contents($fh);
    }
}
