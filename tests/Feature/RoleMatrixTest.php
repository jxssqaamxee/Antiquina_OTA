<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Course;
use App\Models\DutyEntry;
use App\Models\HostEstablishment;
use App\Models\Section;
use App\Models\TraineePlacement;
use App\Models\User;
use App\Services\Academic\AcademicSeeder;
use App\Services\Academic\CoordinatorAssignmentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Phase 5: role-by-role matrix for the cross-section cases (coordinator A vs section B). */
class RoleMatrixTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $coordA;
    private User $coordB;
    private User $traineeA;
    private User $traineeB;
    private Section $secA;
    private Section $secB;

    protected function setUp(): void
    {
        parent::setUp();
        AcademicSeeder::run();
        $mk = fn (string $role, string $id) => User::factory()->create(['role' => $role, 'admin_id' => $id, 'student_id' => null, 'course' => null, 'email_verified_at' => now()]);
        $this->admin = $mk('admin', 'ADMIN-001');
        $this->coordA = $mk('coordinator', 'COORD-001');
        $this->coordB = $mk('coordinator', 'COORD-002');
        $course = Course::where('code', 'BSIT')->value('id');
        $year = AcademicYear::current()->id;
        $this->secA = Section::create(['course_id' => $course, 'academic_year_id' => $year, 'year_level' => 4, 'label' => 'A']);
        $this->secB = Section::create(['course_id' => $course, 'academic_year_id' => $year, 'year_level' => 4, 'label' => 'B']);
        $this->traineeA = $this->trainee('2024-1-00001', $this->secA);
        $this->traineeB = $this->trainee('2024-1-00002', $this->secB);
        $svc = app(CoordinatorAssignmentService::class);
        $svc->assign($this->admin, $this->coordA, $this->secA);
        $svc->assign($this->admin, $this->coordB, $this->secB);
    }

    private function trainee(string $sid, Section $s): User
    {
        $u = User::factory()->create(['student_id' => $sid, 'email_verified_at' => now()]);
        $u->enrollments()->create(['course_id' => $s->course_id, 'academic_year_id' => $s->academic_year_id, 'section_id' => $s->id, 'year_level' => 4, 'status' => 'active']);

        return $u;
    }

    private function submittedEntryOf(User $t): DutyEntry
    {
        $e = ['id' => 'e1', 'date' => '2026-01-05', 'client' => null, 'category' => 'regular', 'amIn' => '08:00', 'amOut' => '12:00',
            'pmIn' => '13:00', 'pmOut' => '17:00', 'evIn' => '', 'evOut' => '', 'hours' => 8, 'task' => 'Filing'];
        $doc = ['studentName' => 'X Y', 'targetHours' => 486, 'lastClientId' => null, 'clients' => [], 'entries' => [$e]];
        $this->signedIn($t)->putJson('/api/sync/logbook-v2', ['value' => $doc])->assertOk();
        $this->signedIn($t)->postJson('/api/logbook/entries/e1/submit')->assertOk();

        return DutyEntry::where('user_id', $t->id)->where('entry_uid', 'e1')->firstOrFail();
    }

    public function test_coordinator_cannot_review_or_read_another_sections_entries(): void
    {
        $entry = $this->submittedEntryOf($this->traineeB);
        $this->signedIn($this->coordA)->postJson("/api/coordinator/entries/{$entry->id}/approve")->assertNotFound();
        $this->signedIn($this->coordA)->postJson("/api/coordinator/entries/{$entry->id}/reject", ['reason' => 'not valid'])->assertNotFound();
        $this->signedIn($this->coordA)->getJson("/api/coordinator/trainees/{$this->traineeB->id}/entries")->assertNotFound();
        $this->assertSame('submitted', $entry->fresh()->status);
        $ids = collect($this->signedIn($this->coordA)->getJson('/api/coordinator/approvals')->json('entries') ?? $this->signedIn($this->coordA)->getJson('/api/coordinator/approvals')->json())->flatten()->all();
        $this->assertNotContains($entry->id, $ids);
        // the right coordinator can
        $this->signedIn($this->coordB)->postJson("/api/coordinator/entries/{$entry->id}/approve")->assertOk();
    }

    public function test_coordinator_cannot_delete_another_sections_roster_row(): void
    {
        DB::table('enrolled_students')->insert(['student_id' => '2024-1-00077', 'course_id' => $this->secB->course_id, 'section_id' => $this->secB->id, 'created_at' => now(), 'updated_at' => now()]);
        $this->signedIn($this->coordA)->deleteJson('/api/coordinator/roster/2024-1-00077')->assertNotFound();
        $this->assertSame(1, DB::table('enrolled_students')->where('student_id', '2024-1-00077')->where('section_id', $this->secB->id)->count());
    }

    public function test_coordinator_roster_import_lands_only_in_own_section_even_with_a_section_field(): void
    {
        $csv = UploadedFile::fake()->createWithContent('r.csv', "student_id,course\n2024-1-00088,BSIT\n");
        $this->signedIn($this->coordA)->post('/api/coordinator/roster/import', ['file' => $csv, 'section_id' => $this->secB->id, 'assume_course' => true], ['Accept' => 'application/json']);
        $this->assertSame(0, DB::table('enrolled_students')->where('section_id', $this->secB->id)->where('student_id', '2024-1-00088')->count());
    }

    public function test_coordinator_cannot_announce_to_another_section_course_or_everyone(): void
    {
        $base = ['title' => 'Hello', 'body' => 'Body text'];
        $this->signedIn($this->coordA)->postJson('/api/coordinator/announcements', $base + ['audience_type' => 'section', 'section_id' => $this->secB->id])->assertNotFound();
        $this->signedIn($this->coordA)->postJson('/api/coordinator/announcements', $base + ['audience_type' => 'all'])->assertNotFound();
        $this->signedIn($this->coordA)->postJson('/api/coordinator/announcements', $base + ['audience_type' => 'course', 'course_id' => $this->secA->course_id])->assertNotFound();
        $this->signedIn($this->coordA)->postJson('/api/coordinator/announcements', $base + ['audience_type' => 'section', 'section_id' => $this->secA->id])->assertCreated();
    }

    public function test_coordinator_cannot_place_or_end_placement_outside_section(): void
    {
        $est = HostEstablishment::create(['name' => 'Acme', 'is_active' => true, 'section_id' => null, 'created_by' => $this->admin->id]);
        $payload = ['establishment_id' => $est->id, 'days' => [1, 2], 'time_in' => '08:00', 'time_out' => '17:00'];
        $this->signedIn($this->coordA)->postJson("/api/coordinator/trainees/{$this->traineeB->id}/placements", $payload)->assertNotFound();
        $this->assertSame(0, TraineePlacement::where('user_id', $this->traineeB->id)->count());

        $this->signedIn($this->coordB)->postJson("/api/coordinator/trainees/{$this->traineeB->id}/placements", $payload)->assertCreated();
        $pid = TraineePlacement::where('user_id', $this->traineeB->id)->value('id');
        $this->signedIn($this->coordA)->deleteJson("/api/coordinator/placements/{$pid}")->assertNotFound();
        $this->assertNull(TraineePlacement::find($pid)->ended_on ?? null);
    }

    public function test_coordinator_cannot_use_a_section_bound_establishment_of_another_section(): void
    {
        $est = HostEstablishment::create(['name' => 'B only', 'is_active' => true, 'section_id' => $this->secB->id, 'created_by' => $this->coordB->id]);
        $this->signedIn($this->coordA)->postJson("/api/coordinator/trainees/{$this->traineeA->id}/placements",
            ['establishment_id' => $est->id, 'days' => [1], 'time_in' => '08:00', 'time_out' => '17:00'])->assertNotFound();
    }

    public function test_coordinator_cannot_read_another_sections_trainee_photo_or_registration(): void
    {
        $this->signedIn($this->coordA)->get("/api/coordinator/trainees/{$this->traineeB->id}/photo")->assertNotFound();
        $this->signedIn($this->coordA)->postJson("/api/coordinator/registrations/{$this->traineeB->id}/approve")->assertNotFound();
    }

    public function test_user_cannot_change_role_or_id_through_profile_endpoints(): void
    {
        foreach ([$this->coordA, $this->traineeA] as $u) {
            $u->refresh(); $before = [$u->role, $u->student_id, $u->admin_id];
            $this->signedIn($u)->putJson('/api/profile', ['role' => 'admin', 'admin_id' => 'ADMIN-999', 'student_id' => '2024-1-99999', 'id' => $this->admin->id]);
            $u->refresh();
            $this->assertSame($before, [$u->role, $u->student_id, $u->admin_id]);
        }
    }

    public function test_trainee_cannot_touch_another_trainees_entries_or_media(): void
    {
        $entry = $this->submittedEntryOf($this->traineeB);
        $this->signedIn($this->traineeA)->postJson('/api/logbook/entries/e1/submit')->assertStatus(422); // A has no entry 'e1'
        $this->assertSame('submitted', $entry->fresh()->status);
        $this->signedIn($this->traineeA)->getJson("/api/coordinator/trainees/{$this->traineeB->id}")->assertForbidden();
        $this->signedIn($this->traineeA)->getJson("/api/admin/trainees/{$this->traineeB->id}/photo")->assertForbidden();
    }

    public function test_invalid_duty_hours_are_422(): void
    {
        $e = ['id' => 'x1', 'date' => '2026-01-05', 'client' => null, 'category' => 'regular', 'amIn' => '12:00', 'amOut' => '08:00',
            'pmIn' => '', 'pmOut' => '', 'evIn' => '', 'evOut' => '', 'hours' => 99, 'task' => 'x'];
        $doc = ['studentName' => 'X Y', 'targetHours' => 486, 'lastClientId' => null, 'clients' => [], 'entries' => [$e]];
        $this->signedIn($this->traineeA)->putJson('/api/sync/logbook-v2', ['value' => $doc])->assertStatus(422);
    }
}
