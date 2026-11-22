<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TrainingHourException;
use App\Models\User;
use App\Services\Academic\TrainingHourService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Admin-only (role:admin): required-hours exceptions. */
class AdminTrainingController extends Controller
{
    public function show(User $user, TrainingHourService $hours): JsonResponse
    {
        abort_unless($user->isTrainee(), 404);

        return response()->json([
            'hours' => $hours->summary($user),
            'exceptions' => TrainingHourException::where('user_id', $user->id)->orderByDesc('id')->get(),
        ]);
    }

    public function setException(Request $request, User $user, TrainingHourService $hours): JsonResponse
    {
        abort_unless($user->isTrainee(), 404);
        $data = $request->validate(['hours' => ['required', 'integer', 'between:1,2000'], 'reason' => ['required', 'string', 'min:5', 'max:500']]);
        $row = $hours->setException($request->user(), $user, (int) $data['hours'], trim($data['reason']));

        return response()->json(['exception' => $row, 'hours' => $hours->summary($user)], 201);
    }
}
