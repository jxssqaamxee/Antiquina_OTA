<?php

namespace Tests\Feature;

use App\Models\User;
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
            'student_id' => 'HACK', 'role' => 'admin',
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

        $this->signedIn($admin)->putJson("/api/admin/users/{$a->id}", ['first_name' => 'Ana', 'last_name' => 'Lim', 'email' => $b->email])
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
}
