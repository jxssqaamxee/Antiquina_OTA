<?php

namespace App\Support\Logbook;

use Illuminate\Validation\ValidationException;

/**
 * Validates + normalises every synced document. Throws a 422 ValidationException with one
 * message per bad field; never lets garbage reach the database. Text is sanitised, hours are
 * always computed here (the browser's value is ignored).
 */
class LogbookValidator
{
    /** @var array<string,string> */
    private array $errors = [];

    /** @return mixed the cleaned value for $key */
    public function validate(string $key, mixed $value): mixed
    {
        $this->errors = [];

        $clean = match ($key) {
            'logbook-v2' => $this->logbook($value),
            'milestones-v1' => $this->milestones($value),
            'shift-reminder-v1' => $this->reminderDate($value),
            'onboarding-seen-v1' => $this->onboarding($value),
            'notifications-v1' => $this->notifications($value),
            default => $this->fail('value', 'Unknown document.'),
        };

        if ($this->errors) {
            throw ValidationException::withMessages($this->errors);
        }

        return $clean;
    }

    // ------------------------------------------------------------------ logbook

    private function logbook(mixed $v): array
    {
        if (! is_array($v) || array_is_list($v) && $v !== []) {
            return $this->fail('value', 'The logbook must be an object.');
        }

        $target = $v['targetHours'] ?? LogbookRules::DEFAULT_TARGET_HOURS;
        if (! is_int($target) && ! (is_float($target) && floor($target) === $target)) {
            $this->fail('value.targetHours', 'Target hours must be a whole number.');
            $target = LogbookRules::DEFAULT_TARGET_HOURS;
        } elseif ($target < LogbookRules::MIN_TARGET_HOURS || $target > LogbookRules::MAX_TARGET_HOURS) {
            $this->fail('value.targetHours', sprintf('Target hours must be between %d and %d.', LogbookRules::MIN_TARGET_HOURS, LogbookRules::MAX_TARGET_HOURS));
        }

        $clients = $this->clients($v['clients'] ?? []);
        $entries = $this->entries($v['entries'] ?? [], array_column($clients, 'id'));

        $last = $v['lastClientId'] ?? null;
        $lastId = is_string($last) && in_array($last, array_column($clients, 'id'), true) ? $last : null; // stale id -> cleared

        // Which host client the app's progress view / PDF export is scoped to: "all", "none"
        // (unassigned entries) or a host client id. A stale or unknown id falls back to "all".
        $clientIds = array_column($clients, 'id');
        $pick = fn ($x) => ($x === 'none' || (is_string($x) && in_array($x, $clientIds, true))) ? $x : 'all';

        return [
            'viewClientId' => $pick($v['viewClientId'] ?? null),
            'exportClientId' => $pick($v['exportClientId'] ?? null),
            'studentName' => Text::personName($v['studentName'] ?? '', LogbookRules::MAX_STUDENT_NAME),
            'targetHours' => (int) $target,
            'clients' => $clients,
            'entries' => $entries,
            'lastClientId' => $lastId,
        ];
    }

    private function clients(mixed $list): array
    {
        if (! is_array($list) || ($list !== [] && ! array_is_list($list))) {
            $this->fail('value.clients', 'Host clients must be a list.');

            return [];
        }
        if (count($list) > LogbookRules::MAX_CLIENTS) {
            $this->fail('value.clients', 'Too many host clients (max '.LogbookRules::MAX_CLIENTS.').');

            return [];
        }

        $out = [];
        $ids = [];
        $names = [];
        foreach ($list as $i => $c) {
            $p = "value.clients.$i";
            if (! is_array($c)) {
                $this->fail($p, 'Invalid host client.');
                continue;
            }

            $id = $c['id'] ?? null;
            if (! is_string($id) || ! preg_match(LogbookRules::ID_PATTERN, $id)) {
                $this->fail("$p.id", 'Invalid host client id.');
                continue;
            }
            if (isset($ids[$id])) {
                $this->fail("$p.id", 'Duplicate host client id.');
                continue;
            }
            $ids[$id] = true;

            $name = Text::line($c['name'] ?? '', LogbookRules::MAX_CLIENT_NAME + 1);
            if ($name === '') {
                $this->fail("$p.name", 'Host client name is required.');
            } elseif (mb_strlen($name) > LogbookRules::MAX_CLIENT_NAME) {
                $this->fail("$p.name", 'Host client name is too long ('.LogbookRules::MAX_CLIENT_NAME.' characters max).');
            } elseif (isset($names[mb_strtolower($name)])) {
                $this->fail("$p.name", "A host client named \"$name\" already exists.");
            }
            $names[mb_strtolower($name)] = true;

            $type = $c['type'] ?? 'custom';
            if (! in_array($type, LogbookRules::CLIENT_TYPES, true)) {
                $this->fail("$p.type", 'Host client type must be public, private or custom.');
                $type = 'custom';
            }

            $days = $c['days'] ?? null;
            $cleanDays = [];
            if (! is_array($days) || $days === []) {
                $this->fail("$p.days", 'Pick at least one duty day.');
            } else {
                foreach ($days as $d) {
                    if (is_int($d) && $d >= 1 && $d <= 7) {
                        $cleanDays[$d] = $d;
                    } else {
                        $this->fail("$p.days", 'Duty days must be 1 (Mon) to 7 (Sun).');
                        break;
                    }
                }
                sort($cleanDays);
            }

            $in = $this->time($c['timeIn'] ?? null);
            $outT = $this->time($c['timeOut'] ?? null);
            if ($in === null) {
                $this->fail("$p.timeIn", 'Time in must be a valid time (HH:MM).');
            }
            if ($outT === null) {
                $this->fail("$p.timeOut", 'Time out must be a valid time (HH:MM).');
            }
            if ($in !== null && $outT !== null && $this->minutes($outT) <= $this->minutes($in)) {
                $this->fail("$p.timeOut", 'Time out must be after time in.');
            }

            $out[] = [
                'id' => $id, 'name' => $name, 'type' => $type, 'days' => array_values($cleanDays),
                'timeIn' => $in ?? '08:00', 'timeOut' => $outT ?? '17:00',
            ];
        }

        return $out;
    }

