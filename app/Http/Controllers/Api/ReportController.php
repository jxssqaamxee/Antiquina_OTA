<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Services\Academic\ActivityLogService;
use App\Services\Academic\AnnouncementService;
use App\Services\Academic\CoordinatorAccessService;
use App\Services\Academic\ReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/** Phase 7: reports + announcements for Admin (global) and Coordinator (own section only; filters are ignored). */
class ReportController extends Controller
{
    public function __construct(private CoordinatorAccessService $scope, private ReportService $reports) {}

    /**
     * [sectionId, courseId, yearId] the caller may see. A Coordinator is pinned to their own section (a section already
     * belongs to one year); request filters cannot widen it. The Administrator sees ONE school year: the one asked for,
     * else the current one, so a new year starts empty and an old year stays readable.
     */
    private function limits(Request $r): array
    {
        if ($r->user()->isCoordinator()) {
            return [$this->scope->section($r->user())?->id ?? 0, null, null];
        }
        $year = $r->filled('academic_year_id') ? $r->integer('academic_year_id') : \App\Models\AcademicYear::current()?->id;

        return [$r->filled('section_id') ? $r->integer('section_id') : null, $r->filled('course_id') ? $r->integer('course_id') : null, $year];
    }

    public function trainees(Request $request): JsonResponse
    {
        [$s, $c, $y] = $this->limits($request);
        $rows = $this->reports->trainees($s, $c, $y);

        return response()->json(['rows' => $rows->values(), 'totals' => [
            'trainees' => $rows->count(), 'verified' => round($rows->sum('verified'), 2), 'pending' => round($rows->sum('pending'), 2),
            'completed' => $rows->filter(fn ($r) => $r['verified'] >= $r['required'])->count(),
        ]]);
    }

    public function export(Request $request, ActivityLogService $log): Response
    {
        [$s, $c, $y] = $this->limits($request);
        $rows = $this->reports->trainees($s, $c, $y);
        $log->record($request->user(), 'report.exported', 'report', null, $s, ['rows' => $rows->count()]);

        return response($this->reports->csv($rows), 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="occdl-hours-report.csv"',
            'Cache-Control' => 'no-store',
        ]);
    }

    public function announcements(Request $request): JsonResponse
    {
        $q = Announcement::orderByDesc('id')->limit(50);
        if ($request->user()->isCoordinator()) {
            $q->where('author_id', $request->user()->id);
        }

        return response()->json(['announcements' => $q->get(['id', 'title', 'body', 'audience_type', 'course_id', 'section_id', 'recipient_count', 'created_at'])]);
    }

    public function publish(Request $request, AnnouncementService $svc): JsonResponse
    {
        $data = $request->validate([
            'audience_type' => ['required', 'in:all,course,section'],
            'course_id' => ['required_if:audience_type,course', 'nullable', 'integer', 'exists:courses,id'],
            'section_id' => ['required_if:audience_type,section', 'nullable', 'integer', 'exists:sections,id'],
            'title' => ['required', 'string', 'min:3', 'max:160'],
            'body' => ['required', 'string', 'min:3', 'max:500'],
        ]);

        return response()->json(['announcement' => $svc->publish($request->user(), $data)], 201);
    }
}
