<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Course;
use App\Models\DutyEntry;
use App\Models\Section;
use App\Models\User;
use App\Models\UserNotification;
use App\Services\Academic\AcademicSeeder;
use App\Services\Academic\CoordinatorAssignmentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Phase 7: scoped reports/exports, announcements as server notifications, audit viewer. */
class ReportsAnnouncementsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $coord;
    private User $mine;
    private User $theirs;
    private Section $secA;
    private Section $secB;

    protected function setUp(): void
    {
        parent::setUp();
        AcademicSeeder::run();
        $mk = fn ($role, $id) => User::factory()->create(['role' => $role, 'staff_id' => $id, 'student_id' => null, 'course' => null, 'email_verified_at' => now()]);
        $this->admin = $mk('admin', 'ADMIN-001');
        $this->coord = $mk('coordinator', 'COORD-001');
        $cid = Course::where('code', 'BSIT')->value('id');
        $yid = AcademicYear::current()->id;
        $this->secA = Section::create(['course_id' => $cid, 'academic_year_id' => $yid, 'year_level' => 4, 'label' => 'A']);
        $this->secB = Section::create(['course_id' => $cid, 'academic_year_id' => $yid, 'year_level' => 4, 'label' => 'B']);
        $this->mine = User::factory()->create(['student_id' => '2024-1-00001', 'email_verified_at' => now()]);
        $this->theirs = User::factory()->create(['student_id' => '2024-1-00002', 'email_verified_at' => now()]);
        foreach ([[$this->mine, $this->secA], [$this->theirs, $this->secB]] as [$u, $s]) {
            $u->enrollments()->create(['course_id' => $cid, 'academic_year_id' => $yid, 'section_id' => $s->id, 'year_level' => 4, 'status' => 'active']);
        }
        app(CoordinatorAssignmentService::class)->assign($this->admin, $this->coord, $this->secA);
    }

    private function entry(User $u, string $status, float $hours, ?float $verified = null): void
    {
        DutyEntry::create([
            'user_id' => $u->id, 'entry_uid' => 'e'.uniqid(), 'duty_date' => '2026-11-10', 'category' => 'regular', 'hours' => $hours,
            'status' => $status, 'verified_hours' => $verified,
        ]);
    }

    public function test_report_counts_only_approved_as_verified(): void
    {
        $this->entry($this->mine, 'approved', 8, 7.5);
        $this->entry($this->mine, 'submitted', 8);
        $this->entry($this->mine, 'draft', 8);
        $row = $this->signedIn($this->admin)->getJson('/api/admin/reports/trainees?section_id='.$this->secA->id)->assertOk()->json('rows.0');
        $this->assertEquals(7.5, $row['verified']);
        $this->assertEquals(8, $row['pending']);
        $this->assertSame(486, $row['required']);
    }

    public function test_coordinator_report_and_export_are_pinned_to_own_section(): void
    {
        // Tampering with filters must not widen scope.
        $r = $this->signedIn($this->coord)->getJson('/api/coordinator/reports/trainees?section_id='.$this->secB->id.'&course_id=999')->assertOk();
        $this->assertSame(['2024-1-00001'], collect($r->json('rows'))->pluck('student_id')->all());
        $csv = $this->signedIn($this->coord)->get('/api/coordinator/reports/trainees.csv?section_id='.$this->secB->id)->assertOk()->getContent();
        $this->assertStringContainsString('2024-1-00001', $csv);
        $this->assertStringNotContainsString('2024-1-00002', $csv);
        $this->assertDatabaseHas('activity_logs', ['action' => 'report.exported']);
    }

    public function test_csv_neutralises_formula_cells(): void
    {
        $this->mine->forceFill(['first_name' => '=HYPERLINK("x")'])->save();
        $csv = $this->signedIn($this->admin)->get('/api/admin/reports/trainees.csv')->getContent();
        $this->assertStringContainsString("'=HYPERLINK", $csv);
    }

    public function test_reports_are_closed_to_trainees_and_other_staff(): void
    {
        $this->signedIn($this->mine)->getJson('/api/admin/reports/trainees')->assertForbidden();
        $this->signedIn($this->mine)->getJson('/api/coordinator/reports/trainees')->assertForbidden();
        $this->signedIn($this->coord)->getJson('/api/admin/reports/trainees')->assertForbidden();
        $this->signedIn($this->admin)->getJson('/api/coordinator/reports/trainees')->assertForbidden();
    }

    public function test_admin_announcement_reaches_the_audience_as_a_server_notification_that_survives_sync(): void
    {
        $this->signedIn($this->admin)->postJson('/api/admin/announcements', ['audience_type' => 'section', 'section_id' => $this->secA->id, 'title' => 'Orientation', 'body' => 'Friday 8am'])
            ->assertCreated()->assertJsonPath('announcement.recipient_count', 1);
        $this->assertDatabaseHas('user_notifications', ['user_id' => $this->mine->id, 'title' => 'Orientation', 'source' => 'server']);
        $this->assertDatabaseMissing('user_notifications', ['user_id' => $this->theirs->id, 'title' => 'Orientation']);
        $this->assertDatabaseHas('announcement_recipients', ['user_id' => $this->mine->id]);

        $this->signedIn($this->admin)->postJson('/api/admin/announcements', ['audience_type' => 'all', 'title' => 'Holiday', 'body' => 'No duty Monday'])->assertJsonPath('announcement.recipient_count', 2);
        $this->assertSame(2, UserNotification::where('user_id', $this->mine->id)->where('source', 'server')->count());
    }

    public function test_coordinator_can_only_announce_to_own_section(): void
    {
        $this->signedIn($this->coord)->postJson('/api/coordinator/announcements', ['audience_type' => 'section', 'section_id' => $this->secB->id, 'title' => 'Hello', 'body' => 'Welcome'])->assertNotFound();
        $this->signedIn($this->coord)->postJson('/api/coordinator/announcements', ['audience_type' => 'all', 'title' => 'Hello', 'body' => 'Welcome'])->assertNotFound();
        $this->signedIn($this->coord)->postJson('/api/coordinator/announcements', ['audience_type' => 'section', 'section_id' => $this->secA->id, 'title' => 'Hello', 'body' => 'Welcome'])->assertCreated();
        $this->assertDatabaseMissing('user_notifications', ['user_id' => $this->theirs->id, 'title' => 'Hello']);
    }

    public function test_activity_viewer_names_actors_and_coordinator_sees_only_own_section(): void
    {
        $this->signedIn($this->admin)->postJson('/api/admin/announcements', ['audience_type' => 'section', 'section_id' => $this->secB->id, 'title' => 'B only', 'body' => 'Section B'])->assertCreated();
        $admin = $this->signedIn($this->admin)->getJson('/api/admin/activity?action=announcement.')->assertOk()->json();
        $this->assertSame($this->admin->fullName(), $admin[0]['actor']);
        $mine = $this->signedIn($this->coord)->getJson('/api/coordinator/activity?action=announcement.')->assertOk()->json();
        $this->assertSame([], $mine); // the B announcement is outside the Coordinator's section
    }
}
