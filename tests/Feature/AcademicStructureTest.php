<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Course;
use App\Models\Section;
use App\Models\StudentEnrollment;
use App\Models\User;
use App\Services\Academic\AcademicSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Phase 2: courses, academic year, sections, enrollments, roster placement, admin-only course. */
class AcademicStructureTest extends TestCase
{
    use RefreshDatabase;

    private const BSIT = 'BSIT — Bachelor of Science in Information Technology';

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        AcademicSeeder::run(); // migrations ran on an empty DB; seed like production does
    }

    private function admin(): User
    {
        return User::factory()->create(['role' => 'admin', 'staff_id' => 'ADMIN-001', 'student_id' => null, 'course' => null, 'email_verified_at' => now()]);
    }

    private function trainee(string $sid, string $course = self::BSIT): User
    {
        return User::factory()->create(['student_id' => $sid, 'course' => $course, 'email_verified_at' => now()]);
    }

    private function section(string $code = 'BSIT', int $level = 4, string $label = 'A'): Section
    {
        return Section::create([
            'course_id' => Course::where('code', $code)->value('id'),
            'academic_year_id' => AcademicYear::current()->id, 'year_level' => $level, 'label' => $label,
        ]);
    }

    public function test_the_five_courses_and_one_current_year_are_seeded(): void
    {
        $this->assertSame(['BEED', 'BSBA-FM', 'BSBA-MM', 'BSED', 'BSIT'], Course::orderBy('code')->pluck('code')->map(fn ($c) => strtoupper($c))->all());
        $this->assertSame(1, AcademicYear::where('is_current', true)->count());
    }

    public function test_backfill_gives_existing_trainees_a_pending_enrollment_and_skips_unknown_courses(): void
    {
        $known = $this->trainee('2024-1-00001');
        $odd = $this->trainee('2024-1-00002', 'Something Old');
        $this->admin();
        AcademicSeeder::run();
        AcademicSeeder::run(); // idempotent

        $this->assertSame(1, $known->enrollments()->count());
        $this->assertSame('pending_placement', $known->currentEnrollment()->status);
        $this->assertSame(0, $odd->enrollments()->count());
        $this->assertSame(0, User::where('role', 'admin')->first()->enrollments()->count());
    }

    public function test_bsit_4a_resolves_and_lists_exactly_its_students(): void
    {
        $sec = $this->section();
        $mine = $this->trainee('2024-1-00001');
        $other = $this->trainee('2024-1-00002');
        $mine->enrollments()->create(['course_id' => $sec->course_id, 'academic_year_id' => $sec->academic_year_id, 'section_id' => $sec->id, 'year_level' => 4, 'status' => 'active']);
        $other->enrollments()->create(['course_id' => $sec->course_id, 'academic_year_id' => $sec->academic_year_id, 'status' => 'pending_placement']);

        $this->assertSame('BSIT-4A', $sec->fresh()->load('course')->code());
        $res = $this->signedIn($this->admin())->getJson("/api/admin/sections/{$sec->id}")->assertOk();
        $this->assertSame(['2024-1-00001'], collect($res->json('students'))->pluck('student_id')->all());
    }

    public function test_only_one_open_enrollment_per_student(): void
    {
        $u = $this->trainee('2024-1-00001');
        $sec = $this->section();
        $row = ['course_id' => $sec->course_id, 'academic_year_id' => $sec->academic_year_id, 'status' => 'pending_placement'];
        $u->enrollments()->create($row);
        $this->expectException(\Illuminate\Database\QueryException::class);
        $u->enrollments()->create($row);
    }

    public function test_admin_creates_sections_in_bulk_and_it_is_idempotent(): void
    {
        $a = $this->admin();
        $cid = Course::where('code', 'BSIT')->value('id');
        $this->signedIn($a)->postJson('/api/admin/sections', ['course_id' => $cid, 'year_level' => 2, 'count' => 3])->assertCreated();
        $this->signedIn($a)->postJson('/api/admin/sections', ['course_id' => $cid, 'year_level' => 2, 'count' => 3])->assertCreated();
        $this->assertSame(3, Section::count());
        $this->signedIn($a)->getJson('/api/admin/sections')->assertOk()->assertJsonPath('sections.0.code', 'BSIT-2A');
    }

    public function test_assigning_a_pending_student_activates_the_enrollment(): void
    {
        $sec = $this->section();
        $u = $this->trainee('2024-1-00001');
        AcademicSeeder::run();
        $e = $u->currentEnrollment();
        $a = $this->admin();

        $this->signedIn($a)->getJson('/api/admin/enrollments/unassigned')->assertOk()->assertJsonPath('total', 1);
        $this->signedIn($a)->postJson("/api/admin/enrollments/{$e->id}/assign-section", ['section_id' => $sec->id])
            ->assertOk()->assertJsonPath('enrollment.status', 'active')->assertJsonPath('enrollment.section.code', 'BSIT-4A');
        $this->signedIn($a)->getJson('/api/admin/enrollments/unassigned')->assertJsonPath('total', 0);
        // a second assignment is refused: moving students is Phase 4
        $this->signedIn($a)->postJson("/api/admin/enrollments/{$e->id}/assign-section", ['section_id' => $sec->id])->assertStatus(422);
    }

    public function test_section_of_another_course_is_refused(): void
    {
        $beed = $this->section('BEED', 1, 'A');
        $u = $this->trainee('2024-1-00001');
        AcademicSeeder::run();
        $this->signedIn($this->admin())
            ->postJson('/api/admin/enrollments/'.$u->currentEnrollment()->id.'/assign-section', ['section_id' => $beed->id])
            ->assertStatus(422)->assertJsonValidationErrors('section_id');
    }

    public function test_academic_endpoints_are_admin_only(): void
    {
        $t = $this->trainee('2024-1-00001');
        $c = User::factory()->create(['role' => 'coordinator', 'staff_id' => 'C-1', 'student_id' => null, 'course' => null, 'email_verified_at' => now()]);
        foreach (['/api/admin/courses', '/api/admin/sections', '/api/admin/enrollments', '/api/admin/enrollments/unassigned', '/api/admin/academic-years'] as $url) {
            $this->signedIn($t)->getJson($url)->assertForbidden();
            $this->signedIn($c)->getJson($url)->assertForbidden();
        }
    }

    public function test_academic_endpoints_need_a_signed_in_user(): void
    {
        $this->getJson('/api/admin/sections')->assertUnauthorized();
    }

    public function test_make_year_current_keeps_exactly_one_current(): void
    {
        $a = $this->admin();
        $res = $this->signedIn($a)->postJson('/api/admin/academic-years', ['name' => '2099-2100'])->assertCreated();
        $this->signedIn($a)->postJson('/api/admin/academic-years/'.$res->json('academic_year.id').'/make-current')->assertOk();
        $this->assertSame(1, AcademicYear::where('is_current', true)->count());
        $this->assertSame('2099-2100', AcademicYear::current()->name);
    }

    public function test_profile_update_ignores_course(): void
    {
        $u = $this->trainee('2024-1-00001');
        $this->signedIn($u)->putJson('/api/profile', ['first_name' => 'Ana', 'last_name' => 'Lim', 'course' => 'BEED — Bachelor of Elementary Education'])->assertOk();
        $this->assertSame(self::BSIT, $u->fresh()->course);
    }

    public function test_roster_with_section_auto_enrolls_on_registration_and_without_goes_pending(): void
    {
        $sec = $this->section();
        $file = tempnam(sys_get_temp_dir(), 'roster');
        file_put_contents($file, "student_id,course,year,section\n2024-1-00077,BSIT,4,A\n2024-1-00078\n");
        $this->artisan('roster:import', ['file' => $file])->assertSuccessful();
        unlink($file);
        $this->assertSame($sec->id, (int) DB::table('enrolled_students')->where('student_id', '2024-1-00077')->value('section_id'));

        foreach (['2024-1-00077' => ['occ.reyes.maria@gmail.com', 'Reyes'], '2024-1-00078' => ['occ.cruz.juan@gmail.com', 'Cruz']] as $sid => [$email, $last]) {
            $this->postJson('/api/auth/register', [
                'student_id' => $sid, 'first_name' => 'Test', 'last_name' => $last, 'email' => $email, 'course' => self::BSIT,
                'password' => 'Secret-Pass1', 'password_confirmation' => 'Secret-Pass1',
                'profile_photo' => UploadedFile::fake()->image('me.jpg', 400, 500),
            ])->assertCreated();
            $this->app['auth']->guard('web')->logout();
        }
        $this->assertSame('active', User::where('student_id', '2024-1-00077')->first()->currentEnrollment()->status);
        $this->assertSame($sec->id, User::where('student_id', '2024-1-00077')->first()->currentEnrollment()->section_id);
        $this->assertSame('pending_placement', User::where('student_id', '2024-1-00078')->first()->currentEnrollment()->status);
    }
}
