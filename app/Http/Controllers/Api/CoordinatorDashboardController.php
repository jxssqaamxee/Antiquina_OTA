<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Academic\CoordinatorAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Coordinator home + trainee list. Every query goes through CoordinatorAccessService (own section only). */
class CoordinatorDashboardController extends Controller
{
    public function __construct(private CoordinatorAccessService $scope) {}

    public function show(Request $request, \App\Services\Academic\KpiService $kpis): JsonResponse
    {
        $section = $this->scope->section($request->user());

        return response()->json([
            'section' => $section ? $section->toClient() + [
                'academic_year' => $section->academicYear?->name,
                // false = this section belongs to an earlier school year (the admin has not given the coordinator a new one yet)
                'is_current_year' => $section->academic_year_id === \App\Models\AcademicYear::current()?->id,
            ] : null,
            'kpis' => $section ? $kpis->trainees($section->id) : null,
            'trainees' => $section ? $this->scope->traineesQuery($request->user())->count() : 0,
            'message' => $section ? null : 'No section has been assigned to you yet. Please contact an administrator.',
        ]);
    }

    public function trainees(Request $request): JsonResponse
    {
        $q = $this->scope->traineesQuery($request->user());
        $pending = \App\Models\DutyEntry::whereIn('user_id', (clone $q)->select('users.id'))->where('status', \App\Models\DutyEntry::SUBMITTED)
            ->groupBy('user_id')->selectRaw('user_id, count(*) as n')->pluck('n', 'user_id');

        return response()->json(['trainees' => $q->orderBy('last_name')->get()
            ->map(fn ($u) => ['id' => $u->id, 'student_id' => $u->student_id, 'name' => $u->fullName(), 'email' => $u->email, 'pending' => (int) ($pending[$u->id] ?? 0)])]);
    }

    public function trainee(Request $request, string $id): JsonResponse
    {
        $u = $this->scope->findTraineeOrFail($request->user(), $id); // 404 outside the section

        return response()->json(['trainee' => ['id' => $u->id, 'student_id' => $u->student_id, 'name' => $u->fullName(), 'email' => $u->email, 'course' => $u->course]]);
    }

    /** Trail limited to this coordinator's own section. */
    public function activity(Request $request, \App\Services\Academic\ActivityLogService $log): JsonResponse
    {
        $section = $this->scope->section($request->user());

        return response()->json($section ? $log->feed(\App\Models\ActivityLog::where('section_id', $section->id), $request->query('action')) : []);
    }

    /** Live duty board for the coordinator's own section only (empty when no section is assigned). */
    public function live(Request $request, \App\Services\Academic\LiveDutyService $live): JsonResponse
    {
        return response()->json($live->today($this->scope->traineesQuery($request->user())));
    }
}
