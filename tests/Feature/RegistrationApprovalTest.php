<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Course;
use App\Models\CoordinatorAssignment;
use App\Models\Section;
use App\Models\User;
use App\Services\Academic\AcademicSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Phase 2 (F3): self-registration is pending until the roster section's coordinator or an admin approves. */
class RegistrationApprovalTest extends TestCase
{
    use RefreshDatabase;

    private Section $a;

    private Section $b;

    protected function setUp(): void
    {
        parent::setUp();
        \Illuminate\Support\Facades\Storage::fake(\App\Support\PrivateMedia::DISK); // never write test photos into the real storage
        AcademicSeeder::run();
        config(['occ.registration_approval' => true]);
        $this->a = $this->section('A');
        $this->b = $this->section('B');
    }

    private function section(string $label): Section
    {
        return Section::create(['course_id' => Course::where('code', 'BSIT')->value('id'), 'academic_year_id' => AcademicYear::current()->id, 'year_level' => 4, 'label' => $label]);
    }

    private function coordinatorOf(?Section $s, string $id): User
    {
        $c = User::factory()->coordinator($id)->create(['email_verified_at' => now()]);
        if ($s) {
            CoordinatorAssignment::create(['coordinator_id' => $c->id, 'section_id' => $s->id, 'started_at' => now()]);
        }

        return $c;
    }

    /** Registers through the real endpoint, with the Student ID on the given section's roster. */
    private function register(string $sid, string $last, ?Section $roster, bool $verify = true): User
    {
        if ($roster) {
            DB::table('enrolled_students')->insert(['student_id' => $sid, 'course_id' => $roster->course_id, 'section_id' => $roster->id, 'created_at' => now(), 'updated_at' => now()]);
        }
        $this->postJson('/api/auth/register', [
            'student_id' => $sid, 'first_name' => 'Maria', 'last_name' => $last, 'email' => 'occ.'.strtolower($last).'.maria@gmail.com',
            'course' => Course::where('code', 'BSIT')->value('name'), 'password' => 'Secret-Pass1', 'password_confirmation' => 'Secret-Pass1',
            'profile_photo' => UploadedFile::fake()->image('me.jpg', 300, 300),
        ])->assertCreated();
        $u = User::where('student_id', $sid)->firstOrFail();
        $verify && $u->markEmailAsVerified();
        app('auth')->guard('web')->logout();

        return $u->fresh();
    }

    public function test_new_registration_is_pending_not_enrolled_and_blocked_from_the_app(): void
    {
        $u = $this->register('2024-1-00001', 'Reyes', $this->a);
        $this->assertSame('pending', $u->approval_status);
        $this->assertSame(0, $u->enrollments()->count());

        // Pending person can still ask "who am I" (to show a waiting screen) but nothing else.
        $this->signedIn($u)->getJson('/api/me')->assertOk()->assertJsonPath('user.approval_status', 'pending');
        $this->signedIn($u)->getJson('/api/logbook/hours')->assertForbidden()->assertJsonPath('code', 'account_pending');
        $this->signedIn($u)->getJson('/api/sync')->assertForbidden()->assertJsonPath('code', 'account_pending');
    }

    public function test_email_verification_alone_does_not_enroll_a_pending_account(): void
    {
        $u = $this->register('2024-1-00002', 'Cruz', $this->a, verify: false);
        \App\Http\Controllers\Api\EmailVerificationController::enrollWhenVerified($u);
        $this->assertSame(0, $u->enrollments()->count());
    }

    public function test_approval_off_keeps_the_old_behaviour(): void
    {
        config(['occ.registration_approval' => false]);
        $this->assertSame('approved', $this->register('2024-1-00003', 'Lim', $this->a)->approval_status);
    }

