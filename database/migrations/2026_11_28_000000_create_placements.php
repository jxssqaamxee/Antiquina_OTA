<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Phase 5b: host establishments (catalog), trainee placements, and host_clients.placement_id (server-managed schedule). */
    public function up(): void
    {
        if (! Schema::hasTable('host_establishments')) {
            Schema::create('host_establishments', function (Blueprint $table) {
                $table->id();
                $table->string('name', 160);
                $table->string('type', 10)->default('custom');           // public | private | custom
                $table->string('address', 255)->nullable();
                $table->string('supervisor_name', 160)->nullable();
                $table->foreignId('section_id')->nullable()->constrained('sections')->nullOnDelete(); // NULL = global (Admin)
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }
        if (! Schema::hasTable('trainee_placements')) {
            Schema::create('trainee_placements', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->foreignId('establishment_id')->constrained('host_establishments')->restrictOnDelete();
                $table->string('supervisor_name', 160)->nullable();
                $table->json('days');
                $table->string('time_in', 5);
                $table->string('time_out', 5);
                $table->date('starts_on')->nullable();
                $table->foreignId('assigned_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('ended_at')->nullable();
                $table->timestamps();
                $table->index(['user_id', 'ended_at']);
            });
        }
        if (! Schema::hasColumn('host_clients', 'placement_id')) {
            Schema::table('host_clients', function (Blueprint $table) {
                $table->unsignedBigInteger('placement_id')->nullable()->index();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('trainee_placements');
        Schema::dropIfExists('host_establishments');
    }
};
