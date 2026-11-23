<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Phase 1: Admin / Coordinator / Trainee roles, admin sign-in and backend authorization. */
class RolesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        RateLimiter::clear('admin-login|admin-001|127.0.0.1');
        RateLimiter::clear('admin-login-account|admin-001');
    }

    // ---- AUTH-01: public registration can never create admin ----

    public function test_registration_cannot_set_a_role_or_admin_id(): void
    {
        $this->postJson('/api/auth/register', [
            'student_id' => '2024-1-00099', 'first_name' => 'Maria', 'last_name' => 'Reyes',
            'email' => 'occ.reyes.maria@gmail.com',
            'course' => 'BSIT — Bachelor of Science in Information Technology',
            'password' => 'Secret-Pass1', 'password_confirmation' => 'Secret-Pass1',
            'profile_photo' => UploadedFile::fake()->image('me.jpg', 400, 500),
            'role' => 'admin', 'admin_id' => 'ADMIN-999', 'is_active' => false,
        ])->assertCreated()->assertJsonPath('user.role', 'trainee');

        $this->assertDatabaseHas('users', ['student_id' => '2024-1-00099', 'role' => 'trainee', 'admin_id' => null, 'is_active' => true]);
    }

    public function test_role_is_not_mass_assignable(): void
    {
        $u = User::create([
            'student_id' => '2024-1-00077', 'first_name' => 'A', 'last_name' => 'B', 'email' => 'x@gmail.com',
            'course' => 'c', 'password' => 'Secret-Pass1', 'role' => 'admin', 'admin_id' => 'ADMIN-1',
        ])->fresh();

        $this->assertSame('trainee', $u->role);
        $this->assertNull($u->admin_id);
    }

    // ---- AUTH-02 / 03 / 04 ----

    public function test_management_api_needs_a_signed_in_user(): void
    {
        $this->getJson('/api/admin/overview')->assertUnauthorized();
        $this->getJson('/api/coordinator/overview')->assertUnauthorized();
    }

    public function test_a_trainee_cannot_reach_admin_or_coordinator_api(): void
    {
        $t = User::factory()->create();

        $this->signedIn($t)->getJson('/api/admin/overview')->assertForbidden()->assertJsonPath('code', 'role_forbidden');
        $this->signedIn($t)->getJson('/api/coordinator/overview')->assertForbidden()->assertJsonPath('code', 'role_forbidden');
    }

    public function test_a_coordinator_cannot_reach_admin_api_and_an_admin_cannot_use_coordinator_api(): void
    {
        $c = User::factory()->coordinator()->create();
        $a = User::factory()->admin()->create();

        $this->signedIn($c)->getJson('/api/admin/overview')->assertForbidden();
        $this->signedIn($a)->getJson('/api/coordinator/overview')->assertForbidden();
    }

    public function test_each_role_reaches_its_own_overview(): void
    {
        User::factory()->count(2)->create();
        $a = User::factory()->admin()->create();
        $c = User::factory()->coordinator()->create();

        $this->signedIn($a)->getJson('/api/admin/overview')->assertOk()
            ->assertJsonPath('accounts.admins', 1)->assertJsonPath('accounts.coordinators', 1)->assertJsonPath('accounts.trainees', 2);
        $this->signedIn($c)->getJson('/api/coordinator/overview')->assertOk()->assertJsonPath('section', null)->assertJsonPath('trainees', 0);
    }

    public function test_admin_have_no_logbook_sync(): void
    {
        $c = User::factory()->coordinator()->create();

        $this->signedIn($c)->getJson('/api/sync')->assertForbidden();
        $this->signedIn($c)->putJson('/api/sync/logbook-v2', ['value' => ['studentName' => 'X']])->assertForbidden();
        $this->assertDatabaseMissing('user_settings', ['user_id' => $c->id]);
    }

    public function test_me_reports_the_role_and_admin_id(): void
    {
        $a = User::factory()->admin('ADMIN-001')->create();

        $this->signedIn($a)->getJson('/api/me')->assertOk()
            ->assertJsonPath('user.role', 'admin')->assertJsonPath('user.admin_id', 'ADMIN-001')->assertJsonPath('user.student_id', null);
    }

    // ---- admin sign-in ----

    public function test_admin_sign_in_with_their_admin_id(): void
    {
        User::factory()->admin('ADMIN-001')->create();

        $this->postJson('/api/auth/admin-login', ['admin_id' => ' admin-001 ', 'password' => 'password'])
            ->assertOk()->assertJsonPath('user.role', 'admin')->assertJsonPath('user.admin_id', 'ADMIN-001');
        $this->assertAuthenticated('web');
    }

    public function test_admin_login_rejects_wrong_password_with_a_generic_message(): void
    {
        User::factory()->coordinator('COORD-001')->create();

        $this->postJson('/api/auth/admin-login', ['admin_id' => 'COORD-001', 'password' => 'nope'])
            ->assertStatus(422)->assertJsonValidationErrors('admin_id');
        $this->postJson('/api/auth/admin-login', ['admin_id' => 'NOBODY-001', 'password' => 'nope'])
            ->assertStatus(422)->assertJsonPath('errors.admin_id.0', 'ID or password is incorrect.');
        $this->assertGuest('web');
    }

    public function test_a_trainee_cannot_use_the_admin_login_and_admin_cannot_use_the_student_login(): void
    {
        User::factory()->create(['student_id' => '2024-1-00001']);
        User::factory()->admin('ADMIN-001')->create();

        $this->postJson('/api/auth/admin-login', ['admin_id' => '2024-1-00001', 'password' => 'password'])->assertStatus(422);
        $this->postJson('/api/auth/login', ['student_id' => 'ADMIN-001', 'password' => 'password'])->assertStatus(422);
        $this->assertGuest('web');
    }

    public function test_admin_login_locks_after_repeated_failures(): void
    {
        User::factory()->admin('ADMIN-001')->create();

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/admin-login', ['admin_id' => 'ADMIN-001', 'password' => 'wrong'.$i])->assertStatus(422);
        }

        $res = $this->postJson('/api/auth/admin-login', ['admin_id' => 'ADMIN-001', 'password' => 'password'])->assertStatus(422);
        $this->assertStringContainsString('Too many sign-in attempts', $res->json('errors.admin_id.0'));
        $this->assertGuest('web');
    }

    // ---- deactivation ----

    public function test_a_deactivated_account_cannot_sign_in(): void
    {
        User::factory()->coordinator('COORD-001')->inactive()->create();
        User::factory()->inactive()->create(['student_id' => '2024-1-00002']);

        $this->postJson('/api/auth/admin-login', ['admin_id' => 'COORD-001', 'password' => 'password'])
            ->assertStatus(422)->assertJsonPath('errors.admin_id.0', fn ($m) => str_contains($m, 'deactivated'));
        $this->postJson('/api/auth/login', ['student_id' => '2024-1-00002', 'password' => 'password'])
            ->assertStatus(422)->assertJsonPath('errors.student_id.0', fn ($m) => str_contains($m, 'deactivated'));
        $this->assertGuest('web');
    }

    public function test_deactivating_revokes_every_session_and_blocks_the_next_request(): void
    {
        $u = User::factory()->coordinator()->create();
        $this->otherDevice($u);

        $u->deactivate();

        $this->assertSame(0, DB::table('sessions')->where('user_id', $u->id)->count());
        $this->assertFalse($u->fresh()->isActive());
        $this->assertNotNull($u->fresh()->deactivated_at);

        // A session that somehow survived is still refused.
        $this->signedIn($u->fresh())->getJson('/api/me')->assertUnauthorized()->assertJsonPath('code', 'account_deactivated');
    }

    public function test_session_probe_does_not_report_a_deactivated_account_as_signed_in(): void
    {
        $u = User::factory()->inactive()->create();

        $this->signedIn($u)->getJson('/api/session')->assertOk()->assertJsonPath('user', null);
    }

    public function test_reactivating_allows_sign_in_again(): void
    {
        $u = User::factory()->admin('ADMIN-001')->inactive()->create();
        $u->reactivate();

        $this->postJson('/api/auth/admin-login', ['admin_id' => 'ADMIN-001', 'password' => 'password'])->assertOk();
    }

    // ---- first Admin (Artisan) ----

    public function test_artisan_creates_a_verified_admin(): void
    {
        $this->artisan('admin:create', [
            '--admin-id' => 'admin-001', '--first-name' => 'maria', '--last-name' => 'reyes',
            '--email' => 'Maria@Example.com', '--password' => 'Secret-Pass1',
        ])->assertSuccessful();

        $admin = User::where('admin_id', 'ADMIN-001')->firstOrFail();
        $this->assertSame('admin', $admin->role);
        $this->assertSame('maria@example.com', $admin->email);
        $this->assertNotNull($admin->email_verified_at);
        $this->assertNull($admin->student_id);
        $this->assertNotSame('Secret-Pass1', $admin->password);

        $this->postJson('/api/auth/admin-login', ['admin_id' => 'ADMIN-001', 'password' => 'Secret-Pass1'])->assertOk();
    }

    public function test_artisan_refuses_a_duplicate_admin_id_and_a_weak_password(): void
    {
        User::factory()->admin('ADMIN-001')->create();

        $this->artisan('admin:create', [
            '--admin-id' => 'ADMIN-001', '--first-name' => 'A', '--last-name' => 'B', '--email' => 'new@example.com', '--password' => 'Secret-Pass1',
        ])->assertFailed();
        $this->artisan('admin:create', [
            '--admin-id' => 'ADMIN-002', '--first-name' => 'A', '--last-name' => 'B', '--email' => 'new2@example.com', '--password' => 'weak',
        ])->assertFailed();

        $this->assertSame(1, User::where('role', 'admin')->count());
    }
}
