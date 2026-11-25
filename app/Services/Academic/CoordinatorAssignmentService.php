<?php

namespace App\Services\Academic;

use App\Models\CoordinatorAssignment;
use App\Models\Section;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CoordinatorAssignmentService
{
    public function __construct(private ActivityLogService $log, private CoordinatorNotifier $coordNotify) {}

    /**
     * Gives the coordinator exactly one section. Their previous assignment is closed (history kept) and
     * the section's previous coordinator, if any, is released. All inside one transaction; the generated
     * unique indexes turn a lost race into a clean 422 instead of two coordinators on one section.
     */
    public function assign(User $admin, User $coordinator, Section $section): CoordinatorAssignment
    {
        if (! $coordinator->isCoordinator() || ! $coordinator->isActive()) {
            throw ValidationException::withMessages(['coordinator_id' => 'Choose an active Coordinator account.']);
        }
        if (! $section->is_active) {
            throw ValidationException::withMessages(['section_id' => 'That section is not active.']);
        }

        $released = []; // [coordinator id => Section] who lost a section because of this change
        try {
            $new = DB::transaction(function () use ($admin, $coordinator, $section, &$released) {
                $open = CoordinatorAssignment::open()
                    ->where(fn ($q) => $q->where('coordinator_id', $coordinator->id)->orWhere('section_id', $section->id))
                    ->lockForUpdate()->get();

                if ($open->contains(fn ($a) => $a->coordinator_id === $coordinator->id && $a->section_id === $section->id)) {
                    return $open->first(fn ($a) => $a->coordinator_id === $coordinator->id);
                }
                foreach ($open as $old) {
                    if ($old->coordinator_id !== $coordinator->id) {
                        $released[$old->coordinator_id] = $old->section_id;
                    }
                    $old->update(['ended_at' => now()]);
                    $this->log->record($admin, 'coordinator.unassigned', 'coordinator', $old->coordinator_id, $old->section_id);
                }
                $new = CoordinatorAssignment::create([
                    'coordinator_id' => $coordinator->id, 'section_id' => $section->id,
                    'assigned_by' => $admin->id, 'started_at' => now(),
                ]);
                $this->log->record($admin, 'coordinator.assigned', 'coordinator', $coordinator->id, $section->id,
                    ['replaced' => $open->pluck('coordinator_id')->unique()->values()->all()]);

                return $new;
            });
        } catch (\Illuminate\Database\UniqueConstraintViolationException) {
            throw ValidationException::withMessages(['section_id' => 'Another change was saved at the same time. Please try again.']);
        }

        // After the commit. An unchanged re-assignment returns the old row (ended_at null, started before now): no notice then.
        if ($new->wasRecentlyCreated) {
            $this->coordNotify->sectionAssigned($coordinator, $section);
            foreach ($released as $coordId => $sectionId) {
                if ($c = User::find($coordId)) {
                    $this->coordNotify->sectionReleased($c, Section::findOrFail($sectionId));
                }
            }
        }

        return $new;
    }

    public function unassign(User $admin, User $coordinator): void
    {
        $sectionIds = DB::transaction(function () use ($admin, $coordinator) {
            $ids = [];
            foreach (CoordinatorAssignment::open()->where('coordinator_id', $coordinator->id)->lockForUpdate()->get() as $a) {
                $a->update(['ended_at' => now()]);
                $this->log->record($admin, 'coordinator.unassigned', 'coordinator', $coordinator->id, $a->section_id);
                $ids[] = $a->section_id;
            }

            return $ids;
        });
        foreach ($sectionIds as $id) {
            $this->coordNotify->sectionReleased($coordinator, Section::findOrFail($id));
        }
    }
}
