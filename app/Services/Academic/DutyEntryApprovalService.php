<?php

namespace App\Services\Academic;

use App\Models\DutyEntry;
use App\Models\DutyEntryReview;
use App\Models\StudentEnrollment;
use App\Models\User;
use App\Models\UserSetting;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Submit / approve / reject. Each change locks the trainee's settings row (same lock sync uses) and bumps logbook_revision. */
class DutyEntryApprovalService
{
    public function __construct(private ActivityLogService $log, private ServerNotifier $notify) {}

    public function submit(User $trainee, string $entryUid): DutyEntry
    {
        return $this->change($trainee, fn () => DutyEntry::where(['user_id' => $trainee->id, 'entry_uid' => $entryUid])->lockForUpdate()->first(),
            function (DutyEntry $e) use ($trainee) {
                if (! in_array($e->status, [DutyEntry::DRAFT, DutyEntry::REJECTED], true)) {
                    throw ValidationException::withMessages(['entry' => 'This entry is already submitted or approved.']);
                }
                $e->update(['status' => DutyEntry::SUBMITTED, 'submitted_at' => now(), 'review_reason' => null, 'reviewed_by' => null, 'reviewed_at' => null]);
                DutyEntryReview::create(['duty_entry_id' => $e->id, 'actor_id' => $trainee->id, 'action' => 'submitted', 'created_at' => now()]);
            });
    }

    public function approve(User $coordinator, DutyEntry $entry, ?float $verifiedHours): DutyEntry
    {
        return $this->review($coordinator, $entry, DutyEntry::APPROVED, null, $verifiedHours);
    }

    public function reject(User $coordinator, DutyEntry $entry, string $reason): DutyEntry
    {
        return $this->review($coordinator, $entry, DutyEntry::REJECTED, $reason, null);
    }

    /**
     * Reviews several submitted entries in one go (approve at the full logged hours, or return with one shared reason).
     * Each entry is still its own locked transaction with its own audit row, so one stale entry never blocks the rest;
     * the trainee gets ONE notice per batch instead of one per entry. Returns ['done' => n, 'skipped' => n, 'hours' => x].
     *
     * @param  iterable<DutyEntry>  $entries
     */
    public function reviewMany(User $reviewer, iterable $entries, string $outcome, ?string $reason = null): array
    {
        $done = []; $skipped = 0; $hours = 0.0;
        foreach ($entries as $entry) {
            try {
                $e = $this->review($reviewer, $entry, $outcome, $reason, null, false);
                $done[$e->user_id][] = $e;
                $hours += (float) ($e->verified_hours ?? 0);
            } catch (ValidationException) {
                $skipped++; // already reviewed by someone else, or withdrawn
            }
        }
        foreach ($done as $traineeId => $list) {
            $n = count($list);
            $what = $n === 1 ? '1 entry was' : "{$n} entries were";
            $this->notify->notify(User::findOrFail($traineeId),
                $outcome === DutyEntry::APPROVED ? ($n === 1 ? 'Entry approved' : 'Entries approved') : ($n === 1 ? 'Entry needs changes' : 'Entries need changes'),
                $outcome === DutyEntry::APPROVED ? "{$what} approved." : "{$what} returned: {$reason}");
        }

        return ['done' => array_sum(array_map('count', $done)), 'skipped' => $skipped, 'hours' => round($hours, 2)];
    }

    private function review(User $reviewer, DutyEntry $entry, string $outcome, ?string $reason, ?float $verified, bool $notify = true): DutyEntry
    {
        $trainee = User::findOrFail($entry->user_id);

        return $this->change($trainee, fn () => DutyEntry::whereKey($entry->id)->lockForUpdate()->first(),
            function (DutyEntry $e) use ($reviewer, $trainee, $outcome, $reason, $verified, $notify) {
                if ($e->status !== DutyEntry::SUBMITTED) {
                    throw ValidationException::withMessages(['entry' => 'Only a submitted entry can be reviewed.']);
                }
                $hours = $outcome === DutyEntry::APPROVED ? round($verified ?? (float) $e->hours, 2) : null;
                if ($hours !== null && ($hours < 0 || $hours > (float) $e->hours)) {
                    throw ValidationException::withMessages(['verified_hours' => 'Verified hours cannot exceed the logged hours.']);
                }
                $e->update(['status' => $outcome, 'reviewed_by' => $reviewer->id, 'reviewed_at' => now(), 'review_reason' => $reason, 'verified_hours' => $hours]);
                DutyEntryReview::create(['duty_entry_id' => $e->id, 'actor_id' => $reviewer->id, 'action' => $outcome, 'reason' => $reason, 'verified_hours' => $hours, 'created_at' => now()]);
                $sectionId = StudentEnrollment::open()->where('user_id', $trainee->id)->value('section_id');
                $this->log->record($reviewer, "entry.{$outcome}", 'duty_entry', $e->id, $sectionId, ['trainee' => $trainee->id, 'reason' => $reason, 'verified_hours' => $hours]);
                if (! $notify) {
                    return;
                }
                $date = $e->duty_date->format('M j');
                $this->notify->notify($trainee, $outcome === DutyEntry::APPROVED ? 'Entry approved' : 'Entry needs changes',
                    $outcome === DutyEntry::APPROVED ? "Your {$date} entry was approved." : "Your {$date} entry was returned: {$reason}");
            });
    }

    /**
     * Runs $apply on the entry inside one transaction holding the trainee's settings lock, then bumps the logbook revision.
     * $find must return the entry with lockForUpdate(): a plain read here would use the transaction's snapshot, taken before
     * the settings lock was won, so a request that queued behind another review would re-check a stale status (MariaDB/MySQL
     * REPEATABLE READ) and review the same entry twice. A locking read always sees the latest committed row.
     */
    private function change(User $trainee, \Closure $find, \Closure $apply): DutyEntry
    {
        return DB::transaction(function () use ($trainee, $find, $apply) {
            UserSetting::firstOrCreate(['user_id' => $trainee->id]);
            UserSetting::where('user_id', $trainee->id)->lockForUpdate()->first();
            $e = $find();
            if (! $e) {
                throw ValidationException::withMessages(['entry' => 'Entry not found. Open the logbook once so it syncs, then try again.']);
            }
            $apply($e);
            UserSetting::where('user_id', $trainee->id)->increment('logbook_revision');

            return $e->fresh();
        });
    }
}
