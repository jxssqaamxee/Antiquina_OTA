<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Course;
use App\Models\CoordinatorAssignment;
use App\Models\Section;
use App\Models\StudentEnrollment;
use App\Models\User;
use App\Services\Academic\AcademicSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Only the Administrator edits account details (names, email); Profile Settings is read-only for everyone. */
class AdminUserTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_lists_and_edits_any_users_details_but_not_ids_or_role(): void
    {
        $admin = User::factory()->adminAccess('admin', 'ADMIN-1')->create();
        $trainee = User::factory()->create(['student_id' => '2024-1-00001']);

        $this->signedIn($admin)->getJson('/api/admin/users?q=2024-1-00001')->assertOk()->assertJsonPath('users.0.id', $trainee->id);

        $this->signedIn($admin)->putJson("/api/admin/users/{$trainee->id}", [
            'first_name' => 'ana', 'middle_name' => '', 'last_name' => 'lim', 'email' => 'Ana.Lim@Example.com',
            'admin_password' => 'password', 'student_id' => 'HACK', 'role' => 'admin',
        ])->assertOk()->assertJsonPath('user.name', 'Ana Lim')->assertJsonPath('user.email', 'ana.lim@example.com');

        $trainee->refresh();
        $this->assertSame('2024-1-00001', $trainee->student_id);
        $this->assertSame('trainee', $trainee->role);
    }

    public function test_email_must_stay_unique_and_names_valid(): void
    {
        $admin = User::factory()->adminAccess('admin', 'ADMIN-1')->create();
        $a = User::factory()->create();
        $b = User::factory()->create();

        $this->signedIn($admin)->putJson("/api/admin/users/{$a->id}", ['first_name' => 'Ana', 'last_name' => 'Lim', 'email' => $b->email, 'admin_password' => 'password'])
            ->assertStatus(422)->assertJsonValidationErrors('email');
        $this->signedIn($admin)->putJson("/api/admin/users/{$a->id}", ['first_name' => 'A1', 'last_name' => '', 'email' => 'ok@example.com'])
            ->assertStatus(422)->assertJsonValidationErrors(['first_name', 'last_name']);
    }

    public function test_coordinators_and_trainees_cannot_use_the_admin_users_screen_or_edit_themselves(): void
    {
        $coord = User::factory()->adminAccess('coordinator', 'COORD-1')->create();
        $trainee = User::factory()->create();

        $this->signedIn($coord)->getJson('/api/admin/users')->assertForbidden();
        $this->signedIn($coord)->putJson("/api/admin/users/{$trainee->id}", ['first_name' => 'X', 'last_name' => 'Y', 'email' => 'x@example.com'])->assertForbidden();
        $this->signedIn($trainee)->putJson("/api/admin/users/{$coord->id}", ['first_name' => 'X', 'last_name' => 'Y', 'email' => 'x@example.com'])->assertForbidden();
        $this->signedIn($trainee)->putJson('/api/profile', ['first_name' => 'X', 'last_name' => 'Y'])->assertForbidden()->assertJsonPath('code', 'profile_locked');
    }
    public function test_admin_can_view_every_detail_of_a_trainee_and_a_coordinator(): void
    {
        AcademicSeeder::run();
        $admin = User::factory()->adminAccess('admin', 'ADMIN-1')->create();
        $coord = User::factory()->adminAccess('coordinator', 'COOR-1')->create();
        $trainee = User::factory()->create(['student_id' => '2024-1-00001', 'email_verified_at' => now()]);
        $sec = Section::create(['course_id' => Course::where('code', 'BSIT')->value('id'), 'academic_year_id' => AcademicYear::current()->id, 'year_level' => 4, 'label' => 'A']);
        StudentEnrollment::create(['user_id' => $trainee->id, 'course_id' => $sec->course_id, 'academic_year_id' => $sec->academic_year_id,
            'section_id' => $sec->id, 'year_level' => 4, 'status' => 'active', 'started_at' => now()]);
        CoordinatorAssignment::create(['coordinator_id' => $coord->id, 'section_id' => $sec->id, 'assigned_by' => $admin->id, 'started_at' => now()]);

        $r = $this->signedIn($admin)->getJson("/api/admin/users/{$trainee->id}")->assertOk()
            ->assertJsonPath('user.login_id', '2024-1-00001')->assertJsonPath('user.role', 'trainee')
            ->assertJsonPath('user.enrollment.section', 'BSIT-4A')->assertJsonPath('user.enrollment.academic_year', AcademicYear::current()->name)
            ->assertJsonPath('user.hours.required', 486)->assertJsonPath('user.email_verified', true);
        $this->assertCount(1, $r->json('user.enrollments'));
        foreach (['password', 'remember_token', 'two_factor_secret', 'two_factor_recovery_codes'] as $secret) {
            $this->assertArrayNotHasKey($secret, $r->json('user'));
        }

        $this->signedIn($admin)->getJson("/api/admin/users/{$coord->id}")->assertOk()
            ->assertJsonPath('user.role', 'coordinator')->assertJsonPath('user.assignment.section', 'BSIT-4A')->assertJsonPath('user.two_factor', false);
        $this->signedIn($admin)->getJson('/api/admin/users/999999')->assertNotFound();
    }

    public function test_only_the_administrator_can_open_user_details(): void
    {
        $coord = User::factory()->adminAccess('coordinator', 'COOR-1')->create();
        $trainee = User::factory()->create();
        $this->signedIn($coord)->getJson("/api/admin/users/{$trainee->id}")->assertForbidden();
        $this->signedIn($trainee)->getJson("/api/admin/users/{$trainee->id}")->assertForbidden();
        $this->signedIn($trainee)->getJson("/api/admin/users/{$trainee->id}/photo")->assertForbidden();
    }
}
