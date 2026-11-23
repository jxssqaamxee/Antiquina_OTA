<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** First sign-in of an Admin / Coordinator: photo, name and own password; ID and email stay locked. */
class FirstLoginSetupTest extends TestCase
{
    use RefreshDatabase;

    private const NEW_PW = 'My-Own-Pass-456';

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        RateLimiter::clear('127.0.0.1');
    }

    private function pending(string $role = 'coordinator', string $id = 'STAFF-001'): User
    {
        $u = User::factory()->adminAccess($role, $id)->create([
            'first_name' => 'Placeholder', 'middle_name' => null, 'last_name' => 'Name', 'password' => 'Given-Pass-123',
        ]);
        $u->forceFill(['must_change_password' => true])->save();

        return $u;
    }

    private function body(array $over = []): array
    {
        return array_merge([
            'first_name' => 'maria', 'middle_name' => 'santos', 'last_name' => 'reyes',
            'password' => self::NEW_PW, 'password_confirmation' => self::NEW_PW,
            'photo' => UploadedFile::fake()->image('me.jpg', 400, 500),
        ], $over);
    }

    public function test_admin_created_coordinator_must_set_up_first(): void
    {
        $admin = User::factory()->admin()->create();
        $this->signedIn($admin)->postJson('/api/admin/coordinators', [
            'admin_id' => 'coord-01', 'first_name' => 'Ana', 'last_name' => 'Cruz',
            'email' => 'ana@example.com', 'password' => 'Given-Pass-123',
        ])->assertCreated();

        $this->assertTrue(User::where('admin_id', 'COORD-01')->firstOrFail()->must_change_password);
    }

    public function test_every_other_api_call_is_blocked_until_setup_is_done(): void
    {
        $u = $this->pending();

        $this->signedIn($u)->getJson('/api/me')->assertOk()->assertJsonPath('user.must_change_password', true);
        $this->signedIn($u)->getJson('/api/coordinator/overview')->assertStatus(423)->assertJsonPath('code', 'setup_required');
        $this->signedIn($u)->putJson('/api/profile', ['first_name' => 'A', 'last_name' => 'B'])->assertStatus(423);

        $admin = $this->pending('admin', 'ADMIN-900');
        $this->signedIn($admin)->getJson('/api/admin/coordinators')->assertStatus(423);
    }

    public function test_setup_saves_photo_name_and_password_and_unlocks_the_account(): void
    {
        $u = $this->pending();
        $this->otherDevice($u);

        $this->signedIn($u)->post('/api/profile/complete-setup', $this->body(), ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('user.must_change_password', false)
            ->assertJsonPath('user.first_name', 'Maria')
            ->assertJsonPath('user.middle_name', 'Santos')
            ->assertJsonPath('user.last_name', 'Reyes')
            ->assertJsonPath('user.name', 'Maria Santos Reyes')
            ->assertJsonPath('user.has_profile_photo', true);

        $u->refresh();
        $this->assertTrue(Hash::check(self::NEW_PW, $u->password));
        $this->assertFalse($u->must_change_password);
        $this->assertDatabaseMissing('sessions', ['id' => 'other-device-session']); // other devices signed out
        $this->signedIn($u)->getJson('/api/coordinator/overview')->assertOk();
    }

    public function test_admin_id_and_email_cannot_be_changed_during_setup(): void
    {
        $u = $this->pending();
        $email = $u->email;

        $this->signedIn($u)->post('/api/profile/complete-setup', $this->body([
            'admin_id' => 'HACK-999', 'email' => 'hacker@example.com', 'role' => 'admin',
        ]), ['Accept' => 'application/json'])->assertOk();

        $u->refresh();
        $this->assertSame('STAFF-001', $u->admin_id);
        $this->assertSame($email, $u->email);
        $this->assertSame('coordinator', $u->role);
    }

    public function test_photo_is_required_when_none_is_on_file_and_must_be_an_image(): void
    {
        $u = $this->pending();
        $h = ['Accept' => 'application/json'];

        $this->signedIn($u)->post('/api/profile/complete-setup', $this->body(['photo' => null]), $h)->assertStatus(422)->assertJsonValidationErrors('photo');
        $this->signedIn($u)->post('/api/profile/complete-setup', $this->body(['photo' => UploadedFile::fake()->create('x.pdf', 10, 'application/pdf')]), $h)
            ->assertStatus(422)->assertJsonValidationErrors('photo');
        $this->signedIn($u)->post('/api/profile/complete-setup', $this->body(['photo' => UploadedFile::fake()->create('big.jpg', 6000, 'image/jpeg')]), $h)
            ->assertStatus(422)->assertJsonValidationErrors('photo');
        $this->assertTrue($u->fresh()->must_change_password);
    }

    public function test_an_existing_photo_may_be_kept(): void
    {
        $u = $this->pending();
        $h = ['Accept' => 'application/json'];
        \App\Support\ProfilePhotoStorage::save($u, UploadedFile::fake()->image('a.jpg', 300, 300)); // e.g. a photo the account already carries
        $this->assertNotNull($u->fresh()->photoUrl());

        $this->signedIn($u)->post('/api/profile/complete-setup', $this->body(['photo' => null]), $h)->assertOk()->assertJsonPath('user.has_profile_photo', true);
    }

    public function test_names_and_password_are_validated(): void
    {
        $u = $this->pending();
        $h = ['Accept' => 'application/json'];

        $this->signedIn($u)->post('/api/profile/complete-setup', $this->body(['first_name' => '', 'last_name' => 'R3yes!', 'middle_name' => '1']), $h)
            ->assertStatus(422)->assertJsonValidationErrors(['first_name', 'last_name', 'middle_name']);
        $this->signedIn($u)->post('/api/profile/complete-setup', $this->body(['password' => 'weak', 'password_confirmation' => 'weak']), $h)
            ->assertStatus(422)->assertJsonValidationErrors('password');
        $this->signedIn($u)->post('/api/profile/complete-setup', $this->body(['password_confirmation' => 'Different-Pass-1']), $h)
            ->assertStatus(422)->assertJsonValidationErrors('password');
        $this->signedIn($u)->post('/api/profile/complete-setup', $this->body(['password' => 'Given-Pass-123', 'password_confirmation' => 'Given-Pass-123']), $h)
            ->assertStatus(422)->assertJsonValidationErrors('password'); // must differ from the handed-out password

        $this->assertTrue($u->fresh()->must_change_password);
    }

    public function test_middle_name_is_optional(): void
    {
        $u = $this->pending('admin');
        $this->signedIn($u)->post('/api/profile/complete-setup', $this->body(['middle_name' => '']), ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('user.middle_name', null)->assertJsonPath('user.name', 'Maria Reyes');
    }

    public function test_setup_is_one_time_and_not_for_trainees(): void
    {
        $done = User::factory()->coordinator()->create(); // already set up
        $h = ['Accept' => 'application/json'];
        $this->signedIn($done)->post('/api/profile/complete-setup', $this->body(), $h)->assertStatus(409);

        $trainee = User::factory()->create();
        $this->signedIn($trainee)->post('/api/profile/complete-setup', $this->body(), $h)->assertForbidden();

    }

    public function test_a_guest_cannot_use_setup(): void
    {
        $this->postJson('/api/profile/complete-setup', [])->assertUnauthorized();
    }

    public function test_after_setup_admin_and_coordinator_can_edit_their_name_but_not_id_or_email(): void
    {
        foreach (['admin', 'coordinator'] as $role) {
            $u = User::factory()->adminAccess($role, strtoupper($role).'-77')->create();
            $email = $u->email;

            $this->signedIn($u)->putJson('/api/profile', [
                'first_name' => 'juan', 'middle_name' => 'dela', 'last_name' => 'cruz', 'admin_id' => 'X-1', 'email' => 'x@example.com',
            ])->assertOk()->assertJsonPath('user.name', 'Juan Dela Cruz');

            $u->refresh();
            $this->assertSame(strtoupper($role).'-77', $u->admin_id);
            $this->assertSame($email, $u->email);
        }
    }

    public function test_a_normal_trainee_is_never_gated(): void
    {
        $t = User::factory()->create();
        $this->signedIn($t)->putJson('/api/profile', ['first_name' => 'Ana', 'last_name' => 'Lim'])->assertOk();
    }
}
