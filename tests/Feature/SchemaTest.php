<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Pins the clean create-only schema (no Google columns, no token table, revision columns present). */
class SchemaTest extends TestCase
{
    use RefreshDatabase;

    public function test_expected_tables_exist_and_dropped_ones_do_not(): void
    {
        foreach (['users', 'password_reset_tokens', 'sessions', 'user_documents', 'user_settings', 'host_clients',
            'duty_entries', 'user_notifications', 'user_photos', 'push_subscriptions', 'push_reminder_logs', 'courses', 'academic_years', 'sections', 'student_enrollments', 'coordinator_assignments', 'activity_logs', 'enrollment_progressions', 'duty_entry_reviews', 'training_hour_exceptions', 'host_establishments', 'trainee_placements', 'announcements', 'announcement_recipients'] as $table) {
            $this->assertTrue(Schema::hasTable($table), "missing table $table");
        }
        $this->assertFalse(Schema::hasTable('personal_access_tokens'));
    }

    public function test_users_table_has_no_google_columns_but_keeps_profile_photo(): void
    {
        $this->assertFalse(Schema::hasColumn('users', 'google_id'));
        $this->assertFalse(Schema::hasColumn('users', 'avatar'));
        $this->assertTrue(Schema::hasColumn('users', 'profile_photo'));
    }

    public function test_user_settings_has_a_revision_and_save_id_per_synced_document(): void
    {
        foreach (['logbook', 'milestones', 'reminder', 'onboarding', 'notifications'] as $doc) {
            $this->assertTrue(Schema::hasColumn('user_settings', "{$doc}_revision"), "{$doc}_revision");
            $this->assertTrue(Schema::hasColumn('user_settings', "{$doc}_save_id"), "{$doc}_save_id");
        }
    }
}
