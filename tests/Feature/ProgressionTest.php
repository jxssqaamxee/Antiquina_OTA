<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Course;
use App\Models\Section;
use App\Models\StudentEnrollment;
use App\Models\User;
use App\Models\UserNotification;
use App\Services\Academic\AcademicSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Phase 4: rollover (dry run + confirm), completion, transfers, server notifications. */
class ProgressionTest extends TestCase
{
    use RefreshDatabase;

    private AcademicYear $old;
    private AcademicYear $new;

    protected function setUp(): void
    {
        parent::setUp();
        AcademicSeeder::run();
        $this->old = AcademicYear::current();
        $this->new = AcademicYear::create(['name' => '2098-2099']);
    }

    private function admin(): User
    {
        return User::factory()->create(['role' => 'admin', 'staff_id' => 'ADMIN-001', 'student_id' => null, 'course' => null, 'email_verified_at' => now()]);
    }

    private function section(AcademicYear $y, int $level, string $label = 'A', string $code = 'BSIT'): Section
    {
        return Section::create(['course_id' => Course::where('code', $code)->value('id'), 'academic_year_id' => $y->id, 'year_level' => $level, 'label' => $label]);
    }

    private function student(string $sid, Section $s, string $status = 'active'): StudentEnrollment
    {
        $u = User::factory()->create(['student_id' => $sid, 'email_verified_at' => now()]);

        return $u->enrollments()->create(['course_id' => $s->course_id, 'academic_year_id' => $s->academic_year_id, 'section_id' => $s->id, 'year_level' => $s->year_level, 'status' => $status]);
    }

    public function test_prepare_is_a_dry_run_and_classifies_students(): void
    {
        $e3 = $this->student('2024-1-00001', $this->section($this->old, 3));
        $e4 = $this->student('2024-1-00002', $this->section($this->old, 4));
        $rep = $this->student('2024-1-00003', $this->section($this->old, 2), 'repeating');
        $before = StudentEnrollment::count();

        $res = $this->signedIn($this->admin())->getJson("/api/admin/academic-years/{$this->new->id}/progression/prepare")->assertOk();
        $by = collect($res->json('proposals'))->keyBy('id');
        $this->assertSame('promote', $by[$e3->id]['kind']);
        $this->assertSame(4, $by[$e3->id]['next_year_level']);
        $this->assertSame('complete', $by[$e4->id]['kind']);
        $this->assertSame('repeat', $by[$rep->id]['kind']);
        $this->assertSame($before, StudentEnrollment::count());
    }

    public function test_confirm_promotes_keeps_history_and_notifies_and_is_idempotent(): void
    {
        $e = $this->student('2024-1-00001', $this->section($this->old, 3));
        $dest = $this->section($this->new, 4);
        $a = $this->admin();
        $payload = ['items' => [['enrollment_id' => $e->id, 'kind' => 'promote', 'section_id' => $dest->id]]];
        $url = "/api/admin/academic-years/{$this->new->id}/progression/confirm";

        $this->signedIn($a)->postJson($url, $payload)->assertOk()->assertJsonPath('confirmed', 1);
        $this->signedIn($a)->postJson($url, $payload)->assertOk()->assertJsonPath('confirmed', 0)->assertJsonPath('skipped', 1);

        $user = $e->user;
        $this->assertSame(2, $user->enrollments()->count());
        $this->assertSame($dest->id, $user->currentEnrollment()->section_id);
        $this->assertSame('completed', $e->fresh()->status);
        $this->assertNotNull($e->fresh()->ended_at);
        $this->assertSame(1, UserNotification::where('user_id', $user->id)->where('source', 'server')->count());
    }

    public function test_fourth_year_completes_without_a_new_enrollment(): void
    {
        $e = $this->student('2024-1-00002', $this->section($this->old, 4));
        $this->signedIn($this->admin())->postJson("/api/admin/academic-years/{$this->new->id}/progression/confirm",
            ['items' => [['enrollment_id' => $e->id, 'kind' => 'complete']]])->assertOk();
        $this->assertSame(1, $e->user->enrollments()->count());
        $this->assertNull($e->user->currentEnrollment());
        $this->assertSame('completed', $e->fresh()->status);
    }

    public function test_wrong_destination_rolls_the_whole_rollover_back(): void
    {
        $e1 = $this->student('2024-1-00001', $this->section($this->old, 3));
        $e2 = $this->student('2024-1-00002', $this->section($this->old, 3, 'B'));
        $ok = $this->section($this->new, 4);
        $bad = $this->section($this->new, 2, 'A'); // wrong year level
        $this->signedIn($this->admin())->postJson("/api/admin/academic-years/{$this->new->id}/progression/confirm", ['items' => [
            ['enrollment_id' => $e1->id, 'kind' => 'promote', 'section_id' => $ok->id],
            ['enrollment_id' => $e2->id, 'kind' => 'promote', 'section_id' => $bad->id],
        ]])->assertStatus(422);
        $this->assertNull($e1->fresh()->ended_at);
        $this->assertSame(1, $e1->user->enrollments()->count());
    }

    public function test_transfer_keeps_the_previous_enrollment_and_updates_course(): void
    {
        $e = $this->student('2024-1-00001', $this->section($this->old, 2));
        $to = $this->section($this->old, 2, 'A', 'BEED');
        $this->signedIn($this->admin())->postJson("/api/admin/enrollments/{$e->id}/transfer", ['section_id' => $to->id, 'reason' => 'Shifted program'])
            ->assertOk()->assertJsonPath('enrollment.section.code', 'BEED-2A');
        $this->assertSame('transferred', $e->fresh()->status);
        $this->assertSame(2, $e->user->enrollments()->count());
        $this->assertStringStartsWith('BEED', $e->user->fresh()->course);
        $this->assertDatabaseHas('activity_logs', ['action' => 'enrollment.transfer']);
    }

    public function test_progression_is_admin_only(): void
    {
        $t = User::factory()->create(['student_id' => '2024-1-00009', 'email_verified_at' => now()]);
        $c = User::factory()->create(['role' => 'coordinator', 'staff_id' => 'C-1', 'student_id' => null, 'course' => null, 'email_verified_at' => now()]);
        $real = $this->student('2024-1-00010', $this->section($this->old, 2));
        foreach ([$t, $c] as $who) {
            $this->signedIn($who)->getJson("/api/admin/academic-years/{$this->new->id}/progression/prepare")->assertForbidden();
            $this->signedIn($who)->postJson("/api/admin/enrollments/{$real->id}/transfer", ['section_id' => 1])->assertForbidden();
        }
    }

    public function test_server_notifications_survive_a_client_notification_push(): void
    {
        $e = $this->student('2024-1-00001', $this->section($this->old, 3));
        $this->signedIn($this->admin())->postJson("/api/admin/academic-years/{$this->new->id}/progression/confirm",
            ['items' => [['enrollment_id' => $e->id, 'kind' => 'promote', 'section_id' => $this->section($this->new, 4)->id]]])->assertOk();

        $u = $e->user;
        $rev = $this->signedIn($u)->getJson('/api/sync')->assertOk()->json('revisions.notifications-v1');
        $res = $this->signedIn($u)->putJson('/api/sync/notifications-v1', ['value' => [], 'base_revision' => $rev]);
        $this->assertContains($res->status(), [200, 409]);
        $this->assertSame(1, UserNotification::where('user_id', $u->id)->where('source', 'server')->count());
    }
}
