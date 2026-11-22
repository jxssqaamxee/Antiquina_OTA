<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AcademicYear;
use App\Models\Section;
use App\Models\StudentEnrollment;
use App\Services\Academic\EnrollmentProgressionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Admin-only (role:admin): academic-year rollover and transfers. */
class AdminProgressionController extends Controller
{
    public function prepare(AcademicYear $year, EnrollmentProgressionService $svc): JsonResponse
    {
        return response()->json(['target' => $year, 'proposals' => $svc->prepare($year)]); // writes nothing
    }

    public function confirm(Request $request, AcademicYear $year, EnrollmentProgressionService $svc): JsonResponse
    {
        $data = $request->validate([
            'items' => ['required', 'array', 'min:1', 'max:500'],
            'items.*.enrollment_id' => ['required', 'integer'],
            'items.*.kind' => ['required', 'in:promote,repeat,complete'],
            'items.*.section_id' => ['nullable', 'integer'],
        ]);

        return response()->json($svc->confirm($request->user(), $year, $data['items']));
    }

    public function transfer(Request $request, StudentEnrollment $enrollment, EnrollmentProgressionService $svc): JsonResponse
    {
        $data = $request->validate(['section_id' => ['required', 'integer', 'exists:sections,id'], 'reason' => ['nullable', 'string', 'max:255']]);
        $new = $svc->transfer($request->user(), $enrollment, Section::findOrFail($data['section_id']), $data['reason'] ?? null);

        return response()->json(['enrollment' => $new->toClient()]);
    }
}
