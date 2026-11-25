<?php

namespace App\Services\Academic;

use App\Models\AcademicYear;
use App\Models\Course;
use App\Models\Section;
use App\Models\StudentEnrollment;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class EnrollmentService
{
    public function __construct(private CoordinatorNotifier $coordNotify) {}

    /**
     * Opens the first enrollment for a newly registered trainee. A roster row that names a section of the
     * same course in the current year gives an `active` enrollment; everything else is `pending_placement`.
     * Never throws: registration must not fail because academic data is missing.
     */
    public function enrollOnRegistration(User $user): ?StudentEnrollment
    {
        $course = Course::where('name', $user->course)->first();
        $year = AcademicYear::current();
        if (! $course || ! $year || $user->enrollments()->open()->exists()) {
            return null;
        }

        $section = null;
        $row = DB::table('enrolled_students')->where('student_id', $user->student_id)->first();
        if ($row && $row->section_id) {
            $section = Section::where('id', $row->section_id)
                ->where('course_id', $course->id)->where('academic_year_id', $year->id)->where('is_active', true)->first();
        }

        $enrollment = StudentEnrollment::create([
            'user_id' => $user->id, 'course_id' => $course->id, 'academic_year_id' => $year->id,
            'section_id' => $section?->id, 'year_level' => $section?->year_level,
            'status' => $section ? StudentEnrollment::ACTIVE : StudentEnrollment::PENDING,
            'started_at' => now(),
        ]);
        $this->coordNotify->traineeJoined($user, $enrollment); // no-op without a section

        return $enrollment;
    }

    /** Admin places a pending student in a section of the same course. Transactional; row is locked. */
    public function assignSection(StudentEnrollment $enrollment, Section $section): StudentEnrollment
    {
        $placed = DB::transaction(function () use ($enrollment, $section) {
            $e = StudentEnrollment::whereKey($enrollment->id)->lockForUpdate()->firstOrFail();
            if ($e->ended_at !== null || $e->status !== StudentEnrollment::PENDING) {
                throw ValidationException::withMessages(['section_id' => 'Only a student waiting for placement can be assigned here.']);
            }
            if ($section->course_id !== $e->course_id || ! $section->is_active) {
                throw ValidationException::withMessages(['section_id' => 'Choose an active section of the student’s course.']);
            }
            $e->update([
                'section_id' => $section->id, 'academic_year_id' => $section->academic_year_id,
                'year_level' => $section->year_level, 'status' => StudentEnrollment::ACTIVE,
            ]);

            return $e->fresh(['course', 'section.course', 'user']);
        });
        $this->coordNotify->traineeJoined($placed->user, $placed);

        return $placed;
    }
}
