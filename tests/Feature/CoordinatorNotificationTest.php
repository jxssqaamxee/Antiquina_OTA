<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\CoordinatorAssignment;
use App\Models\Course;
use App\Models\DutyEntry;
use App\Models\Section;
use App\Models\User;
use App\Models\UserNotification;
use App\Services\Academic\AcademicSeeder;
use App\Services\Academic\CoordinatorAssignmentService;
use App\Services\Academic\EnrollmentProgressionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Coordinator bell: every notice reaches ONLY the coordinator who owns that trainee's section, and is readable only by them. */
class CoordinatorNotificationTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Section $a;
    private Section $b;
    private User $cA;
    private User $cB;
    private User $tA;
    private User $tB;

    protected function setUp(): void
    {
        parent::setUp();
        \Illuminate\Support\Facades\Storage::fake(\App\Support\PrivateMedia::DISK);
        AcademicSeeder::run();
        config(['occ.registration_approval' => true]);
        $this->admin = User::factory()->create(['role' => 'admin', 'admin_id' => 'ADMIN-001', 'student_id' => null, 'course' => null, 'email_verified_at' => now()]);
        $this->a = $this->section('A');
        $this->b = $this->section('B');
        $this->cA = $this->coordinator('COORD-A', $this->a);
        $this->cB = $this->coordinator('COORD-B', $this->b);
        $this->tA = $this->trainee('2024-1-00001', $this->a);
        $this->tB = $this->trainee('2024-1-00002', $this->b);
        UserNotification::query()->delete(); // start every test from an empty bell (setup assignments also notify)
    }

    private function section(string $label): Section
    {
        return Section::create(['course_id' => Course::where('code', 'BSIT')->value('id'), 'academic_year_id' => AcademicYear::current()->id, 'year_level' => 4, 'label' => $label]);
    }

    private function coordinator(string $id, ?Section $s): User
    {
        $c = User::factory()->coordinator($id)->create(['email_verified_at' => now()]);
        $s && app(CoordinatorAssignmentService::class)->assign($this->admin, $c, $s);

        return $c;
    }

    private function trainee(string $sid, ?Section $s): User
    {
        $u = User::factory()->create(['student_id' => $sid, 'email_verified_at' => now()]);
        $u->enrollments()->create(['course_id' => Course::where('code', 'BSIT')->value('id'), 'academic_year_id' => AcademicYear::current()->id,
            'section_id' => $s?->id, 'year_level' => $s?->year_level, 'status' => $s ? 'active' : 'pending_placement']);

        return $u;
    }

    private function entry(string $id, string $date = '2026-01-05'): array
    {
        return ['id' => $id, 'date' => $date, 'client' => null, 'category' => 'regular', 'amIn' => '08:00', 'amOut' => '12:00',
            'pmIn' => '13:00', 'pmOut' => '17:00', 'evIn' => '', 'evOut' => '', 'hours' => 8, 'task' => 'Filing'];
    }

    /** The trainee saves the given entries (drafts) through sync, then submits each of them. */
    private function submit(User $t, array $uids, int $firstDay = 5): void
    {
        $entries = array_map(fn ($uid, $i) => $this->entry($uid, '2026-01-'.str_pad((string) ($i + $firstDay), 2, '0', STR_PAD_LEFT)), $uids, array_keys($uids));
        $this->signedIn($t)->putJson('/api/sync/logbook-v2', ['value' => ['studentName' => 'X', 'targetHours' => 486, 'lastClientId' => null, 'clients' => [], 'entries' => $entries]])->assertOk();
        foreach ($uids as $uid) {
            $this->signedIn($t)->postJson("/api/logbook/entries/{$uid}/submit")->assertOk();
        }
    }

    private function bell(User $c): array
    {
        return $this->signedIn($c)->getJson('/api/coordinator/notifications')->assertOk()->json();
    }

    private function register(string $sid, string $last, ?Section $roster): User
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
        $u->markEmailAsVerified();
        app('auth')->guard('web')->logout();

        return $u->fresh();
    }

    public function test_a_submission_notifies_only_the_trainees_own_coordinator(): void
    {
        $this->submit($this->tA, ['a1']);

        $a = $this->bell($this->cA);
        $this->assertSame(1, $a['unread_count']);
        $this->assertSame('entry_submitted', $a['notifications'][0]['type']);
        $this->assertSame('approvals', $a['notifications'][0]['tab']);
        $this->assertStringContainsString('2024-1-00001', $a['notifications'][0]['message']);
        $this->assertSame(0, $this->bell($this->cB)['unread_count']);
        $this->assertSame([], $this->bell($this->cB)['notifications']);

        $this->submit($this->tB, ['b1']);
        $this->assertSame(1, $this->bell($this->cB)['unread_count']);
        $this->assertStringContainsString('2024-1-00002', $this->bell($this->cB)['notifications'][0]['message']);
        $this->assertStringNotContainsString('2024-1-00002', json_encode($this->bell($this->cA))); // A never sees B's trainee
    }

    public function test_more_submissions_from_one_trainee_stay_one_notice_with_a_count_and_reviews_lower_it(): void
    {
        $this->submit($this->tA, ['a1', 'a2', 'a3']);
        $n = $this->bell($this->cA);
        $this->assertCount(1, $n['notifications']);
        $this->assertStringContainsString('3 logbook entries', $n['notifications'][0]['message']);

        $first = DutyEntry::where('entry_uid', 'a1')->firstOrFail();
        $this->signedIn($this->cA)->postJson("/api/coordinator/entries/{$first->id}/approve")->assertOk();
        $this->assertStringContainsString('2 logbook entries', $this->bell($this->cA)['notifications'][0]['message']);

        // The rest in one batch: nothing left waiting, so the notice goes away.
        $ids = DutyEntry::whereIn('entry_uid', ['a2', 'a3'])->pluck('id')->all();
        $this->signedIn($this->cA)->postJson('/api/coordinator/entries/review', ['action' => 'approve', 'ids' => $ids])->assertOk();
        $this->assertSame([], $this->bell($this->cA)['notifications']);
    }

    public function test_a_coordinator_cannot_read_mark_or_delete_another_coordinators_notices(): void
    {
        $this->submit($this->tA, ['a1']);
        $uid = $this->bell($this->cA)['notifications'][0]['id'];

        $this->signedIn($this->cB)->postJson('/api/coordinator/notifications/read', ['ids' => [$uid]])->assertOk()->assertJsonPath('updated', 0);
        $this->assertSame(1, $this->bell($this->cA)['unread_count']);
        $this->signedIn($this->cB)->deleteJson("/api/coordinator/notifications/{$uid}")->assertNotFound();
        $this->signedIn($this->cB)->deleteJson('/api/coordinator/notifications')->assertOk()->assertJsonPath('deleted', 0);
        $this->assertCount(1, $this->bell($this->cA)['notifications']);

        $this->signedIn($this->cA)->postJson('/api/coordinator/notifications/read', ['all' => true])->assertOk()->assertJsonPath('updated', 1);
        $this->assertSame(0, $this->bell($this->cA)['unread_count']);
        $this->signedIn($this->cA)->deleteJson("/api/coordinator/notifications/{$uid}")->assertOk();
        $this->assertSame([], $this->bell($this->cA)['notifications']);
    }

    public function test_only_coordinators_can_open_the_bell_api(): void
    {
        $this->signedIn($this->tA)->getJson('/api/coordinator/notifications')->assertForbidden();
        $this->signedIn($this->admin)->getJson('/api/coordinator/notifications')->assertForbidden();
        $this->app['auth']->guard('web')->logout();
        $this->getJson('/api/coordinator/notifications')->assertUnauthorized();
    }

    public function test_a_registration_notifies_only_the_roster_sections_coordinator_and_clears_when_decided(): void
    {
        $u = $this->register('2024-1-00010', 'Reyes', $this->a);

        $a = $this->bell($this->cA);
        $this->assertSame('registration_pending', $a['notifications'][0]['type']);
        $this->assertSame('registrations', $a['notifications'][0]['tab']);
        $this->assertSame(0, $this->bell($this->cB)['unread_count']);

        $this->signedIn($this->cA)->postJson("/api/coordinator/registrations/{$u->id}/approve")->assertOk();
        $types = array_column($this->bell($this->cA)['notifications'], 'type');
        $this->assertNotContains('registration_pending', $types); // decided: no stale "waiting" notice
        $this->assertContains('trainee_joined', $types);          // and now they are in the section
        $this->assertSame(0, $this->bell($this->cB)['unread_count']);
    }

    public function test_a_registration_decided_by_the_admin_also_clears_the_coordinators_notice(): void
    {
        $u = $this->register('2024-1-00011', 'Cruz', $this->a);
        $this->assertCount(1, $this->bell($this->cA)['notifications']);
        $this->signedIn($this->admin)->postJson("/api/admin/registrations/{$u->id}/reject", ['reason' => 'no'])->assertOk();
        $this->assertSame([], $this->bell($this->cA)['notifications']);
    }

    public function test_registration_with_no_roster_section_notifies_nobody(): void
    {
        $this->register('2024-1-00012', 'Lim', null);
        $this->assertSame(0, UserNotification::count());
    }

    public function test_a_trainee_who_moves_section_stops_appearing_for_the_old_coordinator(): void
    {
        $this->submit($this->tA, ['a1']);
        $this->assertCount(1, $this->bell($this->cA)['notifications']);

        $enrollment = $this->tA->enrollments()->open()->firstOrFail();
        app(EnrollmentProgressionService::class)->transfer($this->admin, $enrollment, $this->b, 'moved');

        $this->assertSame([], $this->bell($this->cA)['notifications']);          // old coordinator: nothing about tA any more
        $b = $this->bell($this->cB);
        $this->assertContains('trainee_joined', array_column($b['notifications'], 'type')); // new coordinator hears about the arrival
    }

    public function test_reassigning_a_coordinator_drops_trainee_notices_of_the_old_section_and_announces_the_change(): void
    {
        $this->submit($this->tA, ['a1']);
        $c = $this->section('C');
        app(CoordinatorAssignmentService::class)->assign($this->admin, $this->cA, $c);

        $a = $this->bell($this->cA);
        $this->assertSame(['section_assigned'], array_column($a['notifications'], 'type'));
        $this->assertStringContainsString('BSIT-4C', $a['notifications'][0]['message']);
        $this->assertStringNotContainsString('2024-1-00001', json_encode($a));

        // Section A has no coordinator now: a new submission reaches nobody, and does not fail.
        $this->submit($this->tA, ['a3'], 20); // different days: the first batch is already locked
        $this->assertSame(0, UserNotification::where('type', 'entry_submitted')->count());
    }

    public function test_displaced_coordinator_is_told_their_section_was_taken(): void
    {
        $this->coordinator('COORD-NEW', null);
        $new = User::where('admin_id', 'COORD-NEW')->firstOrFail();
        app(CoordinatorAssignmentService::class)->assign($this->admin, $new, $this->a);

        $this->assertSame(['section_assigned'], array_column($this->bell($new)['notifications'], 'type'));
        $this->assertSame(['section_released'], array_column($this->bell($this->cA)['notifications'], 'type'));
        $this->assertSame([], $this->bell($this->cB)['notifications']);
    }

    public function test_trainee_bell_and_sync_are_untouched_by_coordinator_notices(): void
    {
        $this->submit($this->tA, ['a1']);
        $first = DutyEntry::where('entry_uid', 'a1')->firstOrFail();
        $this->signedIn($this->cA)->postJson("/api/coordinator/entries/{$first->id}/approve")->assertOk();

        $this->assertSame(1, UserNotification::where('user_id', $this->tA->id)->where('title', 'Entry approved')->count());
        $this->assertSame(0, UserNotification::where('user_id', $this->tA->id)->whereNotNull('subject_user_id')->count());
        $this->assertSame(0, UserNotification::where('user_id', $this->tB->id)->count());
    }
}
