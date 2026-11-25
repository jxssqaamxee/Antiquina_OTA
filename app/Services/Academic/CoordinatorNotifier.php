<?php

namespace App\Services\Academic;

use App\Models\DutyEntry;
use App\Models\Section;
use App\Models\StudentEnrollment;
use App\Models\User;
use App\Models\UserNotification;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Str;

/**
 * Bell notices for COORDINATORS (stored in user_notifications, source=server, one row per recipient).
 *
 * Who receives a notice is never taken from a request: it is always derived from the database
 * (trainee -> open enrollment -> section -> open coordinator assignment), so a submission can only ever reach the
 * coordinator who owns that trainee's section. Reading is scoped the same way (see visibleTo()): a coordinator only
 * ever gets their own rows, and rows about a trainee who is no longer in their section are filtered out.
 *
 * Every public method is fire-and-forget: a notification problem is reported but NEVER breaks the real action
 * (submitting an entry, registering, reviewing, assigning a section).
 */
class CoordinatorNotifier
{
    public const ENTRY_SUBMITTED = 'entry_submitted';
    public const REGISTRATION = 'registration_pending';
    public const TRAINEE_JOINED = 'trainee_joined';
    public const SECTION_ASSIGNED = 'section_assigned';
    public const SECTION_RELEASED = 'section_released';

    /** Which coordinator screen a notice opens (keys of the coordinator sidebar). */
    public const TABS = [
        self::ENTRY_SUBMITTED => 'approvals',
        self::REGISTRATION => 'registrations',
        self::TRAINEE_JOINED => 'trainees',
        self::SECTION_ASSIGNED => 'dashboard',
        self::SECTION_RELEASED => 'dashboard',
    ];

    private const KEEP = 200; // newest notices kept per coordinator

    public function __construct(private CoordinatorAccessService $scope) {}

    // ------------------------------------------------------------------ events

    /**
     * Re-counts the trainee's submitted entries and keeps ONE live notice for it on the owning coordinator.
     * $submitted = true when the trainee just submitted (may create / re-raise the notice);
     * false after a review (only lowers the count or removes the notice, never creates one).
     */
    public function entriesChanged(User $trainee, bool $submitted): void
    {
        $this->safely(function () use ($trainee, $submitted) {
            $pending = DutyEntry::where('user_id', $trainee->id)->where('status', DutyEntry::SUBMITTED)->count();
            $coord = $this->scope->coordinatorForTrainee($trainee);

            // A previous section's coordinator must not keep a live notice about a trainee who moved away.
            UserNotification::where('subject_user_id', $trainee->id)->where('type', self::ENTRY_SUBMITTED)
                ->when($coord, fn ($q) => $q->where('user_id', '!=', $coord->id))->delete();
            if (! $coord) {
                return;
            }

            $key = 'entries:'.$trainee->id;
            $existing = UserNotification::where(['user_id' => $coord->id, 'dedupe_key' => $key])->first();
            if ($pending === 0) {
                $existing?->delete();

                return;
            }
            if (! $existing && ! $submitted) {
                return; // reviewed down to a smaller number after the coordinator cleared the notice: stay quiet
            }
            $raise = $submitted || ($existing && $pending > $existing->item_count);
            $who = $this->label($trainee);
            $this->put($coord, self::ENTRY_SUBMITTED, $key, $trainee->id, $pending, $raise,
                $pending === 1 ? 'Logbook entry submitted' : 'Logbook entries submitted',
                $pending === 1 ? "{$who} submitted a logbook entry for your review." : "{$who} has {$pending} logbook entries waiting for your review.");
        });
    }

    /** A new self-registration waiting for approval: goes to the coordinator of the roster row's section, if there is one. */
    public function registrationReceived(User $registrant): void
    {
        $this->safely(function () use ($registrant) {
            if ($registrant->approval_status !== User::APPROVAL_PENDING) {
                return;
            }
            $coord = $this->scope->coordinatorForRegistration($registrant);
            if (! $coord) {
                return; // no roster section / no coordinator: only the administrator sees it
            }
            $this->put($coord, self::REGISTRATION, 'reg:'.$registrant->id, $registrant->id, 1, true,
                'New registration', $this->label($registrant).' registered and is waiting for approval.');
        });
    }

    /** Approved or rejected (by anyone): nobody should keep a "waiting for approval" notice about it. */
    public function registrationResolved(User $registrant): void
    {
        $this->safely(fn () => UserNotification::where('subject_user_id', $registrant->id)->where('type', self::REGISTRATION)->delete());
    }

