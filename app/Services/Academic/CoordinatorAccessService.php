<?php

namespace App\Services\Academic;

use App\Models\CoordinatorAssignment;
use App\Models\Section;
use App\Models\StudentEnrollment;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * The ONLY place a Coordinator's scope is decided. Scope comes from the signed-in account's open
 * assignment, never from a request value, so URL/body tampering cannot widen it.
 */
class CoordinatorAccessService
{
    public function section(User $coordinator): ?Section
    {
        $a = CoordinatorAssignment::open()->where('coordinator_id', $coordinator->id)->with('section.course')->first();

        return $a?->section;
    }

    /** Trainees with an open enrollment in the coordinator's section. Empty when unassigned (never "all"). */
    public function traineesQuery(User $coordinator): Builder
    {
        $sectionId = $this->section($coordinator)?->id;

        return User::query()->where('role', User::ROLE_TRAINEE)->whereNotNull('email_verified_at')->whereNotIn('approval_status', [User::APPROVAL_PENDING, User::APPROVAL_REJECTED])->whereIn('id',
            StudentEnrollment::open()->where('section_id', $sectionId ?? 0)->select('user_id'));
    }

    /**
     * Pending self-registrations whose roster row names the coordinator's section. A registration with no
     * roster section (or no section assigned to the coordinator) is never visible here: only an admin sees it.
     */
    public function pendingRegistrationsQuery(User $coordinator): Builder
    {
        $sectionId = $this->section($coordinator)?->id;

        return User::query()->where('role', User::ROLE_TRAINEE)->where('approval_status', User::APPROVAL_PENDING)
            ->whereIn('student_id', \Illuminate\Support\Facades\DB::table('enrolled_students')->where('section_id', $sectionId ?? 0)->select('student_id'));
    }

    public function findPendingRegistrationOrFail(User $coordinator, int|string $id): User
    {
        return $this->pendingRegistrationsQuery($coordinator)->whereKey($id)->firstOrFail();
    }

    /** The roster section of a registration (for the audit trail). */
    public function rosterSectionId(User $registrant): ?int
    {
        return \Illuminate\Support\Facades\DB::table('enrolled_students')->where('student_id', $registrant->student_id)->value('section_id');
    }

    /** Out-of-scope ids behave exactly like missing ones (404), so existence is not leaked. */
    public function findTraineeOrFail(User $coordinator, int|string $id): User
    {
        return $this->traineesQuery($coordinator)->whereKey($id)->firstOrFail();
    }

    /** A duty entry of one of the coordinator's own trainees, or 404. */
    public function findEntryOrFail(User $coordinator, int|string $id): \App\Models\DutyEntry
    {
        return \App\Models\DutyEntry::whereIn('user_id', $this->traineesQuery($coordinator)->select('users.id'))->whereKey($id)->firstOrFail();
    }
}
