<?php

namespace App\Console\Commands;

use App\Models\AcademicYear;
use App\Models\Course;
use App\Models\Section;
use App\Support\Formats;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/** Loads the list of enrolled Student IDs (one per line, or the first CSV column). Safe to re-run. */
class ImportRoster extends Command
{
    protected $signature = 'roster:import {file : text/CSV file, Student ID (YYYY-N-NNNNN) first; optional columns: course code, year level, section label} {--replace : delete the existing list first}';

    protected $description = 'Import the list of Student IDs that may register';

    public function handle(): int
    {
        $file = (string) $this->argument('file');
        if (! is_file($file) || ! is_readable($file)) {
            $this->error("Cannot read {$file}");

            return self::FAILURE;
        }

        $ids = [];
        $skipped = 0;
        foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $cols = str_getcsv($line);
            $id = trim($cols[0] ?? '', " \t\"'\xEF\xBB\xBF");
            if (preg_match(Formats::STUDENT_ID, $id)) {
                $ids[$id] = $this->placement($cols);
            } elseif ($id !== '') {
                $skipped++; // header row or malformed ID
            }
        }

        if ($ids === []) {
            $this->error('No valid Student IDs found (expected YYYY-N-NNNNN).');

            return self::FAILURE;
        }

        DB::transaction(function () use ($ids) {
            if ($this->option('replace')) {
                DB::table('enrolled_students')->delete();
            }
            $now = now();
            foreach (array_chunk($ids, 500, true) as $chunk) {
                $rows = [];
                foreach ($chunk as $id => $p) {
                    $rows[] = ['student_id' => $id, 'created_at' => $now, 'updated_at' => $now] + $p;
                }
                // Existing IDs are kept as they are, except that a new placement fills in their course/section.
                DB::table('enrolled_students')->upsert($rows, ['student_id'], ['course_id', 'year_level', 'section_id', 'updated_at']);
            }
        });

        $placed = count(array_filter($ids, fn ($p) => $p['section_id']));
        $this->info(count($ids)." Student ID(s) imported, {$skipped} line(s) skipped, {$placed} placed in a section.");

        return self::SUCCESS;
    }

    /** @return array{course_id:?int,year_level:?int,section_id:?int} */
    private function placement(array $cols): array
    {
        $none = ['course_id' => null, 'year_level' => null, 'section_id' => null];
        $code = trim($cols[1] ?? '');
        $level = (int) trim($cols[2] ?? '');
        $label = strtoupper(trim($cols[3] ?? ''));
        $course = $code !== '' ? Course::where('code', $code)->first() : null;
        if (! $course) {
            return $none;
        }
        $none['course_id'] = $course->id;
        $none['year_level'] = $level > 0 ? $level : null;
        $year = AcademicYear::current();
        $section = ($year && $level > 0 && $label !== '')
            ? Section::where(['course_id' => $course->id, 'academic_year_id' => $year->id, 'year_level' => $level, 'label' => $label])->first()
            : null;
        $none['section_id'] = $section?->id;

        return $none;
    }
}
