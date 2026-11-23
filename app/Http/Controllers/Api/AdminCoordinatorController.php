<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CoordinatorAssignment;
use App\Models\Section;
use App\Models\User;
use App\Services\Academic\ActivityLogService;
use App\Services\Academic\CoordinatorAssignmentService;
use App\Support\Formats;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rules\Password;

/** Admin-only (role:admin): Coordinator accounts and their section assignment. */
class AdminCoordinatorController extends Controller
{
    private function present(User $u): array
    {
        $a = CoordinatorAssignment::open()->where('coordinator_id', $u->id)->with('section.course')->first();

        return [
            'id' => $u->id, 'admin_id' => $u->admin_id, 'name' => $u->fullName(), 'email' => $u->email,
            'is_active' => $u->isActive(),
            'section' => $a?->section ? ['id' => $a->section->id, 'code' => $a->section->code()] : null,
        ];
    }

    public function index(): JsonResponse
    {
        return response()->json(['coordinators' => User::where('role', User::ROLE_COORDINATOR)->orderBy('last_name')->get()->map(fn ($u) => $this->present($u))]);
    }

    public function store(Request $request, ActivityLogService $log): JsonResponse
    {
        $request->merge(['admin_id' => strtoupper(trim((string) $request->input('admin_id')))]);
        $data = $request->validate([
            'admin_id' => ['required', 'regex:'.Formats::ADMIN_ID, 'unique:users,admin_id'],
            'first_name' => ['required', 'string', 'max:80', 'regex:'.Formats::NAME],
            'last_name' => ['required', 'string', 'max:80', 'regex:'.Formats::NAME],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'max:100', Password::defaults()],
        ]);
        $u = new User();
        $u->forceFill([ // role / admin_id are not mass-assignable on purpose
            'role' => User::ROLE_COORDINATOR, 'admin_id' => strtoupper($data['admin_id']), 'student_id' => null, 'course' => null,
            'first_name' => Formats::titleCase($data['first_name']), 'last_name' => Formats::titleCase($data['last_name']),
            'email' => strtolower($data['email']), 'password' => $data['password'], 'email_verified_at' => now(),
        ])->save();
        $log->record($request->user(), 'coordinator.created', 'coordinator', $u->id);

        return response()->json(['coordinator' => $this->present($u)], 201);
    }

    public function assign(Request $request, User $coordinator, CoordinatorAssignmentService $svc): JsonResponse
    {
        abort_unless($coordinator->isCoordinator(), 404);
        $data = $request->validate(['section_id' => ['required', 'integer', 'exists:sections,id']]);
        $svc->assign($request->user(), $coordinator, Section::findOrFail($data['section_id']));

        return response()->json(['coordinator' => $this->present($coordinator)]);
    }

    public function unassign(Request $request, User $coordinator, CoordinatorAssignmentService $svc): JsonResponse
    {
        abort_unless($coordinator->isCoordinator(), 404);
        $svc->unassign($request->user(), $coordinator);

        return response()->json(['coordinator' => $this->present($coordinator)]);
    }

    public function activity(Request $request, ActivityLogService $log): JsonResponse
    {
        return response()->json($log->feed(\App\Models\ActivityLog::query(), $request->query('action')));
    }
}
