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
            'section' => $section ? $section->toClient() : null,
            'kpis' => $section ? $kpis->trainees($section->id) : null,
            'trainees' => $section ? $this->scope->traineesQuery($request->user())->count() : 0,
            'message' => $section ? null : 'No section has been assigned to you yet. Please contact an administrator.',
        ]);
    }

    public function trainees(Request $request): JsonResponse
    {
        return response()->json(['trainees' => $this->scope->traineesQuery($request->user())->orderBy('last_name')->get()
            ->map(fn ($u) => ['id' => $u->id, 'student_id' => $u->student_id, 'name' => $u->fullName(), 'email' => $u->email])]);
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
}
