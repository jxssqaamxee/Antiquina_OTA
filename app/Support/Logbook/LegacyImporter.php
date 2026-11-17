<?php

namespace App\Support\Logbook;

use App\Models\User;
use App\Models\UserDocument;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Copies the old JSON blobs (user_documents) into the new tables, repairing what it can
 * (bad times are dropped, duplicate names renamed, overlaps skipped, texts trimmed).
 * user_documents is only ever read, so it remains a backup.
 */
class LegacyImporter
{
    public function __construct(private LogbookStore $store, private LogbookValidator $validator) {}

    /** @return array{imported:list<string>,skipped:array<string,string>} */
    public function import(User $user): array
    {
        $report = ['imported' => [], 'skipped' => []];
        $docs = UserDocument::where('user_id', $user->id)->get()
            ->mapWithKeys(fn ($d) => [$d->key => json_decode($d->value, true)]);

        foreach (LogbookRules::KEYS as $key) {
            if (! $docs->has($key)) {
                continue;
            }
            $value = $key === 'logbook-v2' ? $this->repairLogbook($docs[$key]) : $this->repairOther($key, $docs[$key]);
            if ($value === null) {
                $report['skipped'][$key] = 'not usable';
                continue;
            }
            try {
                $this->putRaw($user, $key, $value);
                $report['imported'][] = $key;
            } catch (ValidationException $e) {
                $report['skipped'][$key] = implode(' ', array_map(fn ($m) => $m[0], $e->errors()));
            }
        }
        $this->store->markLegacyImported($user);

        return $report;
    }

    private function putRaw(User $user, string $key, mixed $value): void
    {
        // Only write what the new tables don't already hold: a user who already saved via the
        // new API keeps that data.
        $has = DB::table('user_settings')->where('user_id', $user->id)->first();
        $present = match ($key) {
            'logbook-v2' => $has?->logbook_saved_at,
            'milestones-v1' => $has?->milestones,
            'shift-reminder-v1' => $has?->shift_reminder_date,
            'onboarding-seen-v1' => $has?->onboarding_seen !== null ? true : null,
            'notifications-v1' => $has?->notifications_saved_at,
        };
        if ($present) {
            return;
        }
        $this->store->putValidated($user, $key, $value);
    }

    private function repairLogbook(mixed $v): ?array
    {
        if (! is_array($v)) {
            return null;
        }

        $target = $v['targetHours'] ?? LogbookRules::DEFAULT_TARGET_HOURS;
        $target = is_numeric($target) ? (int) round((float) $target) : LogbookRules::DEFAULT_TARGET_HOURS;
        $target = max(LogbookRules::MIN_TARGET_HOURS, min(LogbookRules::MAX_TARGET_HOURS, $target));

        $clients = [];
        $names = [];
        $ids = [];
        foreach (is_array($v['clients'] ?? null) ? $v['clients'] : [] as $c) {
            if (! is_array($c) || ! is_string($c['id'] ?? null) || ! preg_match(LogbookRules::ID_PATTERN, $c['id']) || isset($ids[$c['id']])) {
                continue;
            }
            $name = Text::line($c['name'] ?? '', LogbookRules::MAX_CLIENT_NAME);
            if ($name === '') {
                continue;
            }
            $base = $name;
            for ($n = 2; isset($names[mb_strtolower($name)]); $n++) {
                $name = mb_substr($base, 0, LogbookRules::MAX_CLIENT_NAME - 4)." ($n)";
            }
            $names[mb_strtolower($name)] = true;
            $ids[$c['id']] = true;

            $type = in_array($c['type'] ?? null, LogbookRules::CLIENT_TYPES, true) ? $c['type'] : 'custom';
            $days = array_values(array_unique(array_filter(is_array($c['days'] ?? null) ? $c['days'] : [], fn ($d) => is_int($d) && $d >= 1 && $d <= 7)));
            $in = $this->okTime($c['timeIn'] ?? null) ?? '08:00';
            $out = $this->okTime($c['timeOut'] ?? null) ?? '17:00';
            if ($this->mins($out) <= $this->mins($in)) {
                [$in, $out] = ['08:00', '17:00'];
            }
            $clients[] = ['id' => $c['id'], 'name' => $name, 'type' => $type, 'days' => $days ?: [1, 2, 3, 4, 5], 'timeIn' => $in, 'timeOut' => $out];
        }

        $entries = [];
        $taken = [];
        $eids = [];
        foreach (is_array($v['entries'] ?? null) ? $v['entries'] : [] as $e) {
            if (! is_array($e) || ! is_string($e['id'] ?? null) || ! preg_match(LogbookRules::ID_PATTERN, $e['id']) || isset($eids[$e['id']])) {
                continue;
            }
            $date = $e['date'] ?? null;
            $dt = is_string($date) ? \DateTimeImmutable::createFromFormat('!Y-m-d', $date) : false;
            if (! $dt || $dt->format('Y-m-d') !== $date) {
                continue;
            }
            $row = ['id' => $e['id'], 'date' => $date, 'client' => $e['client'] ?? null, 'category' => $e['category'] ?? 'regular', 'task' => $e['task'] ?? ''];
            $segs = [];
            foreach (['am', 'pm', 'ev'] as $seg) {
                $in = $this->okTime($e[$seg.'In'] ?? null);
                $out = $this->okTime($e[$seg.'Out'] ?? null);
                $good = $in !== null && $out !== null && $this->mins($out) > $this->mins($in);
                $row[$seg.'In'] = $good ? $in : '';
                $row[$seg.'Out'] = $good ? $out : '';
                if ($good) {
                    $segs[] = [$this->mins($in), $this->mins($out)];
                }
            }
            if (! $segs) {
                continue;
            }
            foreach ($segs as [$a, $b]) {
                foreach ($taken[$date] ?? [] as [$c, $d]) {
                    if ($a < $d && $c < $b) {
                        continue 3; // overlaps something already imported: skip this duplicate
                    }
                }
            }
            foreach ($segs as $s) {
                $taken[$date][] = $s;
            }
            $eids[$e['id']] = true;
            $entries[] = $row;
        }

        return [
            'studentName' => $v['studentName'] ?? '', 'targetHours' => $target, 'clients' => $clients,
            'entries' => $entries, 'lastClientId' => $v['lastClientId'] ?? null,
        ];
    }

    private function repairOther(string $key, mixed $v): mixed
    {
        return match ($key) {
            'milestones-v1' => is_array($v) ? array_values(array_filter($v, fn ($m) => is_string($m) || is_int($m))) : null,
            'shift-reminder-v1' => is_string($v) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) ? $v : null,
            'onboarding-seen-v1' => is_bool($v) ? $v : ($v ? true : null),
            'notifications-v1' => is_array($v) ? array_values(array_filter($v, fn ($n) => is_array($n) && is_string($n['id'] ?? null) && trim((string) ($n['title'] ?? '')) !== '' && is_string($n['time'] ?? null) && strtotime($n['time']) !== false)) : null,
        };
    }

    private function okTime(mixed $t): ?string
    {
        return is_string($t) && preg_match('/^([01]?\d|2[0-3]):([0-5]\d)$/', $t, $m) ? sprintf('%02d:%s', (int) $m[1], $m[2]) : null;
    }

    private function mins(string $t): int
    {
        [$h, $m] = explode(':', $t);

        return (int) $h * 60 + (int) $m;
    }
}
