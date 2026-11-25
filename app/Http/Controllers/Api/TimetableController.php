<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Academic\CoordinatorAccessService;
use App\Services\Academic\TimetableService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Weekly duty timetable. Three doors, one builder:
 *  - trainee: only ever their own account (no id is accepted),
 *  - coordinator: own section only (404 otherwise, like every coordinator route),
 *  - admin: any trainee account (404 for staff accounts).
 * Read-only. ?week=YYYY-MM-DD is any date inside the week wanted (default: this week).
 */
class TimetableController extends Controller
{
    public function __construct(private TimetableService $timetable, private CoordinatorAccessService $scope) {}

    private function week(Request $request): ?string
    {
        return $request->validate(['week' => ['nullable', 'date_format:Y-m-d']])['week'] ?? null;
    }

    public function mine(Request $request): JsonResponse
    {
        return response()->json($this->timetable->week($request->user(), $this->week($request)));
    }

    public function coordinator(Request $request, string $id): JsonResponse
    {
        $trainee = $this->scope->findTraineeOrFail($request->user(), $id);

        return response()->json($this->timetable->week($trainee, $this->week($request)));
    }

    public function admin(Request $request, User $user): JsonResponse
    {
        abort_unless($user->isTrainee(), 404);

        return response()->json($this->timetable->week($user, $this->week($request)));
    }
}
