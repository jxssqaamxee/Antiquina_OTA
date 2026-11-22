<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;

/** Admin home. Phase 1 only reports account counts; later phases add enrollment and OJT statistics. */
class AdminDashboardController extends Controller
{
    public function show(): JsonResponse
    {
        $byRole = User::query()
            ->selectRaw('role, count(*) as total')
            ->groupBy('role')
            ->pluck('total', 'role');

        return response()->json([
            'accounts' => [
                'admins' => (int) ($byRole[User::ROLE_ADMIN] ?? 0),
                'coordinators' => (int) ($byRole[User::ROLE_COORDINATOR] ?? 0),
                'trainees' => (int) ($byRole[User::ROLE_TRAINEE] ?? 0),
                'deactivated' => User::where('is_active', false)->count(),
            ],
        ]);
    }
}
