<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Course;
use App\Models\Section;
use App\Models\User;
use App\Models\UserNotification;
use App\Services\Academic\AcademicSeeder;
use App\Services\Academic\CoordinatorAssignmentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** The trainee Announcements page (was HTTP 500: sections has no `code` column) and live refresh of server notices. */
class TraineeAnnouncementsLiveTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $coord;
    private User $mine;
    private Section $sec;

    protected function setUp(): void
    {
        parent::setUp();
        AcademicSeeder::run();
        $mk = fn ($role, $id) => User::factory()->create(['role' => $role, 'admin_id' => $id, 'student_id' => null, 'course' => null, 'email_verified_at' => now()]);
        $this->admin = $mk('admin', 'ADMIN-001');
        $this->coord = $mk('coordinator', 'COORD-001');
        $cid = Course::where('code', 'BSIT')->value('id');
        $yid = AcademicYear::current()->id;
        $this->sec = Section::create(['course_id' => $cid, 'academic_year_id' => $yid, 'year_level' => 4, 'label' => 'A']);
        $this->mine = User::factory()->create(['student_id' => '2024-1-00001', 'email_verified_at' => now()]);
        $this->mine->enrollments()->create(['course_id' => $cid, 'academic_year_id' => $yid, 'section_id' => $this->sec->id, 'year_level' => 4, 'status' => 'active']);
        app(CoordinatorAssignmentService::class)->assign($this->admin, $this->coord, $this->sec);
    }

    private function publish(string $title = 'Orientation'): void
    {
        $this->signedIn($this->coord)->postJson('/api/coordinator/announcements', ['audience_type' => 'section', 'section_id' => $this->sec->id, 'title' => $title, 'body' => 'Friday 8am'])->assertCreated();
    }

    public function test_trainee_announcements_page_loads_with_the_section_code(): void
    {
        $this->signedIn($this->mine)->getJson('/api/announcements/mine')->assertOk()->assertJsonPath('announcements', []);

        $this->publish();
        $this->signedIn($this->mine)->getJson('/api/announcements/mine')->assertOk()
            ->assertJsonPath('announcements.0.title', 'Orientation')
            ->assertJsonPath('announcements.0.section', 'BSIT-4A')
            ->assertJsonPath('announcements.0.from_role', 'coordinator');
    }

    public function test_announcement_notice_is_in_sync_even_if_the_trainee_never_saved_notifications_and_moves_the_revision(): void
    {
        $this->signedIn($this->mine)->getJson('/api/sync/revisions')->assertOk()->assertJsonMissingPath('revisions.notifications-v1');

        $this->publish();

        $rev = $this->signedIn($this->mine)->getJson('/api/sync/revisions')->assertOk()->json('revisions.notifications-v1');
        $this->assertGreaterThan(0, $rev);
        $doc = $this->signedIn($this->mine)->getJson('/api/sync')->assertOk()->json('documents.notifications-v1');
        $this->assertSame('announcement', $doc[0]['type']);
        $this->assertFalse($doc[0]['read']);

        // A second announcement moves the number again: that is what the app polls for.
        $this->publish('Holiday');
        $this->assertGreaterThan($rev, $this->signedIn($this->mine)->getJson('/api/sync/revisions')->json('revisions.notifications-v1'));
    }

    public function test_marking_the_announcement_notice_read_is_saved_and_the_notice_survives(): void
    {
        $this->publish();
        $sync = $this->signedIn($this->mine)->getJson('/api/sync')->assertOk();
        $doc = $sync->json('documents.notifications-v1');
        $doc[0]['read'] = true;

        $this->signedIn($this->mine)->putJson('/api/sync/notifications-v1', ['value' => $doc, 'base_revision' => $sync->json('revisions.notifications-v1')])->assertOk();

        $this->assertTrue((bool) UserNotification::where('user_id', $this->mine->id)->where('type', 'announcement')->value('is_read'));
        $this->assertSame(1, UserNotification::where('user_id', $this->mine->id)->where('source', 'server')->count());
    }

    public function test_revisions_endpoint_is_for_trainees_only(): void
    {
        $this->signedIn($this->admin)->getJson('/api/sync/revisions')->assertForbidden();
        $this->signedIn($this->coord)->getJson('/api/sync/revisions')->assertForbidden();
    }
}
