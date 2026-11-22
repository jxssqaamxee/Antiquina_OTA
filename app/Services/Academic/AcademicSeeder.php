<?php

namespace App\Services\Academic;

use App\Models\AcademicYear;
use App\Models\Course;
use App\Models\StudentEnrollment;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/** Idempotent: seeds courses from config/occ.php, one current academic year, and backfills enrollments. */
class AcademicSeeder
{
    public static function codeFor(string $name): string
    {
        if (str_contains($name, 'Marketing')) {
            return 'BSBA-MM';
        }
        if (str_contains($name, 'Financial')) {
            return 'BSBA-FM';
        }
        $head = trim(explode('—', $name)[0]);

        return strtoupper(substr(preg_replace('/[^A-Za-z0-9-]/', '', $head), 0, 16)) ?: 'COURSE';
    }

    public static function currentYearName(): string
    {
        $y = (int) now()->format('Y');

        return ((int) now()->format('n') >= 8) ? "{$y}-".($y + 1) : ($y - 1)."-{$y}";
    }

    public static function run(): void
    {
        DB::transaction(function () {
            foreach (config('occ.courses', []) as $group) {
                foreach ($group['courses'] as $name) {
                    Course::firstOrCreate(['name' => $name], ['code' => self::codeFor($name), 'college' => $group['college']]);
                }
            }
            if (! AcademicYear::where('is_current', true)->exists()) {
                AcademicYear::firstOrCreate(['name' => self::currentYearName()])->update(['is_current' => true]);
            }
            $year = AcademicYear::where('is_current', true)->first();
            $courses = Course::pluck('id', 'name');

            User::where('role', User::ROLE_TRAINEE)
                ->whereDoesntHave('enrollments')
                ->orderBy('id')
                ->each(function (User $u) use ($courses, $year) {
                    $courseId = $courses[$u->course] ?? null;
                    if (! $courseId) {
                        Log::warning('academic backfill: unknown course string, user left unmapped', ['user_id' => $u->id]);

                        return;
                    }
                    StudentEnrollment::create([
                        'user_id' => $u->id, 'course_id' => $courseId, 'academic_year_id' => $year->id,
                        'status' => StudentEnrollment::PENDING, 'started_at' => now(),
                    ]);
                });
        });
    }
}
