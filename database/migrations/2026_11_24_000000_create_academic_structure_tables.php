<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Phase 2: courses, academic years, sections, enrollments (additive; MySQL + SQLite). */
    public function up(): void
    {
        if (! Schema::hasTable('courses')) {
            Schema::create('courses', function (Blueprint $table) {
                $table->id();
                $table->string('code', 16)->unique();          // BSIT, BSBA-MM ...
                $table->string('name', 160)->unique();         // exact string stored in users.course
                $table->string('college', 160)->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }
        if (! Schema::hasTable('academic_years')) {
            Schema::create('academic_years', function (Blueprint $table) {
                $table->id();
                $table->string('name', 16)->unique();          // 2026-2027
                $table->boolean('is_current')->default(false)->index();
                $table->timestamps();
            });
        }
        if (! Schema::hasTable('sections')) {
            Schema::create('sections', function (Blueprint $table) {
                $table->id();
                $table->foreignId('course_id')->constrained('courses')->restrictOnDelete();
                $table->foreignId('academic_year_id')->constrained('academic_years')->restrictOnDelete();
                $table->unsignedTinyInteger('year_level');
                $table->string('label', 8);                    // A, B, C ...
                $table->boolean('is_active')->default(true);
                $table->timestamps();
                $table->unique(['course_id', 'academic_year_id', 'year_level', 'label'], 'sections_unique_group');
            });
        }
        if (! Schema::hasTable('student_enrollments')) {
            Schema::create('student_enrollments', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->foreignId('course_id')->constrained('courses')->restrictOnDelete();
                $table->foreignId('academic_year_id')->constrained('academic_years')->restrictOnDelete();
                $table->foreignId('section_id')->nullable()->constrained('sections')->restrictOnDelete();
                $table->unsignedTinyInteger('year_level')->nullable();
                // pending_placement | active | completed | transferred | repeating
                $table->string('status', 24)->default('pending_placement')->index();
                $table->timestamp('started_at')->nullable();
                $table->timestamp('ended_at')->nullable();      // NULL = the student's current enrollment
                // Generated: user_id while open, NULL once closed -> at most ONE open enrollment per student.
                $table->unsignedBigInteger('open_user_id')->nullable()
                    ->storedAs('CASE WHEN ended_at IS NULL THEN user_id END');
                $table->timestamps();
                $table->unique('open_user_id', 'enrollments_one_open_per_user');
                $table->index(['section_id', 'ended_at']);
            });
        }

        if (Schema::hasTable('enrolled_students')) {
            Schema::table('enrolled_students', function (Blueprint $table) {
                if (! Schema::hasColumn('enrolled_students', 'course_id')) {
                    $table->unsignedBigInteger('course_id')->nullable();
                }
                if (! Schema::hasColumn('enrolled_students', 'year_level')) {
                    $table->unsignedTinyInteger('year_level')->nullable();
                }
                if (! Schema::hasColumn('enrolled_students', 'section_id')) {
                    $table->unsignedBigInteger('section_id')->nullable();
                }
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('student_enrollments');
        Schema::dropIfExists('sections');
        Schema::dropIfExists('academic_years');
        Schema::dropIfExists('courses');
        // enrolled_students extra columns are left in place (harmless, nullable).
    }
};
