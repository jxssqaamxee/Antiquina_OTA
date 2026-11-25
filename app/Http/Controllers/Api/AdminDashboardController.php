<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AcademicYear;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Admin home. Account counts plus school-wide OJT KPIs (KpiService). */
class AdminDashboardController extends Controller
{
    public function show(Request $request, \App\Services\Academic\KpiService $kpis): JsonResponse
    {
        // The numbers follow ONE school year: the one asked for, else the current one (a new year starts empty).
        $year = $request->filled('academic_year_id') ? AcademicYear::find($request->integer('academic_year_id')) : AcademicYear::current();
        $byRole = User::query()
            ->selectRaw('role, count(*) as total')
            ->groupBy('role')
            ->pluck('total', 'role');

        return response()->json([
            'academic_year' => $year, 'kpis' => $kpis->admin($year?->id),
            'accounts' => [
                'admins' => (int) ($byRole[User::ROLE_ADMIN] ?? 0),
                'coordinators' => (int) ($byRole[User::ROLE_COORDINATOR] ?? 0),
                'trainees' => User::where('role', User::ROLE_TRAINEE)->whereNotNull('email_verified_at')->count(),
                'unverified' => User::where('role', User::ROLE_TRAINEE)->whereNull('email_verified_at')->count(),
                'deactivated' => User::where('is_active', false)->count(),
            ],
        ]);
    }

    /** Live duty board: today's entries of every enrolled trainee (the clock part runs in the browser). */
    public function live(\App\Services\Academic\LiveDutyService $live): JsonResponse
    {
        return response()->json($live->today());
    }
}
