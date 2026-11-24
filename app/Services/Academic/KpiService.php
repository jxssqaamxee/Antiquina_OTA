<?php

namespace App\Services\Academic;

use App\Models\CoordinatorAssignment;
use App\Models\DutyEntry;
use App\Models\StudentEnrollment;
use App\Models\TraineePlacement;
use App\Models\User;

/**
 * Role dashboards' KPI numbers. Same rule as ReportService: verified hours = APPROVED entries only.
 * Admin sees every open enrollment; a Coordinator is always limited to their own section (passed in by
 * CoordinatorAccessService, never read from the request).
 */
class KpiService
{
    public function __construct(private ReportService $reports) {}

    /** @param int|null $sectionId null = whole school (Admin only) */
    public function trainees(?int $sectionId = null): array
    {
        $rows = $this->reports->trainees($sectionId);
        $ids = $rows->pluck('user_id');
        $total = $rows->count();

        $placed = TraineePlacement::whereNull('ended_at')->whereIn('user_id', $ids)->distinct()->count('user_id');
        $waiting = DutyEntry::whereIn('user_id', $ids)->where('status', DutyEntry::SUBMITTED)->count();
        $rejected = DutyEntry::whereIn('user_id', $ids)->where('status', DutyEntry::REJECTED)->count();

        return [
            'trainees' => $total,
            'verified_hours' => round((float) $rows->sum('verified'), 1),
            'required_hours' => (int) $rows->sum('required'),
            'avg_percent' => $total ? round((float) $rows->avg('percent'), 1) : 0,
            'completed' => $rows->where('percent', '>=', 100)->count(),
            'not_started' => $rows->where('verified', '<=', 0)->count(),
            'awaiting_review' => $waiting,
            'rejected_entries' => $rejected,
            'placed' => $placed,
            'unplaced' => max(0, $total - $placed),
        ];
    }

    public function admin(): array
    {
        $enr = StudentEnrollment::open();

        return $this->trainees(null) + [
            'unassigned' => (clone $enr)->whereNull('section_id')->count(),
            'coordinators_unassigned' => User::where('role', User::ROLE_COORDINATOR)->where('is_active', true)
                ->whereNotIn('id', CoordinatorAssignment::open()->select('coordinator_id'))->count(),
        ];
    }
}
