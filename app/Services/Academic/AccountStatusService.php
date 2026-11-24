<?php

namespace App\Services\Academic;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Deactivate / reactivate an account (admin action). Every change is written to the audit log with the reason. */
class AccountStatusService
{
    public function __construct(private ActivityLogService $log) {}

    public function deactivate(User $actor, User $target, string $reason): void
    {
        DB::transaction(function () use ($actor, $target, $reason) {
            if ($actor->id === $target->id) {
                throw ValidationException::withMessages(['user' => 'You cannot deactivate your own account.']);
            }

            // Lock the active admins so two admins cannot each remove "the other one" at the same time.
            $activeAdmins = User::where('role', User::ROLE_ADMIN)
                ->where(fn ($q) => $q->where('is_active', true)->orWhereNull('is_active'))
                ->lockForUpdate()->pluck('id');

            $fresh = User::lockForUpdate()->findOrFail($target->id);
            if (! $fresh->isActive()) {
                abort(409, 'This account is already deactivated.');
            }
            if ($fresh->isAdmin() && $activeAdmins->count() <= 1) {
                throw ValidationException::withMessages(['user' => 'The last active administrator cannot be deactivated.']);
            }

            $fresh->deactivate(); // blocks sign-in and deletes every session + push subscription
            $this->log->record($actor, 'user.deactivated', 'user', $fresh->id, null, ['reason' => $reason, 'role' => $fresh->roleName()]);
        });
    }

    public function reactivate(User $actor, User $target, string $reason): void
    {
        DB::transaction(function () use ($actor, $target, $reason) {
            $fresh = User::lockForUpdate()->findOrFail($target->id);
            if ($fresh->isActive()) {
                abort(409, 'This account is already active.');
            }
            $fresh->reactivate();
            $this->log->record($actor, 'user.reactivated', 'user', $fresh->id, null, ['reason' => $reason, 'role' => $fresh->roleName()]);
        });
    }
}