    private function entries(mixed $list, array $clientIds): array
    {
        if (! is_array($list) || ($list !== [] && ! array_is_list($list))) {
            $this->fail('value.entries', 'Entries must be a list.');

            return [];
        }
        if (count($list) > LogbookRules::MAX_ENTRIES) {
            $this->fail('value.entries', 'Too many entries (max '.LogbookRules::MAX_ENTRIES.').');

            return [];
        }

        $out = [];
        $ids = [];
        $ranges = []; // date => [[start, end, label], ...]
        foreach ($list as $i => $e) {
            $p = "value.entries.$i";
            if (! is_array($e)) {
                $this->fail($p, 'Invalid entry.');
                continue;
            }

            $id = $e['id'] ?? null;
            if (! is_string($id) || ! preg_match(LogbookRules::ID_PATTERN, $id)) {
                $this->fail("$p.id", 'Invalid entry id.');
                continue;
            }
            if (isset($ids[$id])) {
                $this->fail("$p.id", 'Duplicate entry id.');
                continue;
            }
            $ids[$id] = true;

            $date = $e['date'] ?? null;
            $dt = is_string($date) ? \DateTimeImmutable::createFromFormat('!Y-m-d', $date) : false;
            if (! $dt || $dt->format('Y-m-d') !== $date || $date < '2000-01-01' || $date > '2100-12-31') {
                $this->fail("$p.date", 'Please pick a valid date.');
                continue;
            }

            $client = $e['client'] ?? null;
            // A host client that was deleted leaves its id behind on old entries: they show as
            // "Unassigned" in the app, so an unknown id is stored as no client (never rejected).
            $client = is_string($client) && in_array($client, $clientIds, true) ? $client : null;

            $category = $e['category'] ?? 'regular';
            if (! in_array($category, LogbookRules::CATEGORIES, true)) {
                $this->fail("$p.category", 'Shift type must be regular, evening or overtime.');
                $category = 'regular';
            }

            $times = [];
            $segments = [];
            $hours = 0.0;
            foreach (['am' => 'Morning', 'pm' => 'Afternoon', 'ev' => 'Evening'] as $seg => $label) {
                $rawIn = $e[$seg.'In'] ?? '';
                $rawOut = $e[$seg.'Out'] ?? '';
                $in = $rawIn === '' || $rawIn === null ? null : $this->time($rawIn);
                $outT = $rawOut === '' || $rawOut === null ? null : $this->time($rawOut);

                if (($rawIn !== '' && $rawIn !== null && $in === null) || ($rawOut !== '' && $rawOut !== null && $outT === null)) {
                    $this->fail("$p.{$seg}In", "$label times must be valid (HH:MM).");
                    continue;
                }
                if (($in === null) !== ($outT === null)) {
                    $this->fail("$p.{$seg}In", "$label needs both a time in and a time out.");
                    continue;
                }
                if ($in === null) {
                    $times[$seg.'In'] = null;
                    $times[$seg.'Out'] = null;
                    continue;
                }
                $a = $this->minutes($in);
                $b = $this->minutes($outT);
                if ($b <= $a) {
                    $this->fail("$p.{$seg}Out", "$label time out must be after time in.");
                    continue;
                }
                $times[$seg.'In'] = $in;
                $times[$seg.'Out'] = $outT;
                $segments[] = [$a, $b, $label];
                $hours += round(($b - $a) / 60, 2);
            }

            if ($segments === []) {
                if (! $this->hasErrorUnder($p)) {
                    $this->fail("$p.amIn", 'Enter at least one time range for this entry.');
                }
                continue;
            }
            $hours = round($hours, 2);

            foreach ($segments as [$a, $b, $label]) {
                foreach ($ranges[$date] ?? [] as [$c, $d, $other]) {
                    if ($a < $d && $c < $b) {
                        $this->fail("$p.date", "That overlaps a ".strtolower($other)." entry already logged for $date.");
                        break 2;
                    }
                }
            }
            foreach ($segments as $s) {
                $ranges[$date][] = $s;
            }

            $out[] = [
                'id' => $id, 'date' => $date, 'client' => $client, 'category' => $category,
                'amIn' => $times['amIn'] ?? null, 'amOut' => $times['amOut'] ?? null,
                'pmIn' => $times['pmIn'] ?? null, 'pmOut' => $times['pmOut'] ?? null,
                'evIn' => $times['evIn'] ?? null, 'evOut' => $times['evOut'] ?? null,
                'hours' => $hours, 'coverage' => $this->coverage($times),
                'task' => Text::block($e['task'] ?? '', LogbookRules::MAX_TASK),
            ];
        }

        return $out;
    }

