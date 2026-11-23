<?php

namespace App\Services\Roster;

use App\Models\Course;

/**
 * Finds every Student ID (YYYY-N-NNNNN) in the records of a file and reads the course that goes with it.
 * The student and the course are always read together:
 *   1. the course on the same line as the ID (e.g. "2021-2-04062, CIT BSIT");
 *   2. else the next few lines up to the next ID (PDF / Word tables that put each cell on its own line);
 *   3. else a heading line above ("BSIT 4A") that applies to the IDs below it.
 * The result is only a reading of the file. Nothing here touches the database.
 */
class RosterParser
{
    public const ID_PATTERN = '/(?<!\d)(\d{4})\s*[-\x{2010}-\x{2015}\x{2212}]\s*(\d)\s*[-\x{2010}-\x{2015}\x{2212}]\s*(\d{5})(?!\d)/u';

    private const LOOKAHEAD = 3;

    public function __construct(private CourseResolver $courses) {}

    /**
     * @param  list<string>  $records
     * @return list<array{line:int, student_id:string, status:string, course:?Course, source:string, raw:string}>
     */
    public function parse(array $records): array
    {
        $n = count($records);
        $rows = [];
        $heading = null;
        $consumed = [];

        for ($i = 0; $i < $n; $i++) {
            $line = $records[$i];
            $ids = $this->ids($line);

            if ($ids === []) {
                if (! isset($consumed[$i]) && mb_strlen($line) <= 120) {
                    $r = $this->courses->resolve($line);
                    if ($r['status'] === CourseResolver::FOUND) {
                        $heading = $r;
                    }
                }
                continue;
            }

            $r = $this->courses->resolve($this->withoutIds($line));
            $source = 'row';

            if ($r['status'] !== CourseResolver::FOUND) {
                for ($j = $i + 1; $j <= min($n - 1, $i + self::LOOKAHEAD); $j++) {
                    if ($this->ids($records[$j]) !== []) {
                        break;
                    }
                    $rr = $this->courses->resolve($records[$j]);
                    if ($rr['status'] === CourseResolver::FOUND) {
                        $r = $rr;
                        $consumed[$j] = true;
                        break;
                    }
                    if ($rr['status'] === CourseResolver::AMBIGUOUS && $r['status'] === CourseResolver::NONE) {
                        $r = $rr;
                    }
                }
            }
            if ($r['status'] !== CourseResolver::FOUND && $heading !== null) {
                $r = $heading;
                $source = 'heading';
            }

            foreach ($ids as $id) {
                $rows[] = [
                    'line' => $i + 1, 'student_id' => $id, 'status' => $r['status'], 'course' => $r['course'],
                    'source' => $source, 'raw' => mb_substr(preg_replace('/\s+/u', ' ', $line) ?? '', 0, 120),
                ];
            }
        }

        return $rows;
    }

    /** @return list<string> normalised ids found in one record */
    private function ids(string $line): array
    {
        if (! preg_match_all(self::ID_PATTERN, $line, $m, PREG_SET_ORDER)) {
            return [];
        }

        return array_values(array_unique(array_map(fn ($x) => "{$x[1]}-{$x[2]}-{$x[3]}", $m)));
    }

    private function withoutIds(string $line): string
    {
        return (string) preg_replace(self::ID_PATTERN, ' ', $line);
    }
}
