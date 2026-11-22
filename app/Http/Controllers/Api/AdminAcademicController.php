<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AcademicYear;
use App\Models\Course;
use App\Models\Section;
use App\Models\StudentEnrollment;
use App\Services\Academic\EnrollmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** Admin-only (route group role:admin): courses, academic years, sections and enrollments. */
class AdminAcademicController extends Controller
{
    public function courses(): JsonResponse
    {
        return response()->json(['courses' => Course::orderBy('code')->get()]);
    }

    public function years(): JsonResponse
    {
        return response()->json(['academic_years' => AcademicYear::orderByDesc('name')->get()]);
    }

    public function storeYear(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'regex:/^\d{4}-\d{4}$/', 'unique:academic_years,name'],
            'is_current' => ['sometimes', 'boolean'],
        ]);
        $year = DB::transaction(function () use ($data) {
            if (! empty($data['is_current'])) {
                AcademicYear::where('is_current', true)->update(['is_current' => false]);
            }

            return AcademicYear::create(['name' => $data['name'], 'is_current' => (bool) ($data['is_current'] ?? false)]);
        });

        return response()->json(['academic_year' => $year], 201);
    }

    public function makeYearCurrent(AcademicYear $year): JsonResponse
    {
        DB::transaction(function () use ($year) {
            AcademicYear::where('is_current', true)->update(['is_current' => false]);
            $year->update(['is_current' => true]);
        });

        return response()->json(['academic_year' => $year->fresh()]);
    }

    public function sections(Request $request): JsonResponse
    {
        $q = Section::with('course')->orderBy('course_id')->orderBy('year_level')->orderBy('label');
        $yearId = $request->integer('academic_year_id') ?: AcademicYear::current()?->id;
        $q->where('academic_year_id', $yearId);
        foreach (['course_id', 'year_level'] as $f) {
            if ($request->filled($f)) {
                $q->where($f, $request->integer($f));
            }
        }

        return response()->json(['sections' => $q->get()->map(fn (Section $s) => $s->toClient() + [
            'students' => $s->enrollments()->open()->count(),
        ])]);
    }

    /** Creates `count` sections (A, B, C ...) for a course + year level; existing labels are kept. */
    public function storeSections(Request $request): JsonResponse
    {
        $data = $request->validate([
            'course_id' => ['required', 'integer', 'exists:courses,id'],
            'year_level' => ['required', 'integer', 'between:1,6'],
            'count' => ['required', 'integer', 'between:1,12'],
            'academic_year_id' => ['nullable', 'integer', 'exists:academic_years,id'],
        ]);
        $yearId = $data['academic_year_id'] ?? AcademicYear::current()?->id;
        abort_if(! $yearId, 422, 'Create an academic year first.');

        $created = DB::transaction(function () use ($data, $yearId) {
            $out = [];
            foreach (range(0, $data['count'] - 1) as $i) {
                $s = Section::firstOrCreate([
                    'course_id' => $data['course_id'], 'academic_year_id' => $yearId,
                    'year_level' => $data['year_level'], 'label' => chr(65 + $i),
                ]);
                $out[] = $s->load('course')->toClient();
            }

            return $out;
        });

        return response()->json(['sections' => $created], 201);
    }

    public function showSection(Section $section): JsonResponse
    {
        $students = $section->enrollments()->open()->with('user')->get()
            ->sortBy(fn ($e) => $e->user->last_name)->values()
            ->map(fn ($e) => ['enrollment_id' => $e->id, 'status' => $e->status] + [
                'user_id' => $e->user->id, 'student_id' => $e->user->student_id, 'name' => $e->user->fullName(),
            ]);

        return response()->json(['section' => $section->load('course')->toClient(), 'students' => $students]);
    }

    public function enrollments(Request $request): JsonResponse
    {
        $q = StudentEnrollment::open()->with(['course', 'section.course', 'user'])->orderByDesc('id');
        foreach (['course_id', 'section_id', 'year_level'] as $f) {
            if ($request->filled($f)) {
                $q->where($f, $request->integer($f));
            }
        }
        if ($request->filled('status') && in_array($request->input('status'), StudentEnrollment::STATUSES, true)) {
            $q->where('status', $request->input('status'));
        }

        return response()->json($q->paginate(50)->through(fn ($e) => $e->toClient()));
    }

    /** Students with no section yet (self-registered without a roster placement). */
    public function unassigned(): JsonResponse
    {
        $rows = StudentEnrollment::open()->where('status', StudentEnrollment::PENDING)
            ->with(['course', 'section.course', 'user'])->orderBy('id')->get();

        return response()->json(['enrollments' => $rows->map->toClient(), 'total' => $rows->count()]);
    }

    public function assign(Request $request, StudentEnrollment $enrollment, EnrollmentService $svc): JsonResponse
    {
        $data = $request->validate(['section_id' => ['required', 'integer', Rule::exists('sections', 'id')]]);
        $e = $svc->assignSection($enrollment, Section::findOrFail($data['section_id']));

        return response()->json(['enrollment' => $e->toClient()]);
    }
}
