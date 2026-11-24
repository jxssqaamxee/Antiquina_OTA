<?php

namespace App\Support\Logbook;

use App\Models\DutyEntry;
use App\Models\HostClient;
use App\Models\User;
use App\Models\UserNotification;
use App\Models\UserSetting;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Reads and writes each synced document in real tables. The app keeps talking JSON
 * (/api/sync) in the same shapes as before; this class maps them to rows.
 */
class LogbookStore
{
    /** key => [revision column, last save id column] on user_settings. */
    private const COLUMNS = [
        'logbook-v2' => ['logbook_revision', 'logbook_save_id'],
        'milestones-v1' => ['milestones_revision', 'milestones_save_id'],
        'shift-reminder-v1' => ['reminder_revision', 'reminder_save_id'],
        'onboarding-seen-v1' => ['onboarding_revision', 'onboarding_save_id'],
        'notifications-v1' => ['notifications_revision', 'notifications_save_id'],
    ];

    public function __construct(private LogbookValidator $validator = new LogbookValidator()) {}

    /** The trainee's current logbook document + revision (used by the submit action to hand back the canonical state). */
    public function currentLogbook(User $user): array
    {
        $s = UserSetting::firstOrCreate(['user_id' => $user->id]);
        $s = $s->fresh();

        return ['revision' => (int) $s->logbook_revision, 'value' => $this->readLogbook($user, $s)];
    }

    /** All documents the user has saved, keyed like the old user_documents rows. */
    public function all(User $user): array
    {
        $this->importLegacyOnce($user);
        $s = UserSetting::where('user_id', $user->id)->first();
        if (! $s) {
            return [];
        }

        $docs = [];
        foreach (LogbookRules::KEYS as $key) {
            if ($this->exists($s, $key)) {
                $docs[$key] = $this->readDocument($user, $s, $key);
            }
        }

        return $docs;
    }

    /** Current revision per existing document, e.g. ['logbook-v2' => 3]. Empty when nothing is saved. */
    public function revisions(User $user): array
    {
        $s = UserSetting::where('user_id', $user->id)->first();
        if (! $s) {
            return [];
        }
        $out = [];
        foreach (LogbookRules::KEYS as $key) {
            if ($this->exists($s, $key)) {
                $out[$key] = (int) $s->{self::COLUMNS[$key][0]};
            }
        }

        return $out;
    }

    private function exists(UserSetting $s, string $key): bool
    {
        return match ($key) {
            'logbook-v2' => (bool) $s->logbook_saved_at,
            'milestones-v1' => $s->milestones !== null,
            'shift-reminder-v1' => (bool) $s->shift_reminder_date,
            'onboarding-seen-v1' => $s->onboarding_seen !== null,
            'notifications-v1' => (bool) $s->notifications_saved_at,
        };
    }

    private function readDocument(User $user, UserSetting $s, string $key): mixed
    {
        if (! $this->exists($s, $key)) {
            return null;
        }

        return match ($key) {
            'logbook-v2' => $this->readLogbook($user, $s),
            'milestones-v1' => array_values($s->milestones),
            'shift-reminder-v1' => $s->shift_reminder_date->format('Y-m-d'),
            'onboarding-seen-v1' => (bool) $s->onboarding_seen,
            'notifications-v1' => $this->readNotifications($user),
        };
    }

    /**
     * Revision-aware save. Returns ['status' => 'saved'|'duplicate'|'conflict', 'revision' => int,
     * 'value' => canonical server document, 'changed' => bool (canonical differs from what was sent)].
     * Throws ValidationException (422) on bad input.
     *
     *  - $baseRevision null          -> last write wins (old clients)
     *  - $baseRevision == current    -> saved, revision + 1
     *  - differs, same $saveId as the last accepted save -> 'duplicate' (client's earlier keepalive), nothing written
     *  - otherwise                   -> 'conflict', nothing written
     */
    public function save(User $user, string $key, mixed $value, ?int $baseRevision = null, ?string $saveId = null): array
    {
        $this->importLegacyOnce($user);
        $clean = $this->validator->validate($key, $value);
        [$revCol, $idCol] = self::COLUMNS[$key];

        return DB::transaction(function () use ($user, $key, $value, $clean, $baseRevision, $saveId, $revCol, $idCol) {
            $s = $this->lockedSettings($user);
            $current = (int) $s->{$revCol};

            if ($baseRevision !== null && $baseRevision !== $current) {
                $duplicate = $saveId !== null && $saveId === $s->{$idCol};

                return [
                    'status' => $duplicate ? 'duplicate' : 'conflict',
                    'revision' => $current,
                    'value' => $this->readDocument($user, $s, $key),
                    'changed' => false,
                ];
            }

            $this->write($user, $s, $key, $clean);
            $s->update([$revCol => $current + 1, $idCol => $saveId]);
            $canonical = $this->readDocument($user, $s, $key);

            return [
                'status' => 'saved',
                'revision' => $current + 1,
                'value' => $canonical,
                'changed' => ! $this->sameValue($canonical, $value),
            ];
        });
    }

