<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\HostEstablishment;
use App\Models\TraineePlacement;
use App\Models\User;
use App\Services\Academic\CoordinatorAccessService;
use App\Services\Academic\PlacementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Shared by role:admin (any trainee, global catalog) and role:coordinator (own section's trainees,
 * global establishments + ones they created for their section). Scope for coordinators always goes through CoordinatorAccessService.
 */
class PlacementController extends Controller
{
    public function __construct(private CoordinatorAccessService $scope, private PlacementService $svc) {}

    private function sectionOf(Request $r): ?int
    {
        return $r->user()->isCoordinator() ? $this->scope->section($r->user())?->id : null;
    }

    public function establishments(Request $request): JsonResponse
    {
        $q = HostEstablishment::where('is_active', true)->orderBy('name');
        if ($request->user()->isCoordinator()) {
            $sid = $this->sectionOf($request);
            $q->where(fn ($w) => $w->whereNull('section_id')->orWhere('section_id', $sid ?? 0));
        }

        return response()->json(['establishments' => $q->get()]);
    }

    public function storeEstablishment(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:160'], 'type' => ['required', 'in:public,private,custom'],
            'address' => ['nullable', 'string', 'max:255'], 'supervisor_name' => ['nullable', 'string', 'max:160'],
        ]);
        $sid = $this->sectionOf($request);
        abort_if($request->user()->isCoordinator() && ! $sid, 422, 'You have no section yet.');
        $e = HostEstablishment::create($data + ['section_id' => $sid, 'created_by' => $request->user()->id]);

        return response()->json(['establishment' => $e], 201);
    }

    public function place(Request $request, string $user): JsonResponse
    {
        $trainee = $request->user()->isCoordinator()
            ? $this->scope->findTraineeOrFail($request->user(), $user)
            : User::where('role', User::ROLE_TRAINEE)->findOrFail($user);

        $data = $request->validate([
            'establishment_id' => ['required', 'integer', 'exists:host_establishments,id'],
            'days' => ['required', 'array', 'min:1', 'max:7'], 'days.*' => ['integer', 'between:1,7'],
            'time_in' => ['required', 'date_format:H:i'], 'time_out' => ['required', 'date_format:H:i', 'after:time_in'],
            'supervisor_name' => ['nullable', 'string', 'max:160'], 'starts_on' => ['nullable', 'date'],
        ]);
        $est = HostEstablishment::where('is_active', true)->findOrFail($data['establishment_id']);
        if ($request->user()->isCoordinator() && $est->section_id !== null && $est->section_id !== $this->sectionOf($request)) {
            abort(404);
        }
        $p = $this->svc->place($request->user(), $trainee, $est, $data['days'], $data['time_in'], $data['time_out'], $data['supervisor_name'] ?? null, $data['starts_on'] ?? null);

        return response()->json(['placement' => $p->load('establishment')], 201);
    }

    public function end(Request $request, string $id): JsonResponse
    {
        $p = TraineePlacement::findOrFail($id);
        if ($request->user()->isCoordinator()) {
            $this->scope->findTraineeOrFail($request->user(), $p->user_id); // 404 outside the section
        }
        $this->svc->end($request->user(), $p);

        return response()->json(['ok' => true]);
    }
}