    public function test_coordinator_sees_and_approves_only_registrations_of_their_own_section(): void
    {
        $mine = $this->register('2024-1-00010', 'Reyes', $this->a);
        $theirs = $this->register('2024-1-00011', 'Santos', $this->b);
        $coord = $this->coordinatorOf($this->a, 'COORD-A');

        $list = $this->signedIn($coord)->getJson('/api/coordinator/registrations')->assertOk()->json('registrations');
        $this->assertSame([$mine->id], array_column($list, 'id'));

        $this->signedIn($coord)->postJson("/api/coordinator/registrations/{$theirs->id}/approve")->assertNotFound();
        $this->signedIn($coord)->postJson("/api/coordinator/registrations/{$theirs->id}/reject")->assertNotFound();
        $this->assertSame('pending', $theirs->fresh()->approval_status);

        $this->signedIn($coord)->postJson("/api/coordinator/registrations/{$mine->id}/approve")->assertOk();
        $mine->refresh();
        $this->assertSame('approved', $mine->approval_status);
        $this->assertSame($coord->id, (int) $mine->approval_reviewed_by);
        $this->assertSame($this->a->id, $mine->enrollments()->open()->value('section_id'));
        $this->assertDatabaseHas('activity_logs', ['action' => 'registration.approved', 'subject_id' => $mine->id, 'section_id' => $this->a->id, 'actor_id' => $coord->id]);

        // Now a normal trainee: the app opens.
        $this->signedIn($mine)->getJson('/api/logbook/hours')->assertOk();
    }

    public function test_unassigned_coordinator_and_trainees_cannot_use_the_approval_routes(): void
    {
        $u = $this->register('2024-1-00020', 'Reyes', $this->a);
        $none = $this->coordinatorOf(null, 'COORD-NONE');
        $this->signedIn($none)->getJson('/api/coordinator/registrations')->assertOk()->assertJsonPath('registrations', []);
        $this->signedIn($none)->postJson("/api/coordinator/registrations/{$u->id}/approve")->assertNotFound();
        $this->signedIn($none)->getJson("/api/coordinator/registrations/{$u->id}/photo")->assertNotFound();

        $trainee = User::factory()->create(['email_verified_at' => now()]);
        $this->signedIn($trainee)->getJson('/api/coordinator/registrations')->assertForbidden();
        $this->signedIn($trainee)->postJson("/api/admin/registrations/{$u->id}/approve")->assertForbidden();
        $this->assertSame('pending', $u->fresh()->approval_status);
    }

    public function test_rejected_registration_stays_blocked_and_cannot_be_reviewed_twice(): void
    {
        $u = $this->register('2024-1-00030', 'Reyes', $this->a);
        $coord = $this->coordinatorOf($this->a, 'COORD-A');

        $this->signedIn($coord)->postJson("/api/coordinator/registrations/{$u->id}/reject", ['reason' => 'Not my student'])->assertOk();
        $this->assertSame('rejected', $u->fresh()->approval_status);
        $this->assertSame(0, $u->enrollments()->count());
        $this->signedIn($u->fresh())->getJson('/api/logbook/hours')->assertForbidden()->assertJsonPath('code', 'account_rejected');

        // Second decision (approve after reject, or reject again): no longer pending, so 404; exactly one log row.
        $this->signedIn($coord)->postJson("/api/coordinator/registrations/{$u->id}/approve")->assertNotFound();
        $this->assertSame('rejected', $u->fresh()->approval_status);
        $this->assertSame(1, DB::table('activity_logs')->where('subject_id', $u->id)->where('action', 'like', 'registration.%')->count());

        $this->postJson('/api/auth/login', ['student_id' => '2024-1-00030', 'password' => 'Secret-Pass1'])->assertStatus(422);
    }

    public function test_admin_sees_every_pending_registration_and_can_approve_one_without_a_roster_section(): void
    {
        $x = $this->register('2024-1-00040', 'Reyes', $this->a);
        $y = $this->register('2024-1-00041', 'Santos', null);
        $admin = User::factory()->admin()->create(['email_verified_at' => now()]);

        $ids = collect($this->signedIn($admin)->getJson('/api/admin/registrations')->assertOk()->json('registrations'))->pluck('id')->sort()->values()->all();
        $this->assertSame(collect([$x->id, $y->id])->sort()->values()->all(), $ids);

        // A coordinator never sees the roster-less one: only an admin can place it.
        $this->signedIn($this->coordinatorOf($this->a, 'COORD-A'))->postJson("/api/coordinator/registrations/{$y->id}/approve")->assertNotFound();
        $this->signedIn($admin)->postJson("/api/admin/registrations/{$y->id}/approve")->assertOk();
        $this->assertSame('approved', $y->fresh()->approval_status);
        // Roster-less: enrolled as pending placement (the existing admin queue).
        $this->assertSame('pending_placement', $y->enrollments()->open()->value('status'));
    }

