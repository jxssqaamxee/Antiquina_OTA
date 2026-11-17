<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Real per-user tables behind /api/sync. */
    public function up(): void
    {
        // One row per user: logbook header, last client, theme, onboarding + reminder flags, milestones.
        if (! Schema::hasTable('user_settings')) {
            Schema::create('user_settings', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
                $table->string('student_name', 120)->nullable();
                $table->unsignedSmallInteger('target_hours')->default(486);
                $table->string('last_client_uid', 32)->nullable();
                $table->string('theme', 16)->nullable();
                $table->boolean('onboarding_seen')->nullable();      // null = never saved
                $table->date('shift_reminder_date')->nullable();     // last day the shift reminder fired
                $table->json('milestones')->nullable();              // null = never saved
                $table->timestamp('logbook_saved_at')->nullable();   // null = logbook never saved
                $table->timestamp('notifications_saved_at')->nullable();
                $table->timestamp('legacy_imported_at')->nullable(); // set once user_documents was copied over

                // Sync revision per document (server-authoritative; used by PUT /api/sync/{key}).
                // *_save_id = the client's id of the last accepted save, so a repeated keepalive save is idempotent.
                $table->unsignedInteger('logbook_revision')->default(0);
                $table->string('logbook_save_id', 36)->nullable();
                $table->unsignedInteger('milestones_revision')->default(0);
                $table->string('milestones_save_id', 36)->nullable();
                $table->unsignedInteger('reminder_revision')->default(0);
                $table->string('reminder_save_id', 36)->nullable();
                $table->unsignedInteger('onboarding_revision')->default(0);
                $table->string('onboarding_save_id', 36)->nullable();
                $table->unsignedInteger('notifications_revision')->default(0);
                $table->string('notifications_save_id', 36)->nullable();

                $table->timestamps();
            });
        }

        // Host agencies / clients: public, private or custom schedule.
        if (! Schema::hasTable('host_clients')) {
            Schema::create('host_clients', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->string('client_uid', 32);                    // the id the app generated
                $table->string('name', 80);
                $table->string('name_key', 80);                      // lower-cased name: unique per user
                $table->string('type', 10)->default('custom');       // public | private | custom
                $table->json('days');                                // [1..7], 1 = Monday
                $table->string('time_in', 5);
                $table->string('time_out', 5);
                $table->unsignedSmallInteger('position')->default(0);
                $table->timestamps();
                $table->unique(['user_id', 'client_uid']);
                $table->unique(['user_id', 'name_key']);
            });
        }

        // Duty days. hours is always computed on the server from the time ranges.
        if (! Schema::hasTable('duty_entries')) {
            Schema::create('duty_entries', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->string('entry_uid', 32);
                $table->date('duty_date')->index();
                $table->foreignId('host_client_id')->nullable()->constrained('host_clients')->nullOnDelete();
                $table->string('category', 10)->default('regular');  // regular | evening | overtime
                $table->string('coverage', 8)->default('full');      // full = whole day, am, pm, ev, pmev
                $table->string('am_in', 5)->nullable();
                $table->string('am_out', 5)->nullable();
                $table->string('pm_in', 5)->nullable();
                $table->string('pm_out', 5)->nullable();
                $table->string('ev_in', 5)->nullable();
                $table->string('ev_out', 5)->nullable();
                $table->decimal('hours', 6, 2);
                $table->string('task', 500)->default('');
                $table->timestamps();
                $table->unique(['user_id', 'entry_uid']);
                $table->index(['user_id', 'duty_date']);
            });
        }

        // Notification (bell) history, one row per notification per user.
        if (! Schema::hasTable('user_notifications')) {
            Schema::create('user_notifications', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->string('notif_uid', 32);
                $table->string('type', 24)->default('info');
                $table->string('title', 160);
                $table->string('message', 500)->default('');
                $table->boolean('is_read')->default(false);
                $table->timestamp('notified_at')->nullable();
                $table->unsignedSmallInteger('position')->default(0);
                $table->timestamps();
                $table->unique(['user_id', 'notif_uid']);
                $table->index(['user_id', 'is_read']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('user_notifications');
        Schema::dropIfExists('duty_entries');
        Schema::dropIfExists('host_clients');
        Schema::dropIfExists('user_settings');
    }
};
