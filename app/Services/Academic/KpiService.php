<?php

namespace App\Services\Academic;

use App\Models\CoordinatorAssignment;
use App\Models\DutyEntry;
use App\Models\StudentEnrollment;
use App\Models\TraineePlacement;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Role dashboards' KPI numbers. Same rule as ReportService: verified hours = APPROVED entries only.
 * Admin sees every open enrollment; a Coordinator is always limited to their own section (passed in by
 * CoordinatorAccessService, never read from the request).
 */
class KpiService
{
    public function __construct(private ReportService $reports) {}

    /** @param int|null $sectionId null = whole school (Admin only) */
    public function trainees(?int $sectionId = null, ?int $yearId = null): array
    {
        $rows = $this->reports->trainees($sectionId, null, $yearId);
        $ids = $rows->pluck('user_id');
        $total = $rows->count();

        $placed = TraineePlacement::whereNull('ended_at')->whereIn('user_id', $ids)->distinct()->count('user_id');
        $waiting = DutyEntry::whereIn('user_id', $ids)->where('status', DutyEntry::SUBMITTED)->count();
        $rejected = DutyEntry::whereIn('user_id', $ids)->where('status', DutyEntry::REJECTED)->count();

        return [
            'charts' => $this->charts($rows, $ids),
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

    public function admin(?int $yearId = null): array
    {
        $enr = $yearId ? StudentEnrollment::inYear($yearId) : StudentEnrollment::open();

        return $this->trainees(null, $yearId) + [
            'unassigned' => (clone $enr)->whereNull('section_id')->count(),
            'coordinators_unassigned' => User::where('role', User::ROLE_COORDINATOR)->where('is_active', true)
                ->whereNotIn('id', CoordinatorAssignment::open()->select('coordinator_id'))->count(),
        ];
    }

    /**
     * Chart series for the overview screens. Everything is bucketed in PHP so it behaves the same on
     * MySQL and SQLite. `weekly` = last 8 weeks (Mon-Sun) of verified (APPROVED) vs all logged hours.
     */
    private function charts(Collection $rows, Collection $ids): array
    {
        $start = now()->startOfWeek()->subWeeks(7);
        $weeks = collect(range(0, 7))->map(fn ($i) => $start->copy()->addWeeks($i));
        $entries = DutyEntry::whereIn('user_id', $ids)->where('duty_date', '>=', $start->toDateString())
            ->get(['duty_date', 'status', 'hours', 'verified_hours']);

        $weekly = $weeks->map(function ($w) use ($entries) {
            $in = $entries->filter(fn ($e) => $e->duty_date->betweenIncluded($w, $w->copy()->endOfWeek()));

            return [
                'label' => $w->format('M j'),
                'verified' => round((float) $in->where('status', DutyEntry::APPROVED)->sum('verified_hours'), 1),
                'logged' => round((float) $in->sum('hours'), 1),
            ];
        })->values();

        $counts = DutyEntry::whereIn('user_id', $ids)->selectRaw('status, count(*) as n')->groupBy('status')->pluck('n', 'status');
        $status = collect([DutyEntry::APPROVED => 'Approved', DutyEntry::SUBMITTED => 'Awaiting review', DutyEntry::REJECTED => 'Rejected', DutyEntry::DRAFT => 'Draft'])
            ->map(fn ($label, $k) => ['label' => $label, 'value' => (int) ($counts[$k] ?? 0)])->values();

        $bands = [
            ['label' => 'Completed', 'value' => $rows->where('percent', '>=', 100)->count()],
            ['label' => '50% to 99%', 'value' => $rows->where('percent', '>=', 50)->where('percent', '<', 100)->count()],
            ['label' => '1% to 49%', 'value' => $rows->where('percent', '>', 0)->where('percent', '<', 50)->count()],
            ['label' => 'Not started', 'value' => $rows->where('percent', '<=', 0)->count()],
        ];

        $bySection = $rows->groupBy(fn ($r) => $r['section'] ?? 'No section')
            ->map(fn ($g, $k) => ['label' => (string) $k, 'value' => round((float) $g->avg('percent'), 1)])
            ->sortByDesc('value')->take(8)->values();
        $byTrainee = $rows->sortByDesc('percent')->take(8)
            ->map(fn ($r) => ['label' => $r['name'], 'value' => (float) $r['percent']])->values();

        return compact('weekly', 'status', 'bands') + ['sections' => $bySection, 'top_trainees' => $byTrainee];
    }
}
