<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Non-destructive repair for a database created by an OLDER version of the migrations.
     * The create migrations skip tables that already exist, so columns added later (sync revisions,
     * save ids, ...) would be missing and /api/sync would answer 500. This adds every missing column
     * and leaves existing data untouched. On a fresh database it does nothing.
     */
    public function up(): void
    {
        $this->add('users', [
            'middle_name' => fn (Blueprint $t) => $t->string('middle_name', 80)->nullable(),
            'profile_photo' => fn (Blueprint $t) => $t->string('profile_photo', 500)->nullable(),
            'email_verified_at' => fn (Blueprint $t) => $t->timestamp('email_verified_at')->nullable(),
            'remember_token' => fn (Blueprint $t) => $t->rememberToken(),
        ]);

        $settings = [
            'student_name' => fn (Blueprint $t) => $t->string('student_name', 120)->nullable(),
            'target_hours' => fn (Blueprint $t) => $t->unsignedSmallInteger('target_hours')->default(486),
            'last_client_uid' => fn (Blueprint $t) => $t->string('last_client_uid', 32)->nullable(),
            'theme' => fn (Blueprint $t) => $t->string('theme', 16)->nullable(),
            'onboarding_seen' => fn (Blueprint $t) => $t->boolean('onboarding_seen')->nullable(),
            'shift_reminder_date' => fn (Blueprint $t) => $t->date('shift_reminder_date')->nullable(),
            'milestones' => fn (Blueprint $t) => $t->json('milestones')->nullable(),
            'logbook_saved_at' => fn (Blueprint $t) => $t->timestamp('logbook_saved_at')->nullable(),
            'notifications_saved_at' => fn (Blueprint $t) => $t->timestamp('notifications_saved_at')->nullable(),
            'legacy_imported_at' => fn (Blueprint $t) => $t->timestamp('legacy_imported_at')->nullable(),
        ];
        foreach (['logbook', 'milestones', 'reminder', 'onboarding', 'notifications'] as $doc) {
            $settings["{$doc}_revision"] = fn (Blueprint $t) => $t->unsignedInteger("{$doc}_revision")->default(0);
            $settings["{$doc}_save_id"] = fn (Blueprint $t) => $t->string("{$doc}_save_id", 36)->nullable();
        }
        $this->add('user_settings', $settings);

        $this->add('host_clients', [
            'client_uid' => fn (Blueprint $t) => $t->string('client_uid', 32)->default(''),
            'name' => fn (Blueprint $t) => $t->string('name', 80)->default(''),
            'name_key' => fn (Blueprint $t) => $t->string('name_key', 80)->default(''),
            'type' => fn (Blueprint $t) => $t->string('type', 10)->default('custom'),
            'days' => fn (Blueprint $t) => $t->json('days')->nullable(),
            'time_in' => fn (Blueprint $t) => $t->string('time_in', 5)->default('08:00'),
            'time_out' => fn (Blueprint $t) => $t->string('time_out', 5)->default('17:00'),
            'position' => fn (Blueprint $t) => $t->unsignedSmallInteger('position')->default(0),
        ]);

        $this->add('duty_entries', [
            'entry_uid' => fn (Blueprint $t) => $t->string('entry_uid', 32)->default(''),
            'duty_date' => fn (Blueprint $t) => $t->date('duty_date')->nullable(),
            'host_client_id' => fn (Blueprint $t) => $t->unsignedBigInteger('host_client_id')->nullable(),
            'category' => fn (Blueprint $t) => $t->string('category', 10)->default('regular'),
            'coverage' => fn (Blueprint $t) => $t->string('coverage', 8)->default('full'),
            'am_in' => fn (Blueprint $t) => $t->string('am_in', 5)->nullable(),
            'am_out' => fn (Blueprint $t) => $t->string('am_out', 5)->nullable(),
            'pm_in' => fn (Blueprint $t) => $t->string('pm_in', 5)->nullable(),
            'pm_out' => fn (Blueprint $t) => $t->string('pm_out', 5)->nullable(),
            'ev_in' => fn (Blueprint $t) => $t->string('ev_in', 5)->nullable(),
            'ev_out' => fn (Blueprint $t) => $t->string('ev_out', 5)->nullable(),
            'hours' => fn (Blueprint $t) => $t->decimal('hours', 6, 2)->default(0),
            'task' => fn (Blueprint $t) => $t->string('task', 500)->default(''),
        ]);

        $this->add('user_notifications', [
            'notif_uid' => fn (Blueprint $t) => $t->string('notif_uid', 32)->default(''),
            'type' => fn (Blueprint $t) => $t->string('type', 24)->default('info'),
            'title' => fn (Blueprint $t) => $t->string('title', 160)->default(''),
            'message' => fn (Blueprint $t) => $t->string('message', 500)->default(''),
            'is_read' => fn (Blueprint $t) => $t->boolean('is_read')->default(false),
            'notified_at' => fn (Blueprint $t) => $t->timestamp('notified_at')->nullable(),
            'position' => fn (Blueprint $t) => $t->unsignedSmallInteger('position')->default(0),
        ]);

        foreach (['user_settings', 'host_clients', 'duty_entries', 'user_notifications', 'user_photos'] as $table) {
            $this->add($table, [
                'created_at' => fn (Blueprint $t) => $t->timestamp('created_at')->nullable(),
                'updated_at' => fn (Blueprint $t) => $t->timestamp('updated_at')->nullable(),
            ]);
        }
    }

    /** @param array<string, callable(Blueprint): mixed> $columns */
    private function add(string $table, array $columns): void
    {
        if (! Schema::hasTable($table)) {
            return;
        }
        $missing = array_filter($columns, fn ($_, $name) => ! Schema::hasColumn($table, $name), ARRAY_FILTER_USE_BOTH);
        if (! $missing) {
            return;
        }
        Schema::table($table, function (Blueprint $t) use ($missing) {
            foreach ($missing as $define) {
                $define($t);
            }
        });
    }

    public function down(): void
    {
        // Intentionally empty: this only repairs older databases.
    }
};