    /** Structural equality ignoring key order; numbers compare by value (4 == 4.0). */
    private function sameValue(mixed $a, mixed $b): bool
    {
        if (is_array($a) && is_array($b)) {
            if (count($a) !== count($b)) {
                return false;
            }
            foreach ($a as $k => $v) {
                if (! array_key_exists($k, $b) || ! $this->sameValue($v, $b[$k])) {
                    return false;
                }
            }

            return true;
        }
        if (is_numeric($a) && is_numeric($b) && ! is_string($a) && ! is_string($b)) {
            return $a == $b;
        }

        return $a === $b;
    }

    /** Validate + save one document (no revision check). Throws ValidationException (422) on bad input. */
    public function put(User $user, string $key, mixed $value): void
    {
        $this->save($user, $key, $value);
    }

    /** Same as put() without the legacy import or revision bump (the importer itself writes through this). */
    public function putValidated(User $user, string $key, mixed $value): void
    {
        $clean = $this->validator->validate($key, $value);

        DB::transaction(function () use ($user, $key, $clean) {
            $this->write($user, $this->lockedSettings($user), $key, $clean);
        });
    }

    private function write(User $user, UserSetting $s, string $key, mixed $clean): void
    {
        match ($key) {
            'logbook-v2' => $this->writeLogbook($user, $s, $clean),
            'milestones-v1' => $s->update(['milestones' => $clean]),
            'shift-reminder-v1' => $s->update(['shift_reminder_date' => $clean]),
            'onboarding-seen-v1' => $s->update(['onboarding_seen' => $clean]),
            'notifications-v1' => $this->writeNotifications($user, $s, $clean),
        };
    }

    public function forget(User $user, string $key): void
    {
        DB::transaction(function () use ($user, $key) {
            $s = $this->lockedSettings($user);
            match ($key) {
                'logbook-v2' => $this->clearLogbook($user, $s),
                'milestones-v1' => $s->update(['milestones' => null]),
                'shift-reminder-v1' => $s->update(['shift_reminder_date' => null]),
                'onboarding-seen-v1' => $s->update(['onboarding_seen' => null]),
                'notifications-v1' => $this->clearNotifications($user, $s),
            };
            // Deleting is a change too: stale devices must conflict instead of silently resurrecting it.
            [$revCol, $idCol] = self::COLUMNS[$key];
            $s->update([$revCol => (int) $s->{$revCol} + 1, $idCol => null]);
        });
    }

    public function saveTheme(User $user, string $theme): void
    {
        DB::transaction(fn () => $this->lockedSettings($user)->update(['theme' => $theme]));
    }

    // ------------------------------------------------------------------ logbook

    private function readLogbook(User $user, UserSetting $s): array
    {
        $clients = HostClient::where('user_id', $user->id)->orderBy('position')->orderBy('id')->get();
        $uidById = $clients->pluck('client_uid', 'id');

        $entries = DutyEntry::where('user_id', $user->id)->orderBy('duty_date')->orderBy('id')->get()
            ->map(fn (DutyEntry $e) => array_filter([
                'status' => $e->status !== DutyEntry::DRAFT ? $e->status : null,
                'verifiedHours' => $e->status === DutyEntry::APPROVED ? $e->verified_hours : null,
                'reviewReason' => $e->status === DutyEntry::REJECTED ? $e->review_reason : null,
            ], fn ($v) => $v !== null) + [
                'id' => $e->entry_uid,
                'date' => $e->duty_date->format('Y-m-d'),
                'client' => $e->host_client_id ? ($uidById[$e->host_client_id] ?? null) : null,
                'category' => $e->category,
                'amIn' => $e->am_in ?? '', 'amOut' => $e->am_out ?? '',
                'pmIn' => $e->pm_in ?? '', 'pmOut' => $e->pm_out ?? '',
                'evIn' => $e->ev_in ?? '', 'evOut' => $e->ev_out ?? '',
                'hours' => $e->hours,
                'task' => $e->task,
            ])->all();

        return [
            'studentName' => $s->student_name ?? '',
            'targetHours' => app(\App\Services\Academic\TrainingHourService::class)->requiredHours($user),
            'clients' => $clients->map(fn (HostClient $c) => [
                'id' => $c->client_uid, 'name' => $c->name, 'type' => $c->type,
                'days' => array_values($c->days ?? []), 'timeIn' => $c->time_in, 'timeOut' => $c->time_out,
            ] + ($c->placement_id ? ['managed' => true] : []))->all(),
            'entries' => $entries,
            'lastClientId' => $s->last_client_uid,
            'viewClientId' => $this->scopeFromColumn($s->view_client_uid, $uidById),
            'exportClientId' => $this->scopeFromColumn($s->export_client_uid, $uidById),
        ];
    }

