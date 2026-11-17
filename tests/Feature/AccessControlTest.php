<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Who can see or change what: one trainee must never reach another trainee's data. */
class AccessControlTest extends TestCase
{
    use RefreshDatabase;

    public function test_every_private_endpoint_needs_a_signed_in_user(): void
    {
        $this->getJson('/api/me')->assertUnauthorized();
        $this->getJson('/api/me/photo')->assertUnauthorized();
        $this->putJson('/api/profile', [])->assertUnauthorized();
        $this->putJson('/api/profile/password', [])->assertUnauthorized();
        $this->postJson('/api/profile/photo', [])->assertUnauthorized();
        $this->deleteJson('/api/profile/photo')->assertUnauthorized();
        $this->getJson('/api/sync')->assertUnauthorized();
        $this->putJson('/api/sync/logbook-v2', ['value' => 1])->assertUnauthorized();
        $this->deleteJson('/api/sync/logbook-v2')->assertUnauthorized();
    }

    public function test_delete_only_removes_the_callers_own_document(): void
    {
        $a = User::factory()->create();
        $b = User::factory()->create();

        $this->signedIn($a)->putJson('/api/sync/logbook-v2', ['value' => ['studentName' => 'A']])->assertOk();
        $this->signedIn($b)->putJson('/api/sync/logbook-v2', ['value' => ['studentName' => 'B']])->assertOk();

        $this->signedIn($b)->deleteJson('/api/sync/logbook-v2')->assertOk();

        $this->signedIn($a)->getJson('/api/sync')->assertJsonPath('documents.logbook-v2.studentName', 'A');
        $this->signedIn($b)->getJson('/api/sync')->assertExactJson(['documents' => []]);
    }

    public function test_user_id_in_the_body_cannot_redirect_a_write_to_someone_else(): void
    {
        $a = User::factory()->create();
        $b = User::factory()->create();

        $this->signedIn($b)->putJson('/api/sync/logbook-v2', [
            'value' => ['studentName' => 'B'], 'user_id' => $a->id,
        ])->assertOk();

        $this->assertDatabaseHas('user_settings', ['user_id' => $b->id, 'student_name' => 'B']);
        $this->assertDatabaseMissing('user_settings', ['user_id' => $a->id]);
    }

    public function test_profile_update_cannot_change_identity_fields(): void
    {
        $u = User::factory()->create(['student_id' => '2024-1-00001', 'email' => 'occ.keep.me@gmail.com']);

        $this->signedIn($u)->putJson('/api/profile', [
            'first_name' => 'New', 'middle_name' => '', 'last_name' => 'Name', 'course' => $u->course,
            'student_id' => '2024-1-99999', 'email' => 'occ.hacker.x@gmail.com', 'email_verified_at' => null,
        ]);

        $u->refresh();
        $this->assertSame('2024-1-00001', $u->student_id);
        $this->assertSame('occ.keep.me@gmail.com', $u->email);
        $this->assertNotNull($u->email_verified_at);
    }

    public function test_unverified_account_is_shut_out_of_the_data_api(): void
    {
        $u = User::factory()->create(['email_verified_at' => null]);

        $this->signedIn($u)->getJson('/api/sync')->assertForbidden()->assertJsonPath('code', 'email_unverified');
        $this->signedIn($u)->getJson('/api/me')->assertOk();
    }

    public function test_wrong_password_five_times_locks_the_account_for_a_while(): void
    {
        RateLimiter::clear('login|2024-1-00007|127.0.0.1');
        User::factory()->create(['student_id' => '2024-1-00007']);

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', ['student_id' => '2024-1-00007', 'password' => 'wrong-pass-'.$i])
                ->assertStatus(422);
        }

        // Even the RIGHT password is refused until the lock runs out.
        $this->postJson('/api/auth/login', ['student_id' => '2024-1-00007', 'password' => 'password'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('student_id');

        RateLimiter::clear('login|2024-1-00007|127.0.0.1');
    }

    public function test_changing_the_password_signs_out_other_devices(): void
    {
        $u = User::factory()->create();
        $stolen = $this->otherDevice($u);
        $this->assertSame(1, DB::table('sessions')->where('user_id', $u->id)->count());

        $this->signedIn($u)->putJson('/api/profile/password', [
            'current_password' => 'password',
            'password' => 'New-Secret-Pass9',
            'password_confirmation' => 'New-Secret-Pass9',
        ])->assertOk();

        $this->assertDatabaseMissing('sessions', ['id' => $stolen]); // the other device is out
        $this->assertAuthenticated('web');                            // this phone stays signed in
    }
}
