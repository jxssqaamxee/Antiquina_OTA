<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Controllers\MediaController;
use App\Models\User;
use App\Services\Academic\CoordinatorAccessService;
use App\Services\Academic\RegistrationApprovalService;
use App\Support\PrivateMedia;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Pending self-registrations. Shared by /api/admin/... (every pending trainee) and /api/coordinator/...
 * (only those whose roster row is in the coordinator's own section; anything else is a 404).
 */
class RegistrationApprovalController extends Controller
{
    public function __construct(private CoordinatorAccessService $scope, private RegistrationApprovalService $approvals) {}

    private function pending(Request $request): Builder
    {
        $user = $request->user();

        return $user->isAdmin()
            ? User::query()->where('role', User::ROLE_TRAINEE)->where('approval_status', User::APPROVAL_PENDING)
            : $this->scope->pendingRegistrationsQuery($user);
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json(['registrations' => $this->pending($request)->orderBy('created_at')->get()->map(fn (User $u) => [
            'id' => $u->id, 'student_id' => $u->student_id, 'name' => $u->fullName(), 'email' => $u->email, 'course' => $u->course,
            'email_verified' => $u->hasVerifiedEmail(), 'registered_at' => $u->created_at,
            // Version of the photo (null = no usable photo). The photo response is cached for a year per address
            // (MediaController::image), so the address must change whenever the picture does, as for /api/me/photo.
            // Today a pending account cannot change its photo; this keeps that true even if that rule ever changes.
            'photo_v' => $u->photoUrl() ? PrivateMedia::version($u->profile_photo) : null,
        ])->values()]);
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        $u = $this->approvals->approve($request->user(), $this->pending($request)->whereKey($id)->firstOrFail());

        return response()->json(['ok' => true, 'approval_status' => $u->approval_status]);
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        $request->validate(['reason' => ['nullable', 'string', 'max:200']]);
        $u = $this->approvals->reject($request->user(), $this->pending($request)->whereKey($id)->firstOrFail(), $request->input('reason'));

        return response()->json(['ok' => true, 'approval_status' => $u->approval_status]);
    }

    /** Photo of a pending registrant, so the reviewer can check who it is. Out of scope = 404. */
    public function registrationPhoto(Request $request, int $id)
    {
        return app(MediaController::class)->forUser($this->pending($request)->whereKey($id)->firstOrFail());
    }

    /** Photo of an enrolled trainee in the coordinator's own section. */
    public function traineePhoto(Request $request, int $id)
    {
        return app(MediaController::class)->forUser($this->scope->findTraineeOrFail($request->user(), $id));
    }

    /** Admin: any trainee's photo. */
    public function adminTraineePhoto(int $id)
    {
        return app(MediaController::class)->forUser(User::where('role', User::ROLE_TRAINEE)->findOrFail($id));
    }
}