    private function coverage(array $t): string
    {
        $am = ! empty($t['amIn']);
        $pm = ! empty($t['pmIn']);
        $ev = ! empty($t['evIn']);

        return match (true) {
            $am && ! $pm && ! $ev => 'am',
            ! $am && $pm && ! $ev => 'pm',
            ! $am && ! $pm && $ev => 'ev',
            ! $am && $pm && $ev => 'pmev',
            default => 'full', // whole day
        };
    }

    // ----------------------------------------------------------- other documents

    private function milestones(mixed $v): array
    {
        if (! is_array($v) || ($v !== [] && ! array_is_list($v))) {
            return $this->fail('value', 'Milestones must be a list.');
        }
        if (count($v) > LogbookRules::MAX_MILESTONES) {
            return $this->fail('value', 'Too many milestones.');
        }
        $out = [];
        foreach ($v as $i => $m) {
            if (! is_string($m) && ! is_int($m)) {
                $this->fail("value.$i", 'Invalid milestone.');
                continue;
            }
            $s = Text::line((string) $m, 64);
            if ($s !== '') {
                $out[$s] = $s;
            }
        }

        return array_values($out);
    }

    private function reminderDate(mixed $v): mixed
    {
        if ($v === null) {
            return null;
        }
        $dt = is_string($v) ? \DateTimeImmutable::createFromFormat('!Y-m-d', $v) : false;
        if (! $dt || $dt->format('Y-m-d') !== $v) {
            return $this->fail('value', 'Reminder date must be YYYY-MM-DD.');
        }

        return $v;
    }

    private function onboarding(mixed $v): mixed
    {
        if (! is_bool($v)) {
            $this->fail('value', 'Onboarding flag must be true or false.');

            return false;
        }

        return $v;
    }

    private function notifications(mixed $v): array
    {
        if (! is_array($v) || ($v !== [] && ! array_is_list($v))) {
            return $this->fail('value', 'Notifications must be a list.');
        }
        if (count($v) > LogbookRules::MAX_NOTIFICATIONS) {
            $v = array_slice($v, 0, LogbookRules::MAX_NOTIFICATIONS); // newest first: older ones fall off
        }

        $out = [];
        $ids = [];
        foreach ($v as $i => $n) {
            $p = "value.$i";
            if (! is_array($n)) {
                $this->fail($p, 'Invalid notification.');
                continue;
            }
            $id = $n['id'] ?? null;
            if (! is_string($id) || ! preg_match(LogbookRules::ID_PATTERN, $id) || isset($ids[$id])) {
                $this->fail("$p.id", 'Invalid or duplicate notification id.');
                continue;
            }
            $ids[$id] = true;

            $title = Text::line($n['title'] ?? '', LogbookRules::MAX_NOTIF_TITLE);
            if ($title === '') {
                $this->fail("$p.title", 'Notification title is required.');
                continue;
            }
            $time = $n['time'] ?? null;
            $ts = is_string($time) ? strtotime($time) : false;
            if ($ts === false) {
                $this->fail("$p.time", 'Notification time must be a valid date-time.');
                continue;
            }
            $type = Text::line($n['type'] ?? 'info', 24);
            if (! preg_match('/^[a-z][a-z0-9_-]*$/i', $type)) {
                $type = 'info';
            }
            $out[] = [
                'id' => $id, 'type' => $type, 'title' => $title,
                'message' => Text::line($n['message'] ?? '', LogbookRules::MAX_NOTIF_MESSAGE),
                'time' => gmdate('Y-m-d\TH:i:s', $ts).'.000Z',
                'read' => ($n['read'] ?? false) === true,
            ];
        }

        return $out;
    }

    // ------------------------------------------------------------------ helpers

    private function time(mixed $t): ?string
    {
        if (! is_string($t) || ! preg_match('/^([01]?\d|2[0-3]):([0-5]\d)$/', $t, $m)) {
            return null;
        }

        return sprintf('%02d:%s', (int) $m[1], $m[2]);
    }

    private function minutes(string $t): int
    {
        [$h, $m] = explode(':', $t);

        return (int) $h * 60 + (int) $m;
    }

    private function hasErrorUnder(string $prefix): bool
    {
        foreach (array_keys($this->errors) as $k) {
            if (str_starts_with($k, $prefix.'.')) {
                return true;
            }
        }

        return false;
    }

    private function fail(string $field, string $message): array
    {
        $this->errors[$field] ??= $message;

        return [];
    }
}
