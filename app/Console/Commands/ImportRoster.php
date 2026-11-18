<?php

namespace App\Console\Commands;

use App\Support\Formats;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/** Loads the list of enrolled Student IDs (one per line, or the first CSV column). Safe to re-run. */
class ImportRoster extends Command
{
    protected $signature = 'roster:import {file : text/CSV file, Student ID (YYYY-N-NNNNN) in the first column} {--replace : delete the existing list first}';

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
            $id = trim(str_getcsv($line)[0] ?? '', " \t\"'\xEF\xBB\xBF");
            if (preg_match(Formats::STUDENT_ID, $id)) {
                $ids[$id] = true;
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
            foreach (array_chunk(array_keys($ids), 500) as $chunk) {
                DB::table('enrolled_students')->insertOrIgnore(
                    array_map(fn ($id) => ['student_id' => $id, 'created_at' => $now, 'updated_at' => $now], $chunk)
                );
            }
        });

        $this->info(count($ids)." Student ID(s) imported, {$skipped} line(s) skipped.");

        return self::SUCCESS;
    }
}