    /** Stored column -> "all" | "none" | a host client id that still exists. */
    private function scopeFromColumn(?string $v, $uidById): string
    {
        return ($v === 'none' || ($v !== null && $uidById->contains($v))) ? $v : 'all';
    }

    private function writeLogbook(User $user, UserSetting $s, array $doc): void
    {
        // Submitted/approved entries are already counted toward the trainee's hours. Their stored times are
        // the truth, whatever the pushed document says (or leaves out), so a new or edited entry may never
        // clash with them. Runs inside the sync transaction, which holds the settings lock.
        $lockedRows = DutyEntry::where('user_id', $user->id)->whereIn('status', DutyEntry::LOCKED)->get();
        $this->assertNoClashWithLocked($doc['entries'], $lockedRows);

        $now = now();
        $s->update([
            'student_name' => $doc['studentName'],
            'last_client_uid' => $doc['lastClientId'],
            'view_client_uid' => ($doc['viewClientId'] ?? 'all') === 'all' ? null : $doc['viewClientId'],
            'export_client_uid' => ($doc['exportClientId'] ?? 'all') === 'all' ? null : $doc['exportClientId'],
            'logbook_saved_at' => $now,
        ]);

        // Host clients. Free the unique name first so a rename/swap can't collide mid-write.
        $keepUids = array_column($doc['clients'], 'id');
        $managed = HostClient::where('user_id', $user->id)->whereNotNull('placement_id')->pluck('client_uid')->all(); // set by a placement: read-only here
        HostClient::where('user_id', $user->id)->whereNull('placement_id')->whereNotIn('client_uid', $keepUids)->delete();
        foreach ($doc['clients'] as $pos => $c) {
            if (! in_array($c['id'], $managed, true)) {
                HostClient::where('user_id', $user->id)->where('client_uid', $c['id'])->update(['name_key' => 'tmp-'.$c['id']]);
            }
        }
        foreach ($doc['clients'] as $pos => $c) {
            if (in_array($c['id'], $managed, true)) {
                continue;
            }
            HostClient::updateOrCreate(
                ['user_id' => $user->id, 'client_uid' => $c['id']],
                [
                    'name' => $c['name'], 'name_key' => mb_strtolower($c['name']), 'type' => $c['type'],
                    'days' => $c['days'], 'time_in' => $c['timeIn'], 'time_out' => $c['timeOut'], 'position' => $pos,
                ],
            );
        }
        $idByUid = HostClient::where('user_id', $user->id)->pluck('id', 'client_uid');

        // Duty entries. Submitted and approved entries belong to the review process: a push can neither
        // change nor delete them (the response carries the canonical document, which the app adopts).
        $locked = $lockedRows->pluck('entry_uid')->all();
        DutyEntry::where('user_id', $user->id)->whereNotIn('status', DutyEntry::LOCKED)
            ->whereNotIn('entry_uid', array_column($doc['entries'], 'id'))->delete();
        foreach ($doc['entries'] as $e) {
            if (in_array($e['id'], $locked, true)) {
                continue;
            }
            DutyEntry::updateOrCreate(
                ['user_id' => $user->id, 'entry_uid' => $e['id']],
                [
                    'duty_date' => $e['date'],
                    'host_client_id' => $e['client'] ? ($idByUid[$e['client']] ?? null) : null,
                    'category' => $e['category'], 'coverage' => $e['coverage'],
                    'am_in' => $e['amIn'], 'am_out' => $e['amOut'],
                    'pm_in' => $e['pmIn'], 'pm_out' => $e['pmOut'],
                    'ev_in' => $e['evIn'], 'ev_out' => $e['evOut'],
                    'hours' => $e['hours'], 'task' => $e['task'],
                ],
            );
        }
    }

