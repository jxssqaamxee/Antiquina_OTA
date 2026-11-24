<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Course;
use App\Models\DutyEntry;
use App\Models\HostClient;
use App\Models\Section;
use App\Models\User;
use App\Services\Academic\AcademicSeeder;
use App\Services\Academic\CoordinatorAssignmentService;
use App\Services\Auth\SessionLogin;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Live duty board (today's entries + host client, scoped) and the self-renewing "Keep this session open" sign-in. */
class LiveDutyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        AcademicSeeder::run();
    }

    private function staff(string $role, string $id): User
    {
        return User::factory()->create(['role' => $role, 'admin_id' => $id, 'student_id' => null, 'course' => null, 'email_verified_at' => now()]);
    }

    private function section(string $label): Section
    {
        return Section::create(['course_id' => Course::where('code', 'BSIT')->value('id'), 'academic_year_id' => AcademicYear::current()->id, 'year_level' => 4, 'label' => $label]);
    }

    private function student(string $sid, Section $s): User
    {
        $u = User::factory()->create(['student_id' => $sid, 'email_verified_at' => now()]);
        $u->enrollments()->create(['course_id' => Course::where('code', 'BSIT')->value('id'), 'academic_year_id' => AcademicYear::current()->id,
            'section_id' => $s->id, 'year_level' => 4, 'status' => 'active']);

        return $u;
    }

    private function logToday(User $u, string $host): void
    {
        $client = HostClient::create(['user_id' => $u->id, 'client_uid' => 'c'.$u->id, 'name' => $host, 'name_key' => strtolower($host), 'type' => 'custom', 'days' => [1, 2, 3, 4, 5, 6, 7], 'time_in' => '08:00', 'time_out' => '17:00']);
        DutyEntry::create(['user_id' => $u->id, 'entry_uid' => 'e'.$u->id, 'duty_date' => now(config('occ.timezone'))->toDateString(), 'host_client_id' => $client->id,
            'category' => 'regular', 'coverage' => 'full', 'am_in' => '08:00', 'am_out' => '12:00', 'pm_in' => '13:00', 'pm_out' => '17:00', 'hours' => 8, 'task' => 'x']);
    }

    public function test_coordinator_live_board_is_limited_to_their_section_and_shows_the_host(): void
    {
        $a = $this->section('A');
        $b = $this->section('B');
        $mine = $this->student('2024-1-00001', $a);
        $theirs = $this->student('2024-1-00002', $b);
        $this->logToday($mine, 'City Hall');
        $this->logToday($theirs, 'Other Office');
        $c = $this->staff('coordinator', 'COORD-001');
        app(CoordinatorAssignmentService::class)->assign($this->staff('admin', 'ADMIN-001'), $c, $a);

        $res = $this->signedIn($c)->getJson('/api/coordinator/live')->assertOk();
        $this->assertSame([$mine->id], collect($res->json('trainees'))->pluck('user_id')->all());
        $res->assertJsonPath('trainees.0.entries.0.host', 'City Hall')->assertJsonPath('trainees.0.entries.0.amIn', '08:00');
    }

    public function test_admin_sees_everyone_and_other_roles_are_refused(): void
    {
        $a = $this->section('A');
        $this->logToday($this->student('2024-1-00001', $a), 'City Hall');
        $this->logToday($this->student('2024-1-00002', $a), 'Other Office');

        $this->signedIn($this->staff('admin', 'ADMIN-001'))->getJson('/api/admin/live')->assertOk()->assertJsonCount(2, 'trainees');
        $this->signedIn($this->staff('coordinator', 'COORD-001'))->getJson('/api/admin/live')->assertForbidden();
        $this->signedIn($this->student('2024-1-00003', $a))->getJson('/api/coordinator/live')->assertForbidden();
    }

    public function test_unassigned_coordinator_gets_an_empty_board(): void
    {
        $this->logToday($this->student('2024-1-00001', $this->section('A')), 'City Hall');
        $this->signedIn($this->staff('coordinator', 'COORD-001'))->getJson('/api/coordinator/live')->assertOk()->assertJsonCount(0, 'trainees');
    }

    public function test_remembered_session_renews_itself_but_a_normal_one_does_not(): void
    {
        $u = User::factory()->create(['student_id' => '2024-1-00031', 'email_verified_at' => now()]);
        $soon = now()->addDays(3)->getTimestamp();

        $this->actingAs($u)->withSession([SessionLogin::EXPIRES_KEY => $soon, SessionLogin::REMEMBER_KEY => true])->getJson('/api/me')->assertOk();
        $this->assertGreaterThan(now()->addDays(25)->getTimestamp(), session(SessionLogin::EXPIRES_KEY));

        $this->actingAs($u)->withSession([SessionLogin::EXPIRES_KEY => $soon, SessionLogin::REMEMBER_KEY => false])->getJson('/api/me')->assertOk();
        $this->assertSame($soon, session(SessionLogin::EXPIRES_KEY));
    }
}