    public function test_photo_routes_are_scoped_to_the_coordinators_section(): void
    {
        $mine = $this->register('2024-1-00050', 'Reyes', $this->a);
        $theirs = $this->register('2024-1-00051', 'Santos', $this->b);
        $coord = $this->coordinatorOf($this->a, 'COORD-A');

        $res = $this->signedIn($coord)->get("/api/coordinator/registrations/{$mine->id}/photo")->assertOk();
        $this->assertStringStartsWith('image/', $res->headers->get('Content-Type'));
        $this->assertSame('nosniff', $res->headers->get('X-Content-Type-Options'));
        $this->assertStringContainsString('private', $res->headers->get('Cache-Control'));
        $this->signedIn($coord)->get("/api/coordinator/registrations/{$theirs->id}/photo")->assertNotFound();

        // Enrolled trainees: same rule through CoordinatorAccessService.
        $this->signedIn($coord)->postJson("/api/coordinator/registrations/{$mine->id}/approve")->assertOk();
        $this->signedIn($coord)->get("/api/coordinator/trainees/{$mine->id}/photo")->assertOk();
        $other = $this->coordinatorOf($this->b, 'COORD-B');
        $this->signedIn($other)->get("/api/coordinator/trainees/{$mine->id}/photo")->assertNotFound();
        $this->signedIn($other)->get("/api/coordinator/trainees/999999/photo")->assertNotFound();
    }

    public function test_claiming_an_already_registered_student_id_is_refused_without_naming_the_owner(): void
    {
        $owner = $this->register('2024-1-00060', 'Reyes', $this->a);
        $res = $this->postJson('/api/auth/register', [
            'student_id' => '2024-1-00060', 'first_name' => 'Eve', 'last_name' => 'Mallory', 'email' => 'occ.mallory.eve@gmail.com',
            'course' => Course::where('code', 'BSIT')->value('name'), 'password' => 'Secret-Pass1', 'password_confirmation' => 'Secret-Pass1',
            'profile_photo' => UploadedFile::fake()->image('x.jpg', 300, 300),
        ])->assertStatus(422)->assertJsonValidationErrors('student_id');
        $this->assertStringNotContainsString('Reyes', $res->getContent());
        $this->assertStringNotContainsString($owner->email, $res->getContent());
        $this->assertSame(1, User::where('student_id', '2024-1-00060')->count());
    }

    public function test_a_stale_second_decision_is_refused_by_the_locked_recheck(): void
    {
        $u = $this->register('2024-1-00070', 'Reyes', $this->a);
        $admin = User::factory()->admin()->create(['email_verified_at' => now()]);
        $svc = app(\App\Services\Academic\RegistrationApprovalService::class);

        $stale = User::find($u->id);               // both reviewers loaded the row while it was still pending
        $svc->approve($admin, $u);
        $this->expectException(\Illuminate\Validation\ValidationException::class);
        try {
            $svc->reject($admin, $stale, 'late');
        } finally {
            $this->assertSame('approved', $u->fresh()->approval_status);
            $this->assertSame(1, DB::table('activity_logs')->where('subject_id', $u->id)->where('action', 'like', 'registration.%')->count());
        }
    }

    public function test_pending_list_gives_each_photo_a_version_so_a_changed_picture_is_a_new_address(): void
    {
        $u = $this->register('2024-1-00020', 'Reyes', $this->a);
        $coord = $this->coordinatorOf($this->a, 'COORD-V');

        $row = $this->signedIn($coord)->getJson('/api/coordinator/registrations')->assertOk()->json('registrations.0');
        $this->assertNotEmpty($row['photo_v']);
        $this->assertSame(\App\Support\PrivateMedia::version($u->profile_photo), $row['photo_v']);

        // The photo itself still comes from the database copy, whatever the query string says.
        $this->signedIn($coord)->get("/api/coordinator/registrations/{$u->id}/photo?v={$row['photo_v']}")
            ->assertOk()->assertHeader('Content-Type', 'image/jpeg');
    }
}
