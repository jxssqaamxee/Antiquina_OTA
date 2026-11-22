<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Academic\DutyEntryApprovalService;
use App\Services\Academic\TrainingHourService;
use App\Support\Logbook\LogbookStore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Trainee actions (role:trainee). Draft content still travels only through /api/sync. */
class LogbookReviewController extends Controller
{
    public function submit(Request $request, string $entryUid, DutyEntryApprovalService $svc, LogbookStore $store): JsonResponse
    {
        $svc->submit($request->user(), $entryUid);

        return response()->json(['ok' => true] + $store->currentLogbook($request->user()));
    }

    public function hours(Request $request, TrainingHourService $hours): JsonResponse
    {
        return response()->json(['hours' => $hours->summary($request->user())]);
    }
}
