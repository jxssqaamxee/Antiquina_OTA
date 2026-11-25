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
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Weekly duty timetable: colours (on time / late / very late / overtime / absent), totals and who may open it. */
class TimetableTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        AcademicSeeder::run();
        Carbon::setTestNow(Carbon::parse('2026-11-25 10:00:00', 'Asia/Manila')); // Wednesday; week = Nov 23 - 29
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
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

    private function host(User $u, array $days, string $in = '07:00', string $out = '18:00', string $name = 'Green Cafe', string $type = 'private'): HostClient
    {
        return HostClient::create(['user_id' => $u->id, 'client_uid' => 'c'.$u->id.$name, 'name' => $name, 'name_key' => strtolower($name), 'type' => $type, 'days' => $days, 'time_in' => $in, 'time_out' => $out]);
    }

    private function entry(User $u, HostClient $h, string $date, array $t, float $hours, array $extra = []): DutyEntry
    {
        static $n = 0;

        return DutyEntry::create($extra + ['user_id' => $u->id, 'entry_uid' => 'e'.(++$n), 'duty_date' => $date, 'host_client_id' => $h->id, 'category' => 'regular', 'coverage' => 'full',
            'am_in' => $t[0] ?? null, 'am_out' => $t[1] ?? null, 'pm_in' => $t[2] ?? null, 'pm_out' => $t[3] ?? null, 'hours' => $hours, 'task' => 'x']);
    }

    private function cards(array $json, string $date): array
    {
        return collect($json['days'])->firstWhere('date', $date)['cards'];
    }

    public function test_days_follow_the_host_schedule_and_colours_follow_lateness(): void
    {
        $jessa = $this->student('2024-1-00001', $this->section('A'));
        $h = $this->host($jessa, [1, 2, 3, 4, 5]); // Mon-Fri, 7am-6pm
        $this->entry($jessa, $h, '2026-11-23', ['07:00', '12:00', '13:10', '18:00'], 10.83);  // Mon: on time, then 10 min late
        $this->entry($jessa, $h, '2026-11-24', ['08:00', '12:00'], 4);                         // Tue: half day, 60 min late
        $this->entry($jessa, $h, '2026-11-25', ['07:30', '12:00'], 4.5);                       // Wed: exactly 30 min late = still yellow

        $json = $this->signedIn($jessa)->getJson('/api/logbook/timetable')->assertOk()->json();

        $this->assertSame(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], array_column($json['days'], 'label')); // no Saturday for Jessa
        $this->assertSame(['ontime', 'late'], array_column($this->cards($json, '2026-11-23'), 'state'));
        $this->assertSame(10, $this->cards($json, '2026-11-23')[1]['late_minutes']);
        $this->assertSame(['very_late'], array_column($this->cards($json, '2026-11-24'), 'state'));
        $this->assertSame(60, $this->cards($json, '2026-11-24')[0]['late_minutes']);
        $this->assertSame(['late'], array_column($this->cards($json, '2026-11-25'), 'state'));
        $this->assertSame('Green Cafe', $this->cards($json, '2026-11-23')[0]['host']);
        $this->assertSame('private', $this->cards($json, '2026-11-23')[0]['type']);
        $this->assertSame(['upcoming', 'upcoming'], array_column(array_slice($json['days'], 3), 'status'));
        $this->assertEquals(['ontime' => 1, 'late' => 2, 'very_late' => 1, 'absent' => 0], $json['totals']['counts']);
        $this->assertEquals(['07:00', '12:00'], $json['days'][0]['expected'][0]['am']);
        $this->assertEquals(['13:00', '18:00'], $json['days'][0]['expected'][0]['pm']);
    }

    public function test_a_six_day_host_shows_saturday_and_today_without_entry_is_not_logged_yet(): void
    {
        $jm = $this->student('2024-1-00002', $this->section('A'));
        $this->host($jm, [1, 2, 3, 4, 5, 6]);

        $json = $this->signedIn($jm)->getJson('/api/logbook/timetable')->assertOk()->json();

        $this->assertSame(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], array_column($json['days'], 'label'));
        $this->assertSame(['absent', 'absent', 'not_logged', 'upcoming', 'upcoming', 'upcoming'], array_column($json['days'], 'status'));
        $this->assertSame(2, $json['totals']['counts']['absent']);
        $this->assertTrue($json['days'][2]['is_today']);
    }

    public function test_evening_and_overtime_are_blue_not_late_and_rejected_hours_are_not_counted(): void
    {
        $u = $this->student('2024-1-00003', $this->section('A'));
        $h = $this->host($u, [1, 2, 3, 4, 5]);
        $this->entry($u, $h, '2026-11-23', ['07:00', '12:00'], 5, ['status' => 'approved', 'verified_hours' => 4.5]);
        $this->entry($u, $h, '2026-11-24', [], 3, ['category' => 'evening', 'ev_in' => '19:00', 'ev_out' => '22:00', 'status' => 'submitted']);
        $this->entry($u, $h, '2026-11-25', ['09:00', '12:00'], 3, ['status' => 'rejected', 'review_reason' => 'wrong time']);

        $json = $this->signedIn($u)->getJson('/api/logbook/timetable')->assertOk()->json();

        $this->assertSame(['overtime'], array_column($this->cards($json, '2026-11-24'), 'state'));
        $this->assertSame('ev', $this->cards($json, '2026-11-24')[0]['slot']);
        $this->assertSame('rejected', $this->cards($json, '2026-11-25')[0]['status']);
        $this->assertEquals(['logged' => 8.0, 'verified' => 4.5, 'pending' => 3.0, 'draft' => 0.0, 'rejected' => 3.0], collect($json['totals'])->except('counts')->all());
        $this->assertSame(0, $json['totals']['counts']['very_late']); // the rejected 9am card is not counted
    }

    public function test_week_navigation_and_validation(): void
    {
        $u = $this->student('2024-1-00004', $this->section('A'));
        $this->host($u, [1, 2, 3, 4, 5]);
        $me = $this->signedIn($u);

        $prev = $me->getJson('/api/logbook/timetable?week=2026-11-18')->assertOk()->json('week');
        $this->assertSame('2026-11-16', $prev['start']);
        $this->assertSame('2026-11-22', $prev['end']);
        $this->assertFalse($prev['is_current']);
        $this->assertTrue($me->getJson('/api/logbook/timetable')->json('week.is_current'));
        $me->getJson('/api/logbook/timetable?week=garbage')->assertStatus(422);
    }

    public function test_coordinator_sees_only_their_own_section_and_other_roles_are_refused(): void
    {
        $a = $this->section('A');
        $b = $this->section('B');
        $mine = $this->student('2024-1-00005', $a);
        $theirs = $this->student('2024-1-00006', $b);
        $this->host($mine, [1, 2, 3]);
        $this->host($theirs, [1, 2, 3]);
        $admin = $this->staff('admin', 'ADMIN-001');
        $coord = $this->staff('coordinator', 'COORD-001');
        app(CoordinatorAssignmentService::class)->assign($admin, $coord, $a);

        $this->signedIn($coord)->getJson("/api/coordinator/trainees/{$mine->id}/timetable")->assertOk()->assertJsonPath('trainee.id', $mine->id);
        $this->signedIn($coord)->getJson("/api/coordinator/trainees/{$theirs->id}/timetable")->assertNotFound();
        $this->signedIn($coord)->getJson("/api/admin/trainees/{$mine->id}/timetable")->assertForbidden();
        $this->signedIn($mine)->getJson("/api/coordinator/trainees/{$mine->id}/timetable")->assertForbidden();
        $this->signedIn($mine)->getJson("/api/admin/trainees/{$theirs->id}/timetable")->assertForbidden();
    }

    public function test_unassigned_coordinator_sees_nothing_and_admin_sees_any_trainee_but_not_staff(): void
    {
        $s = $this->section('A');
        $t = $this->student('2024-1-00007', $s);
        $admin = $this->staff('admin', 'ADMIN-001');
        $coord = $this->staff('coordinator', 'COORD-001');

        $this->signedIn($coord)->getJson("/api/coordinator/trainees/{$t->id}/timetable")->assertNotFound();
        $this->signedIn($admin)->getJson("/api/admin/trainees/{$t->id}/timetable")->assertOk()->assertJsonPath('trainee.student_id', '2024-1-00007');
        $this->signedIn($admin)->getJson("/api/admin/trainees/{$coord->id}/timetable")->assertNotFound();
    }

    public function test_trainee_can_only_read_their_own_week(): void
    {
        $s = $this->section('A');
        $one = $this->student('2024-1-00008', $s);
        $two = $this->student('2024-1-00009', $s);
        $this->entry($two, $this->host($two, [1, 2, 3, 4, 5]), '2026-11-23', ['07:00', '12:00'], 5);

        $json = $this->signedIn($one)->getJson('/api/logbook/timetable?id='.$two->id)->assertOk()->json();
        $this->assertSame($one->id, $json['trainee']['id']);
        $this->assertSame(0.0, (float) $json['totals']['logged']);
    }

    public function test_guests_are_refused_on_all_three_doors(): void
    {
        $this->getJson('/api/logbook/timetable')->assertUnauthorized();
        $this->getJson('/api/coordinator/trainees/1/timetable')->assertUnauthorized();
        $this->getJson('/api/admin/trainees/1/timetable')->assertUnauthorized();
    }
}
