<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\ActivityLog;
use App\Models\Course;
use App\Models\CoordinatorAssignment;
use App\Models\Section;
use App\Models\User;
use App\Services\Academic\AcademicSeeder;
use App\Services\Academic\CoordinatorAssignmentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Phase 3: coordinator accounts, one-section assignment with history, strict section isolation. */
class CoordinatorScopeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        AcademicSeeder::run();
    }

    private function staff(string $role, string $id): User
    {
        return User::factory()->create(['role' => $role, 'staff_id' => $id, 'student_id' => null, 'course' => null, 'email_verified_at' => now()]);
    }

    private function section(string $label, int $level = 4): Section
    {
        return Section::create(['course_id' => Course::where('code', 'BSIT')->value('id'), 'academic_year_id' => AcademicYear::current()->id, 'year_level' => $level, 'label' => $label]);
    }

    private function student(string $sid, ?Section $s): User
    {
        $u = User::factory()->create(['student_id' => $sid, 'email_verified_at' => now()]);
        $u->enrollments()->create(['course_id' => Course::where('code', 'BSIT')->value('id'), 'academic_year_id' => AcademicYear::current()->id,
            'section_id' => $s?->id, 'year_level' => $s?->year_level, 'status' => $s ? 'active' : 'pending_placement']);

        return $u;
    }

    public function test_admin_creates_a_coordinator_who_is_never_a_trainee(): void
    {
        $a = $this->staff('admin', 'ADMIN-001');
        $this->signedIn($a)->postJson('/api/admin/coordinators', [
            'staff_id' => 'coord-001', 'first_name' => 'Ana', 'last_name' => 'Lim', 'email' => 'ana.lim@example.com',
            'password' => 'Secret-Pass1', 'role' => 'admin',
        ])->assertCreated()->assertJsonPath('coordinator.staff_id', 'COORD-001');
        $this->assertSame('coordinator', User::where('staff_id', 'COORD-001')->value('role'));
        $this->assertDatabaseHas('activity_logs', ['action' => 'coordinator.created']);
    }

    public function test_coordinator_sees_only_their_section(): void
    {
        $a4 = $this->section('A');
        $b4 = $this->section('B');
        $mine = $this->student('2024-1-00001', $a4);
        $theirs = $this->student('2024-1-00002', $b4);
        $this->student('2024-1-00003', null);
        $c = $this->staff('coordinator', 'COORD-001');
        app(CoordinatorAssignmentService::class)->assign($this->staff('admin', 'ADMIN-001'), $c, $a4);

        $this->signedIn($c)->getJson('/api/coordinator/overview')->assertOk()->assertJsonPath('trainees', 1)->assertJsonPath('section.code', 'BSIT-4A');
        $ids = collect($this->signedIn($c)->getJson('/api/coordinator/trainees')->json('trainees'))->pluck('id')->all();
        $this->assertSame([$mine->id], $ids);
        $this->signedIn($c)->getJson("/api/coordinator/trainees/{$mine->id}")->assertOk();
        // COORD: tampering with the id, query string or body never widens scope; out-of-scope = 404
        $this->signedIn($c)->getJson("/api/coordinator/trainees/{$theirs->id}")->assertNotFound();
        $this->signedIn($c)->getJson("/api/coordinator/trainees?section_id={$b4->id}")->assertOk()->assertJsonCount(1, 'trainees');
        $this->signedIn($c)->getJson('/api/coordinator/trainees/999999')->assertNotFound();
    }

    public function test_unassigned_coordinator_sees_nobody(): void
    {
        $this->student('2024-1-00001', $this->section('A'));
        $c = $this->staff('coordinator', 'COORD-001');
        $this->signedIn($c)->getJson('/api/coordinator/trainees')->assertOk()->assertJsonCount(0, 'trainees');
    }

    public function test_reassignment_keeps_history_and_frees_the_old_section(): void
    {
        $admin = $this->staff('admin', 'ADMIN-001');
        $c = $this->staff('coordinator', 'COORD-001');
        $s1 = $this->section('A');
        $s2 = $this->section('B');

        $this->signedIn($admin)->postJson("/api/admin/coordinators/{$c->id}/assign-section", ['section_id' => $s1->id])->assertOk();
        $this->signedIn($admin)->postJson("/api/admin/coordinators/{$c->id}/assign-section", ['section_id' => $s2->id])
            ->assertOk()->assertJsonPath('coordinator.section.code', 'BSIT-4B');

        $this->assertSame(2, CoordinatorAssignment::where('coordinator_id', $c->id)->count());
        $this->assertSame(1, CoordinatorAssignment::open()->count());
        $this->assertSame(1, ActivityLog::where('action', 'coordinator.unassigned')->count());
    }

    public function test_a_new_coordinator_replaces_the_old_one_on_a_section(): void
    {
        $admin = $this->staff('admin', 'ADMIN-001');
        $c1 = $this->staff('coordinator', 'COORD-001');
        $c2 = $this->staff('coordinator', 'COORD-002');
        $s = $this->section('A');
        $svc = app(CoordinatorAssignmentService::class);
        $svc->assign($admin, $c1, $s);
        $svc->assign($admin, $c2, $s);

        $this->assertSame([$c2->id], CoordinatorAssignment::open()->pluck('coordinator_id')->all());
        $this->signedIn($c1)->getJson('/api/coordinator/overview')->assertJsonPath('section', null);
    }

    public function test_database_refuses_two_open_coordinators_on_one_section(): void
    {
        $s = $this->section('A');
        $row = ['section_id' => $s->id, 'started_at' => now()];
        CoordinatorAssignment::create($row + ['coordinator_id' => $this->staff('coordinator', 'COORD-001')->id]);
        $this->expectException(\Illuminate\Database\QueryException::class);
        CoordinatorAssignment::create($row + ['coordinator_id' => $this->staff('coordinator', 'COORD-002')->id]);
    }

    public function test_only_admin_can_manage_coordinators_and_logs_are_append_only(): void
    {
        $c = $this->staff('coordinator', 'COORD-001');
        $t = $this->student('2024-1-00001', null);
        foreach ([$c, $t] as $who) {
            $this->signedIn($who)->getJson('/api/admin/coordinators')->assertForbidden();
            $this->signedIn($who)->postJson("/api/admin/coordinators/{$c->id}/assign-section", ['section_id' => 1])->assertForbidden();
        }
        $this->signedIn($t)->getJson('/api/coordinator/trainees')->assertForbidden();

        $log = ActivityLog::create(['action' => 'x']);
        $this->expectException(\LogicException::class);
        $log->delete();
    }
}
