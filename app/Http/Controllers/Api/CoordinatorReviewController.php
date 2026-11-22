<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DutyEntry;
use App\Services\Academic\CoordinatorAccessService;
use App\Services\Academic\DutyEntryApprovalService;
use App\Services\Academic\TrainingHourService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Coordinator review of submitted entries. Everything is resolved through CoordinatorAccessService (own section only; else 404). */
class CoordinatorReviewController extends Controller
{
    public function __construct(private CoordinatorAccessService $scope) {}

    private function present(DutyEntry $e): array
    {
        return [
            'id' => $e->id, 'trainee_id' => $e->user_id, 'date' => $e->duty_date->format('Y-m-d'), 'category' => $e->category,
            'am_in' => $e->am_in, 'am_out' => $e->am_out, 'pm_in' => $e->pm_in, 'pm_out' => $e->pm_out, 'ev_in' => $e->ev_in, 'ev_out' => $e->ev_out,
            'hours' => $e->hours, 'task' => $e->task, 'status' => $e->status, 'legacy' => $e->legacy,
            'verified_hours' => $e->verified_hours, 'review_reason' => $e->review_reason, 'submitted_at' => $e->submitted_at,
        ];
    }

    public function pending(Request $request): JsonResponse
    {
        $rows = DutyEntry::whereIn('user_id', $this->scope->traineesQuery($request->user())->select('users.id'))
            ->where('status', DutyEntry::SUBMITTED)->orderBy('submitted_at')->limit(200)->get();

        return response()->json(['entries' => $rows->map(fn ($e) => $this->present($e))]);
    }

    public function traineeEntries(Request $request, string $id): JsonResponse
    {
        $trainee = $this->scope->findTraineeOrFail($request->user(), $id);
        $rows = DutyEntry::where('user_id', $trainee->id)->orderByDesc('duty_date')->limit(500)->get();

        return response()->json([
            'entries' => $rows->map(fn ($e) => $this->present($e)),
            'hours' => app(TrainingHourService::class)->summary($trainee),
        ]);
    }

    public function approve(Request $request, string $id, DutyEntryApprovalService $svc): JsonResponse
    {
        $data = $request->validate(['verified_hours' => ['nullable', 'numeric', 'min:0', 'max:24']]);
        $e = $svc->approve($request->user(), $this->scope->findEntryOrFail($request->user(), $id), isset($data['verified_hours']) ? (float) $data['verified_hours'] : null);

        return response()->json(['entry' => $this->present($e)]);
    }

    public function reject(Request $request, string $id, DutyEntryApprovalService $svc): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:500']]);
        $e = $svc->reject($request->user(), $this->scope->findEntryOrFail($request->user(), $id), trim($data['reason']));

        return response()->json(['entry' => $this->present($e)]);
    }
}
