<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Roster rows now remember WHO imported them (the coordinator of the section) and from which file,
     * so every Student ID on the list belongs to exactly one section (4A, 4B, 4C, 4D ...).
     * Additive and nullable: rows made by `php artisan roster:import` keep working.
     */
    public function up(): void
    {
        if (! Schema::hasTable('enrolled_students')) {
            return;
        }
        Schema::table('enrolled_students', function (Blueprint $table) {
            if (! Schema::hasColumn('enrolled_students', 'imported_by')) {
                $table->unsignedBigInteger('imported_by')->nullable();
            }
            if (! Schema::hasColumn('enrolled_students', 'source_file')) {
                $table->string('source_file', 120)->nullable();
            }
        });
        Schema::table('enrolled_students', function (Blueprint $table) {
            // Coordinator roster screen lists one section at a time.
            $table->index('section_id', 'enrolled_students_section_idx');
        });
    }

    public function down(): void
    {
        // Columns are nullable and harmless; left in place on purpose.
    }
};
