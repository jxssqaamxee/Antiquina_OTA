<?php

namespace Tests\Feature;

use App\Mail\EmailChangedMail;
use App\Models\ActivityLog;
use App\Models\User;
use App\Services\Academic\AccountStatusService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/** Phase 3: deactivate/reactivate (F11) and email-change safeguards (F4). */
class AccountManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_deactivation_blocks_old_session_other_devices_and_login_and_reactivation_restores_it(): void
    {
        $admin = User::factory()->adminAccess('admin', 'ADMIN-1')->create();
        $trainee = User::factory()->create(['student_id' => '2024-1-00001']);
        $coord = User::factory()->adminAccess('coordinator', 'COORD-1')->create();
        $this->otherDevice($trainee, 'dev-t');
        $this->otherDevice($coord, 'dev-c');

        $this->signedIn($trainee)->getJson('/api/me')->assertOk();

        $this->signedIn($admin)->postJson("/api/admin/users/{$trainee->id}/deactivate", ['reason' => 'Left the program'])
            ->assertOk()->assertJsonPath('user.is_active', false);
        $this->signedIn($admin)->postJson("/api/admin/users/{$coord->id}/deactivate", ['reason' => 'Resigned'])->assertOk();

        $this->assertSame(0, DB::table('sessions')->whereIn('id', ['dev-t', 'dev-c'])->count());
        // The old session cookie (still valid for the guard) is refused.
        $this->signedIn($trainee->fresh())->getJson('/api/me')->assertStatus(401)->assertJsonPath('code', 'account_deactivated');
        $this->signedIn($coord->fresh())->getJson('/api/coordinator/overview')->assertStatus(401);

        $this->postJson('/api/auth/login', ['student_id' => '2024-1-00001', 'password' => 'password'])->assertStatus(422);
        $this->postJson('/api/auth/administrator', ['admin_id' => 'COORD-1', 'password' => 'password'])->assertStatus(422);

        $this->signedIn($admin)->postJson("/api/admin/users/{$trainee->id}/reactivate", ['reason' => 'Returned'])
            ->assertOk()->assertJsonPath('user.is_active', true);
        $this->signedIn($admin)->postJson("/api/admin/users/{$coord->id}/reactivate", ['reason' => 'Returned'])->assertOk();
        $this->postJson('/api/auth/login', ['student_id' => '2024-1-00001', 'password' => 'password'])->assertOk();
        $this->postJson('/api/auth/administrator', ['admin_id' => 'COORD-1', 'password' => 'password'])->assertOk();
    }

    public function test_status_changes_are_logged_with_actor_target_and_reason(): void
    {
        $admin = User::factory()->adminAccess('admin', 'ADMIN-1')->create();
        $trainee = User::factory()->create();

        $this->signedIn($admin)->postJson("/api/admin/users/{$trainee->id}/deactivate", ['reason' => 'Duplicate account'])->assertOk();
        $this->signedIn($admin)->postJson("/api/admin/users/{$trainee->id}/reactivate", ['reason' => 'Mistake'])->assertOk();

        $rows = ActivityLog::where('subject_type', 'user')->where('subject_id', $trainee->id)->orderBy('id')->get();
        $this->assertSame(['user.deactivated', 'user.reactivated'], $rows->pluck('action')->all());
        $this->assertSame($admin->id, $rows[0]->actor_id);
        $this->assertSame('Duplicate account', $rows[0]->details['reason']);
        $this->assertSame('Mistake', $rows[1]->details['reason']);
    }

    public function test_reason_is_required_and_repeat_calls_conflict(): void
    {
        $admin = User::factory()->adminAccess('admin', 'ADMIN-1')->create();
        $trainee = User::factory()->create();

        $this->signedIn($admin)->postJson("/api/admin/users/{$trainee->id}/deactivate", [])->assertStatus(422)->assertJsonValidationErrors('reason');
        $this->assertTrue($trainee->fresh()->isActive());
        $this->signedIn($admin)->postJson("/api/admin/users/{$trainee->id}/reactivate", ['reason' => 'No need'])->assertStatus(409);
        $this->signedIn($admin)->postJson("/api/admin/users/{$trainee->id}/deactivate", ['reason' => 'Gone'])->assertOk();
        $this->signedIn($admin)->postJson("/api/admin/users/{$trainee->id}/deactivate", ['reason' => 'Gone'])->assertStatus(409);
        $this->assertSame(1, ActivityLog::where('action', 'user.deactivated')->count());
    }

    public function test_admin_cannot_deactivate_self_or_the_last_active_admin(): void
    {
        $admin = User::factory()->adminAccess('admin', 'ADMIN-1')->create();
        $this->signedIn($admin)->postJson("/api/admin/users/{$admin->id}/deactivate", ['reason' => 'Oops'])->assertStatus(422)->assertJsonValidationErrors('user');
        $this->assertTrue($admin->fresh()->isActive());

        // Guard inside the service (a different actor, e.g. a concurrent request): the only active admin stays.
        $other = User::factory()->adminAccess('coordinator', 'COORD-9')->create();
        try {
            app(AccountStatusService::class)->deactivate($other, $admin, 'Test');
            $this->fail('last admin was deactivated');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('user', $e->errors());
        }
        $this->assertTrue($admin->fresh()->isActive());

        $second = User::factory()->adminAccess('admin', 'ADMIN-2')->create();
        $this->signedIn($admin)->postJson("/api/admin/users/{$second->id}/deactivate", ['reason' => 'Left'])->assertOk();
    }

    public function test_only_admins_can_deactivate_or_reactivate(): void
    {
        $coord = User::factory()->adminAccess('coordinator', 'COORD-1')->create();
        $trainee = User::factory()->create();
        $other = User::factory()->create();

        $this->signedIn($coord)->postJson("/api/admin/users/{$trainee->id}/deactivate", ['reason' => 'x y z'])->assertForbidden();
        $this->signedIn($trainee)->postJson("/api/admin/users/{$other->id}/deactivate", ['reason' => 'x y z'])->assertForbidden();
        $this->signedIn($trainee)->postJson("/api/admin/users/{$other->id}/reactivate", ['reason' => 'x y z'])->assertForbidden();
        $this->assertTrue($trainee->fresh()->isActive() && $other->fresh()->isActive());
    }

    private function emailPayload(User $u, array $over = []): array
    {
        return array_merge([
            'first_name' => $u->first_name, 'middle_name' => $u->middle_name, 'last_name' => $u->last_name, 'email' => $u->email,
        ], $over);
    }

    public function test_changing_an_email_needs_the_admins_own_password(): void
    {
        $admin = User::factory()->adminAccess('admin', 'ADMIN-1')->create();
        $trainee = User::factory()->create(['email' => 'old@example.com']);

        $this->signedIn($admin)->putJson("/api/admin/users/{$trainee->id}", $this->emailPayload($trainee, ['email' => 'new@example.com']))
            ->assertStatus(422)->assertJsonValidationErrors('admin_password');
        $this->signedIn($admin)->putJson("/api/admin/users/{$trainee->id}", $this->emailPayload($trainee, ['email' => 'new@example.com', 'admin_password' => 'wrong']))
            ->assertStatus(422)->assertJsonValidationErrors('admin_password');
        $this->assertSame('old@example.com', $trainee->fresh()->email);
        $this->assertNotNull($trainee->fresh()->email_verified_at);

        // A name-only edit does not need it.
        $this->signedIn($admin)->putJson("/api/admin/users/{$trainee->id}", $this->emailPayload($trainee, ['first_name' => 'Renamed', 'email' => 'old@example.com']))->assertOk();
    }

    public function test_email_change_unverifies_revokes_sessions_notifies_old_address_and_logs_old_and_new(): void
    {
        Mail::fake();
        $admin = User::factory()->adminAccess('admin', 'ADMIN-1')->create();
        $trainee = User::factory()->create(['email' => 'old@example.com']);
        $this->otherDevice($trainee, 'dev-t');
        DB::table('password_reset_tokens')->insert(['email' => 'old@example.com', 'token' => 'x', 'created_at' => now()]);

        $this->signedIn($admin)->putJson("/api/admin/users/{$trainee->id}", $this->emailPayload($trainee, ['email' => 'New@Example.com', 'admin_password' => 'password']))
            ->assertOk()->assertJsonPath('user.email', 'new@example.com');

        $t = $trainee->fresh();
        $this->assertSame('new@example.com', $t->email);
        $this->assertNull($t->email_verified_at);
        $this->assertSame(0, DB::table('sessions')->where('id', 'dev-t')->count());
        $this->assertSame(0, DB::table('password_reset_tokens')->where('email', 'old@example.com')->count());
        Mail::assertSent(EmailChangedMail::class, fn ($m) => $m->hasTo('old@example.com') && $m->newEmail === 'new@example.com');

        $row = ActivityLog::where('action', 'user.updated')->where('subject_id', $trainee->id)->firstOrFail();
        $this->assertSame('old@example.com', $row->details['old']['email']);
        $this->assertSame('new@example.com', $row->details['new']['email']);
        $this->assertStringNotContainsString('password', json_encode($row->details));

        // Unverified again: the API is closed until the new address is confirmed.
        $this->signedIn($t)->getJson('/api/logbook/hours')->assertStatus(403)->assertJsonPath('code', 'email_unverified');
    }
}
