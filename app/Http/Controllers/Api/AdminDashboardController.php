<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;

/** Admin home. Account counts plus school-wide OJT KPIs (KpiService). */
class AdminDashboardController extends Controller
{
    public function show(\App\Services\Academic\KpiService $kpis): JsonResponse
    {
        $byRole = User::query()
            ->selectRaw('role, count(*) as total')
            ->groupBy('role')
            ->pluck('total', 'role');

        return response()->json([
            'kpis' => $kpis->admin(),
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
