<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Phase 3: who coordinates which section (history kept) + append-only audit log. */
    public function up(): void
    {
        if (! Schema::hasTable('coordinator_assignments')) {
            Schema::create('coordinator_assignments', function (Blueprint $table) {
                $table->id();
                $table->foreignId('coordinator_id')->constrained('users')->cascadeOnDelete();
                $table->foreignId('section_id')->constrained('sections')->restrictOnDelete();
                $table->foreignId('assigned_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('started_at')->nullable();
                $table->timestamp('ended_at')->nullable();   // NULL = current
                // Generated from ended_at ONLY (1 while open, NULL once ended). MySQL refuses a CASCADE foreign key
                // on the base column of a stored generated column, so the ids are not used to build it.
                $table->unsignedTinyInteger('is_open')->nullable()->storedAs('CASE WHEN ended_at IS NULL THEN 1 END');
                $table->timestamps();
                $table->unique(['section_id', 'is_open'], 'assign_one_open_per_section');       // one open coordinator per section
                $table->unique(['coordinator_id', 'is_open'], 'assign_one_open_per_coordinator'); // one open section per coordinator
            });
        }
        if (! Schema::hasTable('activity_logs')) {
            Schema::create('activity_logs', function (Blueprint $table) {
                $table->id();
                $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('action', 64)->index();
                $table->string('subject_type', 48)->nullable();
                $table->unsignedBigInteger('subject_id')->nullable();
                $table->unsignedBigInteger('section_id')->nullable()->index(); // lets a Coordinator read only their section's trail
                $table->json('details')->nullable();
                $table->timestamp('created_at')->nullable()->index();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('coordinator_assignments');
        Schema::dropIfExists('activity_logs');
    }
};