    /** A trainee now sits in a section (verified registration, admin placement, promotion or transfer): tell that section's coordinator. */
    public function traineeJoined(User $trainee, ?StudentEnrollment $enrollment): void
    {
        $this->safely(function () use ($trainee, $enrollment) {
            if (! $enrollment?->section_id) {
                return;
            }
            $coord = $this->scope->coordinatorForSection($enrollment->section_id);
            if (! $coord) {
                return;
            }
            $code = Section::with('course')->find($enrollment->section_id)?->code() ?? 'your section';
            // One notice per section per day, with a count, so a whole-class rollover is one line, not forty.
            $key = 'joined:'.$enrollment->section_id.':'.now()->format('Ymd');
            $existing = UserNotification::where(['user_id' => $coord->id, 'dedupe_key' => $key])->first();
            $count = ($existing?->item_count ?? 0) + 1;
            $who = $this->label($trainee);
            $this->put($coord, self::TRAINEE_JOINED, $key, $trainee->id, $count, true,
                $count === 1 ? 'New trainee in your section' : 'New trainees in your section',
                $count === 1 ? "{$who} joined {$code}." : "{$count} trainees joined {$code}. Latest: {$who}.");
        });
    }

    public function sectionAssigned(User $coordinator, Section $section): void
    {
        $this->safely(function () use ($coordinator, $section) {
            $this->forgetTraineeNotices($coordinator); // they belonged to the previous section
            $code = $section->loadMissing('course')->code();
            $this->put($coordinator, self::SECTION_ASSIGNED, 'assigned:'.$section->id, null, 1, true,
                'Section assigned', "You are now the coordinator of {$code}.");
        });
    }

    public function sectionReleased(User $coordinator, Section $section): void
    {
        $this->safely(function () use ($coordinator, $section) {
            $this->forgetTraineeNotices($coordinator);
            UserNotification::where(['user_id' => $coordinator->id, 'type' => self::SECTION_ASSIGNED])->delete();
            $code = $section->loadMissing('course')->code();
            $this->put($coordinator, self::SECTION_RELEASED, 'released:'.$section->id, null, 1, true,
                'Section removed', "You no longer coordinate {$code}.");
        });
    }

    // ------------------------------------------------------------------ reading (used by the controller)

    /**
     * EVERY read and write of the bell goes through this query: only the coordinator's own rows, only server notices,
     * and a notice about a trainee shows only while that trainee is still in (or still registering for) this
     * coordinator's section.
     */
    public function visibleTo(User $coordinator): Builder
    {
        return UserNotification::query()
            ->where('user_id', $coordinator->id)->where('source', 'server')
            ->where(function (Builder $q) use ($coordinator) {
                $q->whereNull('subject_user_id')
                    ->orWhereIn('subject_user_id', $this->scope->traineesQuery($coordinator)->select('users.id'))
                    ->orWhereIn('subject_user_id', $this->scope->pendingRegistrationsQuery($coordinator)->select('users.id'));
            });
    }

    public function toClient(UserNotification $n): array
    {
        return [
            'id' => $n->notif_uid, 'type' => $n->type, 'title' => $n->title, 'message' => $n->message,
            'time' => ($n->notified_at ?? $n->created_at)->utc()->format('Y-m-d\TH:i:s.v\Z'),
            'read' => (bool) $n->is_read, 'tab' => self::TABS[$n->type] ?? 'dashboard',
        ];
    }

    // ------------------------------------------------------------------ internals

    private function label(User $u): string
    {
        return trim($u->fullName().($u->student_id ? " ({$u->student_id})" : ''));
    }

    private function forgetTraineeNotices(User $coordinator): void
    {
        UserNotification::where('user_id', $coordinator->id)->whereNotNull('subject_user_id')->delete();
    }

    private function put(User $coord, string $type, string $key, ?int $subjectId, int $count, bool $raise, string $title, string $message): void
    {
        $fields = [
            'type' => $type, 'title' => mb_substr($title, 0, 160), 'message' => mb_substr($message, 0, 500),
            'subject_user_id' => $subjectId, 'item_count' => $count,
        ];
        if ($raise) {
            $fields += ['is_read' => false, 'notified_at' => now()];
        }
        $where = ['user_id' => $coord->id, 'dedupe_key' => $key];

        if ($row = UserNotification::where($where)->first()) {
            $row->update($fields);
        } else {
            try {
                UserNotification::create($where + $fields + [
                    'notif_uid' => 'c'.Str::lower(Str::random(15)), 'is_read' => false, 'notified_at' => now(), 'position' => 0, 'source' => 'server',
                ]);
            } catch (UniqueConstraintViolationException) {
                UserNotification::where($where)->update($fields); // two requests raced: the other one created it first
            }
        }
        $this->prune($coord);
    }

    private function prune(User $coord): void
    {
        $old = UserNotification::where('user_id', $coord->id)->orderByDesc('id')->skip(self::KEEP)->limit(500)->pluck('id');
        if ($old->isNotEmpty()) {
            UserNotification::whereIn('id', $old)->delete();
        }
    }

    private function safely(\Closure $fn): void
    {
        try {
            $fn();
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
