<?php

namespace App\Services\Academic;

use App\Http\Controllers\Api\EmailVerificationController;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Approve or reject a pending self-registration. The user row is locked and re-checked, so only one decision can win. */
class RegistrationApprovalService
{
    public function __construct(private ActivityLogService $log, private CoordinatorAccessService $scope, private CoordinatorNotifier $coordNotify) {}

    public function approve(User $actor, User $target): User
    {
        return $this->decide($actor, $target, User::APPROVAL_APPROVED, null);
    }

    public function reject(User $actor, User $target, ?string $reason): User
    {
        return $this->decide($actor, $target, User::APPROVAL_REJECTED, $reason !== null ? mb_substr(trim($reason), 0, 200) : null);
    }

    private function decide(User $actor, User $target, string $status, ?string $reason): User
    {
        $done = DB::transaction(function () use ($actor, $target, $status, $reason) {
            $u = User::whereKey($target->id)->lockForUpdate()->firstOrFail();
            if ($u->approval_status !== User::APPROVAL_PENDING) {
                throw ValidationException::withMessages(['registration' => 'This registration has already been reviewed.']);
            }
            $u->forceFill(['approval_status' => $status, 'approval_reviewed_by' => $actor->id, 'approval_reviewed_at' => now()])->save();
            $this->log->record($actor, 'registration.'.$status, 'user', $u->id, $this->scope->rosterSectionId($u),
                array_filter(['student_id' => $u->student_id, 'reason' => $reason]));

            return $u;
        });

        // Decided by this coordinator or the administrator: the "waiting for approval" notice is done for everyone.
        $this->coordNotify->registrationResolved($done);

        // Enrolment (and so visibility in a section) follows approval, but only for a verified email.
        if ($status === User::APPROVAL_APPROVED && $done->hasVerifiedEmail()) {
            EmailVerificationController::enrollWhenVerified($done);
        }

        return $done->fresh();
    }
}
