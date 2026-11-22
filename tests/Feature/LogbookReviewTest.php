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

/** Phase 5a: submit / approve / reject, protected sync, verified hours, admin hour exceptions. */
class LogbookReviewTest extends TestCase
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
        $this->admin = User::factory()->create(['role' => 'admin', 'staff_id' => 'ADMIN-001', 'student_id' => null, 'course' => null, 'email_verified_at' => now()]);
        $this->coord = User::factory()->create(['role' => 'coordinator', 'staff_id' => 'COORD-001', 'student_id' => null, 'course' => null, 'email_verified_at' => now()]);
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

    public function test_new_entries_are_drafts_and_submit_locks_them(): void
    {
        $this->push([$this->entry('e1')])->assertOk();
        $this->assertSame('draft', DutyEntry::first()->status);

        $this->signedIn($this->trainee)->postJson('/api/logbook/entries/e1/submit')->assertOk()->assertJsonPath('value.entries.0.status', 'submitted');
        $this->signedIn($this->trainee)->postJson('/api/logbook/entries/e1/submit')->assertStatus(422); // not twice
        $this->signedIn($this->trainee)->postJson('/api/logbook/entries/nope/submit')->assertStatus(422);
    }

    public function test_sync_cannot_edit_or_delete_submitted_or_approved_entries(): void
    {
        $e = $this->submitted();
        // edit attempt
        $res = $this->push([$this->entry('e1', ['task' => 'HACKED', 'amOut' => '11:00', 'pmOut' => '14:00'])]);
        $res->assertOk()->assertJsonPath('value.entries.0.task', 'Filing'); // canonical document handed back
        $this->assertSame('Filing', $e->fresh()->task);
        $this->assertEquals(8.0, $e->fresh()->hours);
        // delete attempt (document without the entry)
        $this->push([])->assertOk();
        $this->assertSame(1, DutyEntry::count());
        // approve, then try the same again
        $this->signedIn($this->coord)->postJson("/api/coordinator/entries/{$e->id}/approve")->assertOk();
        $this->push([$this->entry('e1', ['task' => 'HACKED AGAIN'])])->assertOk();
        $this->push([])->assertOk();
        $this->assertSame('Filing', $e->fresh()->task);
        $this->assertSame('approved', $e->fresh()->status);
        // the document-wide DELETE keeps locked entries as well
        $this->signedIn($this->trainee)->deleteJson('/api/sync/logbook-v2')->assertOk();
        $this->assertSame(1, DutyEntry::count());
    }

    public function test_drafts_and_rejected_entries_stay_editable_and_deletable(): void
    {
        $this->push([$this->entry('d1'), $this->entry('d2', ['date' => '2026-01-06'])])->assertOk();
        $this->push([$this->entry('d1', ['task' => 'Edited'])])->assertOk();
        $this->assertSame(['d1'], DutyEntry::pluck('entry_uid')->all());
        $this->assertSame('Edited', DutyEntry::first()->task);
    }

    public function test_approval_bumps_the_revision_so_a_stale_device_gets_409(): void
    {
        $this->push([$this->entry('e1')])->assertOk();
        $rev = $this->signedIn($this->trainee)->getJson('/api/sync')->json('revisions.logbook-v2');
        $this->signedIn($this->trainee)->postJson('/api/logbook/entries/e1/submit')->assertOk();
        $e = DutyEntry::first();
        $this->signedIn($this->coord)->postJson("/api/coordinator/entries/{$e->id}/approve")->assertOk();

        $this->push([], $rev)->assertStatus(409); // stale offline device
        $this->assertSame(1, DutyEntry::count());
    }

    public function test_only_approved_hours_count_as_verified_and_a_notice_is_created(): void
    {
        $e = $this->submitted();
        $this->signedIn($this->trainee)->getJson('/api/logbook/hours')->assertJsonPath('hours.verified', 0)->assertJsonPath('hours.pending', 8);

        $this->signedIn($this->coord)->postJson("/api/coordinator/entries/{$e->id}/approve", ['verified_hours' => 7.5])->assertOk();
        $this->signedIn($this->trainee)->getJson('/api/logbook/hours')->assertJsonPath('hours.verified', 7.5)->assertJsonPath('hours.pending', 0)->assertJsonPath('hours.required', 486);
        $this->assertSame(1, UserNotification::where('user_id', $this->trainee->id)->where('source', 'server')->count());
        $this->assertDatabaseHas('duty_entry_reviews', ['duty_entry_id' => $e->id, 'action' => 'approved']);
        $this->assertDatabaseHas('activity_logs', ['action' => 'entry.approved', 'section_id' => $this->section->id]);
        // verified cannot exceed logged, and an approved entry cannot be reviewed again
        $this->signedIn($this->coord)->postJson("/api/coordinator/entries/{$e->id}/approve")->assertStatus(422);
    }

    public function test_reject_needs_a_reason_then_the_trainee_can_fix_and_resubmit(): void
    {
        $e = $this->submitted();
        $this->signedIn($this->coord)->postJson("/api/coordinator/entries/{$e->id}/reject", [])->assertStatus(422)->assertJsonValidationErrors('reason');
        $this->signedIn($this->coord)->postJson("/api/coordinator/entries/{$e->id}/reject", ['reason' => 'Wrong time out'])->assertOk()->assertJsonPath('entry.status', 'rejected');

        $this->signedIn($this->trainee)->getJson('/api/sync')->assertJsonPath('documents.logbook-v2.entries.0.reviewReason', 'Wrong time out');
        $this->push([$this->entry('e1', ['pmOut' => '16:00'])])->assertOk(); // rejected = editable
        $this->assertEquals(7.0, $e->fresh()->hours);
        $this->signedIn($this->trainee)->postJson('/api/logbook/entries/e1/submit')->assertOk();
        $this->assertSame(2, \App\Models\DutyEntryReview::where('duty_entry_id', $e->id)->where('action', 'submitted')->count());
    }

    public function test_review_history_is_immutable(): void
    {
        $e = $this->submitted();
        $this->expectException(\LogicException::class);
        \App\Models\DutyEntryReview::where('duty_entry_id', $e->id)->first()->delete();
    }

    public function test_a_coordinator_cannot_touch_entries_outside_their_section(): void
    {
        $other = User::factory()->create(['student_id' => '2024-1-00002', 'email_verified_at' => now()]);
        $foreign = DutyEntry::create(['user_id' => $other->id, 'entry_uid' => 'x1', 'duty_date' => '2026-01-05', 'hours' => 8, 'status' => 'submitted']);

        $this->signedIn($this->coord)->postJson("/api/coordinator/entries/{$foreign->id}/approve")->assertNotFound();
        $this->signedIn($this->coord)->postJson("/api/coordinator/entries/{$foreign->id}/reject", ['reason' => 'nope nope'])->assertNotFound();
        $this->signedIn($this->coord)->getJson("/api/coordinator/trainees/{$other->id}/entries")->assertNotFound();
        $this->assertSame('submitted', $foreign->fresh()->status);
        $this->assertSame([], $this->signedIn($this->coord)->getJson('/api/coordinator/approvals')->json('entries'));
    }

    public function test_roles_are_enforced_on_the_review_endpoints(): void
    {
        $e = $this->submitted();
        $this->signedIn($this->trainee)->postJson("/api/coordinator/entries/{$e->id}/approve")->assertForbidden();
        $this->signedIn($this->admin)->postJson("/api/coordinator/entries/{$e->id}/approve")->assertForbidden();
        $this->signedIn($this->coord)->postJson('/api/logbook/entries/e1/submit')->assertForbidden();
        $this->signedIn($this->coord)->postJson("/api/admin/trainees/{$this->trainee->id}/hour-exception", ['hours' => 300, 'reason' => 'Approved by dean'])->assertForbidden();
        $this->signedIn($this->trainee)->postJson("/api/admin/trainees/{$this->trainee->id}/hour-exception", ['hours' => 300, 'reason' => 'Approved by dean'])->assertForbidden();
    }

    public function test_the_client_cannot_change_the_required_hours_only_an_admin_can(): void
    {
        $this->push([], null, ['targetHours' => 100])->assertOk();
        $this->signedIn($this->trainee)->getJson('/api/sync')->assertJsonPath('documents.logbook-v2.targetHours', 486);

        $this->signedIn($this->admin)->postJson("/api/admin/trainees/{$this->trainee->id}/hour-exception", ['hours' => 300, 'reason' => 'Credited prior training'])
            ->assertCreated()->assertJsonPath('hours.required', 300);
        $this->signedIn($this->admin)->postJson("/api/admin/trainees/{$this->trainee->id}/hour-exception", ['hours' => 300])->assertStatus(422); // reason required
        $this->assertDatabaseHas('training_hour_exceptions', ['user_id' => $this->trainee->id, 'previous_hours' => 486, 'new_hours' => 300, 'admin_id' => $this->admin->id]);

        $this->push([], null, ['targetHours' => 1000])->assertOk(); // still ignored
        $this->signedIn($this->trainee)->getJson('/api/sync')->assertJsonPath('documents.logbook-v2.targetHours', 300);
        // clearing the logbook does not wipe the exception
        $this->signedIn($this->trainee)->deleteJson('/api/sync/logbook-v2')->assertOk();
        $this->signedIn($this->trainee)->getJson('/api/logbook/hours')->assertJsonPath('hours.required', 300);
    }

    public function test_existing_entries_are_backfilled_as_draft_and_legacy(): void
    {
        $e = DutyEntry::create(['user_id' => $this->trainee->id, 'entry_uid' => 'old', 'duty_date' => '2025-01-01', 'hours' => 8]);
        $this->assertSame('draft', $e->fresh()->status);
        $this->assertFalse((bool) $e->fresh()->legacy); // new rows are not legacy; the migration marks pre-existing rows
        $this->signedIn($this->trainee)->getJson('/api/logbook/hours')->assertJsonPath('hours.verified', 0)->assertJsonPath('hours.draft', 8);
    }
}
