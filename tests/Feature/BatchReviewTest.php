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

/** Coordinator inbox summary + approve/return several entries at once (scoped, audited, one notice per trainee). */
class BatchReviewTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $coord;
    private User $trainee;
    private Section $section;

    protected function setUp(): void
    {
        parent::setUp();
        AcademicSeeder::run();
        $this->admin = User::factory()->create(['role' => 'admin', 'admin_id' => 'ADMIN-001', 'student_id' => null, 'course' => null, 'email_verified_at' => now()]);
        $this->coord = User::factory()->create(['role' => 'coordinator', 'admin_id' => 'COORD-001', 'student_id' => null, 'course' => null, 'email_verified_at' => now()]);
        $this->trainee = User::factory()->create(['student_id' => '2024-1-00001', 'email_verified_at' => now()]);
        $this->section = Section::create(['course_id' => Course::where('code', 'BSIT')->value('id'), 'academic_year_id' => AcademicYear::current()->id, 'year_level' => 4, 'label' => 'A']);
        $this->trainee->enrollments()->create(['course_id' => $this->section->course_id, 'academic_year_id' => $this->section->academic_year_id, 'section_id' => $this->section->id, 'year_level' => 4, 'status' => 'active']);
        app(CoordinatorAssignmentService::class)->assign($this->admin, $this->coord, $this->section);
    }

    private function doc(array $entries, array $over = []): array
    {
        return $over + ['studentName' => 'Juan Dela Cruz', 'targetHours' => 486, 'lastClientId' => null, 'clients' => [], 'entries' => $entries];
    }

    private function entry(string $id, array $over = []): array
    {
        return $over + ['id' => $id, 'date' => '2026-01-05', 'client' => null, 'category' => 'regular', 'amIn' => '08:00', 'amOut' => '12:00',
            'pmIn' => '13:00', 'pmOut' => '17:00', 'evIn' => '', 'evOut' => '', 'hours' => 8, 'task' => 'Filing'];
    }

    private function push(array $entries, ?int $base = null, array $over = [])
    {
        return $this->signedIn($this->trainee)->putJson('/api/sync/logbook-v2', ['value' => $this->doc($entries, $over)] + ($base !== null ? ['base_revision' => $base] : []));
    }

    private function submitted(string $uid = 'e1'): DutyEntry
    {
        $this->push([$this->entry($uid)])->assertOk();
        $this->signedIn($this->trainee)->postJson("/api/logbook/entries/{$uid}/submit")->assertOk();

        return DutyEntry::where('entry_uid', $uid)->firstOrFail();
    }

    private function three(): array
    {
        $this->push([$this->entry('a', ['date' => '2026-01-05']), $this->entry('b', ['date' => '2026-01-06']), $this->entry('c', ['date' => '2026-01-07'])])->assertOk();
        foreach (['a', 'b', 'c'] as $u) {
            $this->signedIn($this->trainee)->postJson("/api/logbook/entries/{$u}/submit")->assertOk();
        }

        return DutyEntry::orderBy('duty_date')->pluck('id')->all();
    }

    public function test_summary_groups_waiting_entries_by_trainee(): void
    {
        $this->three();
        $this->signedIn($this->coord)->getJson('/api/coordinator/approvals/summary')->assertOk()
            ->assertJsonPath('total_entries', 3)->assertJsonPath('trainees.0.pending', 3)->assertJsonPath('trainees.0.student_id', '2024-1-00001');
        $this->signedIn($this->coord)->getJson('/api/coordinator/trainees')->assertOk()->assertJsonPath('trainees.0.pending', 3);
    }

    public function test_approve_many_uses_logged_hours_audits_each_and_sends_one_notice(): void
    {
        $ids = $this->three();
        $before = UserNotification::where('user_id', $this->trainee->id)->count();
        $this->signedIn($this->coord)->postJson('/api/coordinator/entries/review', ['action' => 'approve', 'ids' => $ids])
            ->assertOk()->assertJsonPath('done', 3)->assertJsonPath('skipped', 0)->assertJsonPath('hours', 24);
        $this->assertSame(3, DutyEntry::where('status', 'approved')->where('verified_hours', 8)->count());
        $this->assertSame(3, \App\Models\ActivityLog::where('action', 'entry.approved')->count());
        $this->assertSame($before + 1, UserNotification::where('user_id', $this->trainee->id)->count());
        // a second click is harmless: everything is already handled
        $this->signedIn($this->coord)->postJson('/api/coordinator/entries/review', ['action' => 'approve', 'ids' => $ids])->assertOk()->assertJsonPath('done', 0)->assertJsonPath('skipped', 3);
    }

    public function test_return_many_needs_a_reason(): void
    {
        $ids = $this->three();
        $this->signedIn($this->coord)->postJson('/api/coordinator/entries/review', ['action' => 'reject', 'ids' => $ids])->assertStatus(422);
        $this->signedIn($this->coord)->postJson('/api/coordinator/entries/review', ['action' => 'reject', 'ids' => $ids, 'reason' => 'Check your time-out'])->assertOk()->assertJsonPath('done', 3);
        $this->assertSame(3, DutyEntry::where('status', 'rejected')->count());
    }

    public function test_batch_is_limited_to_own_section_and_to_coordinators(): void
    {
        $ids = $this->three();
        $other = User::factory()->create(['role' => 'coordinator', 'admin_id' => 'COORD-002', 'student_id' => null, 'course' => null, 'email_verified_at' => now()]);
        $this->signedIn($other)->postJson('/api/coordinator/entries/review', ['action' => 'approve', 'ids' => $ids])->assertNotFound();
        $this->signedIn($this->trainee)->postJson('/api/coordinator/entries/review', ['action' => 'approve', 'ids' => $ids])->assertForbidden();
        $this->signedIn($this->trainee)->getJson('/api/coordinator/approvals/summary')->assertForbidden();
        $this->assertSame(3, DutyEntry::where('status', 'submitted')->count());
    }
}
