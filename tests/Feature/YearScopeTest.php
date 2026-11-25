<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\CoordinatorAssignment;
use App\Models\Course;
use App\Models\Section;
use App\Models\StudentEnrollment;
use App\Models\User;
use App\Services\Academic\AcademicSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** A new school year starts empty; the finished year stays readable as history (admin views follow ONE year). */
class YearScopeTest extends TestCase
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

    private function section(AcademicYear $y, string $label = 'A'): Section
    {
        return Section::create(['course_id' => Course::where('code', 'BSIT')->value('id'), 'academic_year_id' => $y->id, 'year_level' => 4, 'label' => $label]);
    }

    private function student(string $sid, Section $s, string $status = 'active'): StudentEnrollment
    {
        $u = User::factory()->create(['student_id' => $sid, 'email_verified_at' => now()]);

        return $u->enrollments()->create(['course_id' => $s->course_id, 'academic_year_id' => $s->academic_year_id, 'section_id' => $s->id, 'year_level' => 4, 'status' => $status]);
    }

    public function test_a_new_current_year_shows_nothing_until_students_are_in_it_and_the_old_year_stays_readable(): void
    {
        $admin = User::factory()->adminAccess('admin', 'ADMIN-1')->create();
        $this->student('2024-1-00001', $this->section($this->old));
        $this->signedIn($admin)->postJson("/api/admin/academic-years/{$this->new->id}/make-current")->assertOk();

        $this->signedIn($admin)->getJson('/api/admin/reports/trainees')->assertOk()->assertJsonPath('totals.trainees', 0);
        $this->signedIn($admin)->getJson('/api/admin/overview')->assertOk()->assertJsonPath('kpis.trainees', 0)->assertJsonPath('academic_year.name', '2098-2099');
        $this->assertStringNotContainsString('2024-1-00001', $this->signedIn($admin)->get('/api/admin/reports/trainees.csv')->getContent());

        // the old year is still there when asked for
        $this->signedIn($admin)->getJson('/api/admin/reports/trainees?academic_year_id='.$this->old->id)->assertOk()->assertJsonPath('totals.trainees', 1);
        $this->signedIn($admin)->getJson('/api/admin/overview?academic_year_id='.$this->old->id)->assertOk()->assertJsonPath('kpis.trainees', 1);
    }

    public function test_a_finished_year_still_lists_students_whose_enrollment_was_closed_and_carried_over(): void
    {
        $admin = User::factory()->adminAccess('admin', 'ADMIN-1')->create();
        $e = $this->student('2024-1-00001', $this->section($this->old));
        $dest = $this->section($this->new);
        $this->signedIn($admin)->postJson("/api/admin/academic-years/{$this->new->id}/progression/confirm", ['items' => [['enrollment_id' => $e->id, 'kind' => 'repeat', 'section_id' => $dest->id]]])->assertOk();
        $this->signedIn($admin)->postJson("/api/admin/academic-years/{$this->new->id}/make-current")->assertOk();

        // carried over: counted in the NEW year, and still in the old year's history (closed row), once each
        $this->signedIn($admin)->getJson('/api/admin/reports/trainees')->assertJsonPath('totals.trainees', 1)->assertJsonPath('rows.0.section', 'BSIT-4A');
        $old = $this->signedIn($admin)->getJson('/api/admin/reports/trainees?academic_year_id='.$this->old->id)->assertOk();
        $this->assertSame(1, $old->json('totals.trainees'));
        $en = $this->signedIn($admin)->getJson('/api/admin/enrollments?academic_year_id='.$this->old->id)->assertOk();
        $this->assertSame(1, $en->json('total'));
        $this->assertSame('repeating', $en->json('data.0.status'));
        $this->assertSame($this->old->name, $en->json('data.0.academic_year'));
    }

    public function test_a_coordinator_is_told_when_their_section_belongs_to_an_earlier_year(): void
    {
        $coord = User::factory()->adminAccess('coordinator', 'COOR-1')->create();
        $sec = $this->section($this->old);
        CoordinatorAssignment::create(['coordinator_id' => $coord->id, 'section_id' => $sec->id, 'assigned_by' => $coord->id, 'started_at' => now()]);

        $this->signedIn($coord)->getJson('/api/coordinator/overview')->assertOk()->assertJsonPath('section.is_current_year', true)->assertJsonPath('section.academic_year', $this->old->name);
        $this->old->update(['is_current' => false]);
        $this->new->update(['is_current' => true]);
        $this->signedIn($coord)->getJson('/api/coordinator/overview')->assertOk()->assertJsonPath('section.is_current_year', false);
    }
}
