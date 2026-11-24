<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Course;
use App\Models\DutyEntry;
use App\Models\Section;
use App\Models\User;
use App\Services\Academic\AcademicSeeder;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Security phase 1: a day can't be double-counted past locked entries, and entries can't be dated in the future. */
class LogbookIntegrityTest extends TestCase
{
    use RefreshDatabase;

    private User $trainee;

    protected function setUp(): void
    {
        parent::setUp();
        AcademicSeeder::run();
        $this->trainee = User::factory()->create(['student_id' => '2024-1-00001', 'email_verified_at' => now()]);
        $section = Section::create(['course_id' => Course::where('code', 'BSIT')->value('id'), 'academic_year_id' => AcademicYear::current()->id, 'year_level' => 4, 'label' => 'A']);
        $this->trainee->enrollments()->create(['course_id' => $section->course_id, 'academic_year_id' => $section->academic_year_id, 'section_id' => $section->id, 'year_level' => 4, 'status' => 'active']);
    }

    private function entry(string $id, array $over = []): array
    {
        return $over + ['id' => $id, 'date' => '2026-01-05', 'client' => null, 'category' => 'regular', 'amIn' => '08:00', 'amOut' => '12:00',
            'pmIn' => '13:00', 'pmOut' => '17:00', 'evIn' => '', 'evOut' => '', 'hours' => 8, 'task' => 'Filing'];
    }

    private function push(array $entries)
    {
        return $this->signedIn($this->trainee)->putJson('/api/sync/logbook-v2', ['value' => [
            'studentName' => 'Juan Dela Cruz', 'targetHours' => 486, 'lastClientId' => null, 'clients' => [], 'entries' => $entries,
        ]]);
    }

    /** e1 (08-12, 13-17 on 2026-01-05) is submitted, so it is locked. */
    private function lockedE1(): void
    {
        $this->push([$this->entry('e1')])->assertOk();
        $this->signedIn($this->trainee)->postJson('/api/logbook/entries/e1/submit')->assertOk();
    }

    private function evening(string $id, string $date = '2026-01-05'): array
    {
        return $this->entry($id, ['date' => $date, 'amIn' => '', 'amOut' => '', 'pmIn' => '', 'pmOut' => '', 'evIn' => '18:00', 'evOut' => '20:00']);
    }

    public function test_new_entry_cannot_overlap_a_locked_entry_that_the_push_omits(): void
    {
        $this->lockedE1();

        // The push leaves e1 out entirely, so a document-only check sees no clash.
        $this->push([$this->entry('e2', ['amIn' => '09:00', 'amOut' => '10:00', 'pmIn' => '', 'pmOut' => '', 'hours' => 1])])
            ->assertStatus(422);

        $this->assertDatabaseMissing('duty_entries', ['entry_uid' => 'e2']);
        $this->assertSame(1, DutyEntry::where('user_id', $this->trainee->id)->whereDate('duty_date', '2026-01-05')->count());
    }

    public function test_new_entry_cannot_overlap_a_locked_entry_whose_times_the_push_alters(): void
    {
        $this->lockedE1();

        // The client sends e1 with different times (ignored: locked) and a new entry that fits the fake times
        // but clashes with the times actually stored.
        $this->push([
            $this->entry('e1', ['amIn' => '06:00', 'amOut' => '07:00', 'pmIn' => '', 'pmOut' => '']),
            $this->entry('e2', ['amIn' => '09:00', 'amOut' => '10:00', 'pmIn' => '', 'pmOut' => '', 'hours' => 1]),
        ])->assertStatus(422);

        $this->assertDatabaseMissing('duty_entries', ['entry_uid' => 'e2']);
    }

    public function test_verified_hours_for_one_day_cannot_exceed_the_real_day(): void
    {
        $this->lockedE1();
        $this->push([$this->entry('e2')])->assertStatus(422); // an identical second 8h shift on the same date

        $this->assertSame(8.0, (float) DutyEntry::where('user_id', $this->trainee->id)->sum('hours'));
    }

    public function test_non_overlapping_time_on_the_same_day_or_another_day_is_still_accepted(): void
    {
        $this->lockedE1();

        $this->push([$this->evening('e2')])->assertOk();                       // same day, free evening slot
        $this->push([$this->evening('e2'), $this->entry('e3', ['date' => '2026-01-06'])])->assertOk(); // another day
        $this->assertDatabaseHas('duty_entries', ['entry_uid' => 'e2']);
        $this->assertDatabaseHas('duty_entries', ['entry_uid' => 'e3']);
    }

    public function test_resending_the_locked_entry_unchanged_still_works(): void
    {
        $this->lockedE1();
        $this->push([$this->entry('e1'), $this->evening('e2')])->assertOk();
        $this->assertSame(2, DutyEntry::where('user_id', $this->trainee->id)->count());
    }

    public function test_one_trainee_s_locked_entries_never_block_another_trainee(): void
    {
        $this->lockedE1();
        $other = User::factory()->create(['student_id' => '2024-1-00002', 'email_verified_at' => now()]);
        $this->signedIn($other)->putJson('/api/sync/logbook-v2', ['value' => [
            'studentName' => 'Maria Clara', 'targetHours' => 486, 'lastClientId' => null, 'clients' => [], 'entries' => [$this->entry('o1')],
        ]])->assertOk();
    }

    public function test_future_dated_entries_are_rejected_but_today_is_fine(): void
    {
        $tz = config('occ.timezone', 'Asia/Manila');
        $today = Carbon::now($tz)->format('Y-m-d');
        $tomorrow = Carbon::now($tz)->addDay()->format('Y-m-d');

        $this->push([$this->entry('f1', ['date' => '2099-01-01'])])->assertStatus(422)->assertJsonValidationErrors(['value.entries.0.date']);
        $this->push([$this->entry('f2', ['date' => $tomorrow])])->assertStatus(422)->assertJsonValidationErrors(['value.entries.0.date']);
        $this->assertDatabaseCount('duty_entries', 0);

        $this->push([$this->entry('f3', ['date' => $today])])->assertOk();
        $this->assertDatabaseHas('duty_entries', ['entry_uid' => 'f3']);
    }

    public function test_an_entry_reviewed_through_a_stale_copy_is_refused_and_logged_once(): void
    {
        $this->lockedE1();
        $coord = User::factory()->create(['role' => 'coordinator', 'admin_id' => 'COORD-001', 'student_id' => null, 'course' => null, 'email_verified_at' => now()]);
        $stale = DutyEntry::where('entry_uid', 'e1')->firstOrFail(); // still says "submitted" after the first review
        $svc = app(\App\Services\Academic\DutyEntryApprovalService::class);

        $svc->approve($coord, $stale, null);

        try {
            $svc->reject($coord, $stale, 'too late');
            $this->fail('A second review of the same entry must be refused.');
        } catch (\Illuminate\Validation\ValidationException $e) {
            $this->assertArrayHasKey('entry', $e->errors());
        }

        $this->assertSame('approved', DutyEntry::where('entry_uid', 'e1')->value('status'));
        $this->assertDatabaseCount('duty_entry_reviews', 2); // 'submitted' + one review
        $this->assertSame(1, \App\Models\ActivityLog::where('action', 'like', 'entry.%')->count());
    }
}