    /**
     * Rejects (422) any entry in the pushed document that overlaps, on the same date, the stored times of a
     * locked entry. An entry that is itself locked is skipped: the store never changes it.
     *
     * @param array<int,array<string,mixed>>                       $entries cleaned entries from the validator
     * @param \Illuminate\Support\Collection<int,DutyEntry>      $lockedRows
     */
    private function assertNoClashWithLocked(array $entries, $lockedRows): void
    {
        if ($lockedRows->isEmpty()) {
            return;
        }

        $lockedUids = $lockedRows->pluck('entry_uid')->all();
        $byDate = [];
        foreach ($lockedRows as $row) {
            $byDate[$row->duty_date->format('Y-m-d')][] = $this->segments([
                'amIn' => $row->am_in, 'amOut' => $row->am_out, 'pmIn' => $row->pm_in, 'pmOut' => $row->pm_out,
                'evIn' => $row->ev_in, 'evOut' => $row->ev_out,
            ]);
        }

        $errors = [];
        foreach ($entries as $i => $e) {
            if (in_array($e['id'], $lockedUids, true) || empty($byDate[$e['date']])) {
                continue;
            }
            foreach ($this->segments($e) as [$a, $b]) {
                foreach ($byDate[$e['date']] as $segs) {
                    foreach ($segs as [$c, $d]) {
                        if ($a < $d && $c < $b) {
                            $errors["value.entries.$i.date"] = "That overlaps an entry already submitted or approved for {$e['date']}.";
                            break 3;
                        }
                    }
                }
            }
        }

        if ($errors) {
            throw ValidationException::withMessages($errors);
        }
    }

    /** @return array<int,array{0:int,1:int}> [start, end] minutes for each filled am/pm/ev range. */
    private function segments(array $t): array
    {
        $toMin = function ($v): ?int {
            if (! is_string($v) || ! preg_match('/^(\d{1,2}):(\d{2})/', $v, $m)) {
                return null;
            }

            return (int) $m[1] * 60 + (int) $m[2];
        };

        $out = [];
        foreach (['am', 'pm', 'ev'] as $seg) {
            $a = $toMin($t[$seg.'In'] ?? null);
            $b = $toMin($t[$seg.'Out'] ?? null);
            if ($a !== null && $b !== null && $b > $a) {
                $out[] = [$a, $b];
            }
        }

        return $out;
    }

    private function clearLogbook(User $user, UserSetting $s): void
    {
        DutyEntry::where('user_id', $user->id)->whereNotIn('status', DutyEntry::LOCKED)->delete();
        HostClient::where('user_id', $user->id)->whereNull('placement_id')->delete();
        $s->update(['student_name' => null, 'last_client_uid' => null, 'view_client_uid' => null, 'export_client_uid' => null, 'logbook_saved_at' => null]);
    }

    // ------------------------------------------------------------ notifications

    private function readNotifications(User $user): array
    {
        return UserNotification::where('user_id', $user->id)->orderBy('position')->orderBy('id')->get()
            ->map(fn (UserNotification $n) => [
                'id' => $n->notif_uid, 'type' => $n->type, 'title' => $n->title, 'message' => $n->message,
                'time' => ($n->notified_at ?? $n->created_at)->utc()->format('Y-m-d\TH:i:s.v\Z'),
                'read' => (bool) $n->is_read,
            ])->all();
    }

    private function writeNotifications(User $user, UserSetting $s, array $list): void
    {
        // Server-created notices (source=server) are never deleted by a client push.
        UserNotification::where('user_id', $user->id)->where('source', 'client')->whereNotIn('notif_uid', array_column($list, 'id'))->delete();
        foreach ($list as $pos => $n) {
            $existing = UserNotification::where(['user_id' => $user->id, 'notif_uid' => $n['id']])->first();
            if ($existing?->source === 'server') {
                $existing->update(['is_read' => $n['read']]); // the person may mark it read; nothing else
                continue;
            }
            UserNotification::updateOrCreate(
                ['user_id' => $user->id, 'notif_uid' => $n['id']],
                [
                    'type' => $n['type'], 'title' => $n['title'], 'message' => $n['message'],
                    'is_read' => $n['read'], 'notified_at' => Carbon::parse($n['time'])->utc(), 'position' => $pos,
                ],
            );
        }
        $s->update(['notifications_saved_at' => now()]);
    }

    private function clearNotifications(User $user, UserSetting $s): void
    {
        UserNotification::where('user_id', $user->id)->where('source', 'client')->delete();
        $s->update(['notifications_saved_at' => null]);
    }

    // ----------------------------------------------------------------- plumbing

    /** The user's settings row, created if missing, locked for the rest of the transaction. */
    private function lockedSettings(User $user): UserSetting
    {
        UserSetting::firstOrCreate(['user_id' => $user->id]);

        return UserSetting::where('user_id', $user->id)->lockForUpdate()->firstOrFail();
    }

    /** Copy this user's old user_documents blobs into the tables, once. The old rows are never modified. */
    public function importLegacyOnce(User $user): void
    {
        $s = UserSetting::where('user_id', $user->id)->first();
        if ($s?->legacy_imported_at) {
            return;
        }
        (new LegacyImporter($this, $this->validator))->import($user);
    }

    /** @internal used by LegacyImporter */
    public function markLegacyImported(User $user): void
    {
        $this->lockedSettings($user)->update(['legacy_imported_at' => now()]);
    }
}
