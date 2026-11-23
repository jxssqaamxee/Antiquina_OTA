<?php

namespace App\Services\Roster;

use App\Models\Section;
use App\Models\User;
use App\Services\Academic\ActivityLogService;
use App\Support\Formats;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Puts Student IDs on the roster of ONE section (the coordinator's own: 4A, 4B, 4C, 4D ...).
 * A Student ID is accepted only when the file gives a course AND that course is the section's course.
 * Preview (dry run) and import share this one code path, so what the preview shows is what the import does.
 */
class RosterImportService
{
    public const MAX_SHOWN = 1000;
    public const MAX_MANUAL = 200;

    public function __construct(
        private RosterFileReader $reader,
        private RosterParser $parser,
        private ActivityLogService $log,
    ) {}

    /**
     * @return array{dry_run:bool, section:string, file:string, counts:array<string,int>, rows:list<array>, truncated:bool}
     *
     * @throws RosterReadException
     */
    public function run(User $actor, Section $section, string $path, string $originalName, bool $dryRun, bool $assumeCourse = false): array
    {
        $section->loadMissing('course');
        $fileLabel = mb_substr(basename(str_replace('\\', '/', $originalName)) ?: 'upload', 0, 120);

        $parsed = $this->parser->parse($this->reader->records($path, $originalName));
        if ($parsed === []) {
            throw new RosterReadException('No Student ID (like 2021-2-04062) was found in that file.');
        }

        // One verdict per Student ID. The same ID twice with different courses is not trusted.
        $byId = [];
        foreach ($parsed as $row) {
            if ($assumeCourse && $row['status'] === CourseResolver::NONE) {
                $row['course'] = $section->course;
                $row['status'] = CourseResolver::FOUND;
                $row['source'] = 'assumed';
            }
            $id = $row['student_id'];
            if (! isset($byId[$id])) {
                $byId[$id] = $row;
            } elseif (($byId[$id]['course']?->id) !== ($row['course']?->id) && $row['status'] === CourseResolver::FOUND && $byId[$id]['status'] === CourseResolver::FOUND) {
                $byId[$id]['conflict'] = true;
            } elseif ($byId[$id]['status'] !== CourseResolver::FOUND && $row['status'] === CourseResolver::FOUND) {
                $byId[$id] = $row; // a later line did say the course
            }
        }

        return $this->commit($actor, $section, $byId, [], $dryRun, $fileLabel);
    }

    /**
     * Adds Student IDs typed by hand (separated by spaces, commas or new lines). The course is NOT typed:
     * it is always the section's own course, so a coordinator can only add students of their section.
     * Same checks and same save path as a file import.
     *
     * @throws RosterReadException
     */
    public function addManual(User $actor, Section $section, string $text): array
    {
        $section->loadMissing('course');
        $tokens = preg_split('/[\s,;]+/', trim($text), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        if ($tokens === []) {
            throw new RosterReadException('Type at least one Student ID (like 2021-2-04062).');
        }
        if (count($tokens) > self::MAX_MANUAL) {
            throw new RosterReadException('Add up to '.self::MAX_MANUAL.' Student IDs at a time. For a longer list, import a file.');
        }

        $byId = [];
        $invalid = [];
        foreach ($tokens as $i => $token) {
            if (preg_match(Formats::STUDENT_ID, $token) !== 1) {
                $invalid[$token] ??= ['student_id' => mb_substr($token, 0, 40), 'line' => $i + 1, 'status' => 'invalid_id',
                    'message' => 'Not a valid Student ID. Use the format 2021-2-04062.', 'course' => null, 'course_from' => null];

                continue;
            }
            $byId[$token] ??= ['student_id' => $token, 'line' => $i + 1, 'course' => $section->course, 'status' => CourseResolver::FOUND, 'source' => 'manual'];
        }

        return $this->commit($actor, $section, $byId, array_values($invalid), false, 'typed by hand');
    }

    /** Checks every ID against the roster and (unless a dry run) saves the ones that pass. */
    private function commit(User $actor, Section $section, array $byId, array $preRejected, bool $dryRun, string $fileLabel): array
    {
        $existing = DB::table('enrolled_students')->whereIn('student_id', array_keys($byId))->get()->keyBy('student_id');
        $registered = User::whereIn('student_id', array_keys($byId))->pluck('student_id')->flip();
        $otherSections = Section::with('course')->whereIn('id', $existing->pluck('section_id')->filter()->unique())->get()->keyBy('id');

        $results = $preRejected;
        $accept = [];
        foreach ($byId as $id => $row) {
            [$state, $message] = $this->verdict($section, $row, $existing[$id] ?? null, isset($registered[$id]), $otherSections);
            $results[] = [
                'student_id' => $id, 'line' => $row['line'], 'status' => $state, 'message' => $message,
                'course' => $row['course']?->code, 'course_from' => $row['status'] === CourseResolver::FOUND ? $row['source'] : null,
            ];
            if ($state === 'added' || $state === 'updated') {
                $accept[] = $id;
            }
        }

        $counts = array_fill_keys(['added', 'updated', 'unchanged', 'rejected', 'skipped'], 0);
        foreach ($results as $r) {
            $counts[match ($r['status']) {
                'added', 'updated', 'unchanged' => $r['status'],
                'already_registered', 'other_section' => 'skipped',
                default => 'rejected',
            }]++;
        }

        if (! $dryRun && $accept !== []) {
            $now = now();
            DB::transaction(function () use ($accept, $section, $actor, $fileLabel, $now) {
                foreach (array_chunk($accept, 500) as $chunk) {
                    $rows = array_map(fn ($id) => [
                        'student_id' => $id, 'course_id' => $section->course_id, 'year_level' => $section->year_level,
                        'section_id' => $section->id, 'imported_by' => $actor->id, 'source_file' => $fileLabel,
                        'created_at' => $now, 'updated_at' => $now,
                    ], $chunk);
                    DB::table('enrolled_students')->upsert($rows, ['student_id'],
                        ['course_id', 'year_level', 'section_id', 'imported_by', 'source_file', 'updated_at']);
                }
            });
        }
        if (! $dryRun) {
            $this->log->record($actor, 'roster.imported', 'section', $section->id, $section->id, ['file' => $fileLabel] + $counts);
        }

        // Rows that need attention first, so the first screen shows what to fix.
        usort($results, fn ($a, $b) => [in_array($a['status'], ['added', 'updated', 'unchanged'], true), $a['line']] <=> [in_array($b['status'], ['added', 'updated', 'unchanged'], true), $b['line']]);

        return [
            'dry_run' => $dryRun, 'section' => $section->code(), 'file' => $fileLabel, 'counts' => $counts,
            'rows' => array_slice($results, 0, self::MAX_SHOWN), 'truncated' => count($results) > self::MAX_SHOWN,
        ];
    }

    /** @return array{0:string,1:string} [state, message for the coordinator] */
    private function verdict(Section $section, array $row, ?object $existing, bool $registered, Collection $otherSections): array
    {
        if (! empty($row['conflict'])) {
            return ['conflicting_course', 'This Student ID is listed with different courses in the file.'];
        }
        if ($row['status'] === CourseResolver::NONE) {
            return ['no_course', 'No course was found with this Student ID. Put the course (e.g. BSIT) on the same line, or tick “my file has no course column”.'];
        }
        if ($row['status'] === CourseResolver::AMBIGUOUS) {
            return ['ambiguous_course', 'The course is not specific enough (BSBA needs Marketing/MM or Financial/FM).'];
        }
        if ($row['course']->id !== $section->course_id) {
            return ['wrong_course', "Course {$row['course']->code} does not belong to section {$section->code()}."];
        }
        if ($registered) {
            return ['already_registered', 'This student already has an account. Ask the administrator to place them in the section.'];
        }
        if ($existing && $existing->section_id && (int) $existing->section_id !== $section->id) {
            $other = $otherSections->get($existing->section_id)?->code() ?? 'another section';

            return ['other_section', "Already on the roster of {$other}. The administrator can move them."];
        }
        if ($existing && (int) $existing->section_id === $section->id && (int) $existing->course_id === $section->course_id) {
            return ['unchanged', 'Already on this roster.'];
        }
        if ($existing) {
            return ['updated', 'Was on the list without a section; now placed in this section.'];
        }

        return ['added', 'Added to the roster.'];
    }
}
