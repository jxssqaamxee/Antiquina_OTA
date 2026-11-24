<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * enrolled_students.course_id / section_id were plain integers, so a roster row could point at a
     * course or section that no longer exists (the coordinator scope reads section_id). Adds real foreign keys.
     *
     * SAFE ON DIRTY DATA: orphan rows are looked up first. If any exist the migration STOPS before changing
     * anything and lists them, so nothing is silently deleted or re-pointed. To clean up, run:
     *   UPDATE enrolled_students SET course_id = NULL  WHERE course_id  IS NOT NULL AND course_id  NOT IN (SELECT id FROM courses);
     *   UPDATE enrolled_students SET section_id = NULL WHERE section_id IS NOT NULL AND section_id NOT IN (SELECT id FROM sections);
     * (or fix the rows by hand), then run `php artisan migrate` again.
     */
    public function up(): void
    {
        if (! Schema::hasTable('enrolled_students') || ! Schema::hasColumn('enrolled_students', 'course_id') || ! Schema::hasColumn('enrolled_students', 'section_id')) {
            return;
        }

        // By column, not by name: SQLite does not keep constraint names.
        $have = collect(Schema::getForeignKeys('enrolled_students'))->flatMap(fn ($fk) => $fk['columns'])->all();
        $needCourse = ! in_array('course_id', $have, true);
        $needSection = ! in_array('section_id', $have, true);
        if (! $needCourse && ! $needSection) {
            return; // already applied (safe to run twice)
        }

        $orphans = DB::table('enrolled_students')
            ->where(fn ($q) => $q
                ->where(fn ($c) => $c->whereNotNull('course_id')->whereNotIn('course_id', DB::table('courses')->select('id')))
                ->orWhere(fn ($c) => $c->whereNotNull('section_id')->whereNotIn('section_id', DB::table('sections')->select('id'))))
            ->orderBy('id')->limit(20)->pluck('student_id');

        if ($orphans->isNotEmpty()) {
            throw new RuntimeException('enrolled_students has rows pointing at a missing course or section (first 20 Student IDs: '
                .$orphans->implode(', ').'). Nothing was changed. See the comment at the top of this migration for the cleanup SQL, then migrate again.');
        }

        Schema::table('enrolled_students', function (Blueprint $table) use ($needCourse, $needSection) {
            $needCourse && $table->foreign('course_id', 'enrolled_students_course_fk')->references('id')->on('courses')->restrictOnDelete();
            $needSection && $table->foreign('section_id', 'enrolled_students_section_fk')->references('id')->on('sections')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        // SQLite (tests only) cannot drop a foreign key by name; MySQL / MariaDB can.
        if (! Schema::hasTable('enrolled_students') || DB::getDriverName() === 'sqlite') {
            return;
        }
        Schema::table('enrolled_students', function (Blueprint $table) {
            $table->dropForeign('enrolled_students_course_fk');
            $table->dropForeign('enrolled_students_section_fk');
        });
    }
};
