<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    private const COURSE = 'BSIT — Bachelor of Science in Information Technology';

    private function payload(array $over = []): array
    {
        return array_merge([
            'student_id' => '2024-1-00099',
            'first_name' => 'maria',
            'middle_name' => 'santos',
            'last_name' => 'reyes',
            'email' => 'OCC.Reyes.Maria@gmail.com',
            'course' => self::COURSE,
            'password' => 'Secret-Pass1',
            'password_confirmation' => 'Secret-Pass1',
        ], $over);
    }

    private function fakeGoogle(array $over = []): void
    {
        config(['occ.google_client_id' => 'client-123']);
        Http::fake(['oauth2.googleapis.com/*' => Http::response(array_merge([
            'iss' => 'https://accounts.google.com', 'aud' => 'client-123', 'sub' => 'g-1',
            'email' => 'new.user@gmail.com', 'email_verified' => 'true',
            'given_name' => 'New', 'family_name' => 'User', 'picture' => 'https://x/y.png',
            'exp' => time() + 600,
        ], $over))]);
    }

    public function test_register_creates_user_and_returns_token(): void
    {
        $res = $this->postJson('/api/auth/register', $this->payload());

        $res->assertCreated()->assertJsonPath('user.student_id', '2024-1-00099')
            ->assertJsonPath('user.name', 'Maria Santos Reyes')
            ->assertJsonPath('user.email', 'occ.reyes.maria@gmail.com');
        $this->assertNotEmpty($res->json('token'));
        $this->assertDatabaseHas('users', ['student_id' => '2024-1-00099']);
    }

    public function test_register_email_must_follow_school_format(): void
    {
        foreach (['maria@yahoo.com', 'maria.reyes@gmail.com', 'occ.reyes@gmail.com'] as $email) {
            $this->postJson('/api/auth/register', $this->payload(['email' => $email]))
                ->assertStatus(422)->assertJsonValidationErrors('email');
        }
    }

    public function test_register_email_lastname_must_match_last_name(): void
    {
        $this->postJson('/api/auth/register', $this->payload(['email' => 'occ.santos.maria@gmail.com']))
            ->assertStatus(422)->assertJsonValidationErrors('email');
        $this->postJson('/api/auth/register', $this->payload(['last_name' => 'De la Peña', 'email' => 'occ.delapena.maria12@gmail.com']))
            ->assertCreated();
    }

    public function test_register_student_id_format_and_required_fields(): void
    {
        $this->postJson('/api/auth/register', $this->payload(['student_id' => '2024-0099']))
            ->assertStatus(422)->assertJsonValidationErrors('student_id');

        $this->postJson('/api/auth/register', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['student_id', 'first_name', 'last_name', 'email', 'course', 'password']);
    }

    public function test_register_names_reject_digits(): void
    {
        $this->postJson('/api/auth/register', $this->payload(['first_name' => 'Maria2']))
            ->assertStatus(422)->assertJsonValidationErrors('first_name');
    }

    public function test_register_password_policy(): void
    {
        foreach (['short1A', 'alllowercase1', 'ALLUPPERCASE1', 'NoNumbersHere'] as $pw) {
            $this->postJson('/api/auth/register', $this->payload(['password' => $pw, 'password_confirmation' => $pw]))
                ->assertStatus(422)->assertJsonValidationErrors('password');
        }
        $this->postJson('/api/auth/register', $this->payload(['password_confirmation' => 'Different-1']))
            ->assertStatus(422)->assertJsonValidationErrors('password');
    }

    public function test_register_rejects_duplicates_and_unknown_course(): void
    {
        User::factory()->create(['student_id' => '2024-1-00099', 'email' => 'occ.reyes.maria@gmail.com']);

        $this->postJson('/api/auth/register', $this->payload())->assertJsonValidationErrors('student_id');
        $this->postJson('/api/auth/register', $this->payload(['student_id' => '2024-1-00100']))
            ->assertJsonValidationErrors('email');
        $this->postJson('/api/auth/register', $this->payload(['student_id' => '2024-1-00101', 'email' => 'occ.reyes.maria1@gmail.com', 'course' => 'Made Up']))
            ->assertJsonValidationErrors('course');
    }

    public function test_middle_name_is_optional_and_password_required(): void
    {
        $this->postJson('/api/auth/register', $this->payload(['middle_name' => null]))->assertCreated();
        $this->postJson('/api/auth/register', $this->payload(['student_id' => '2024-1-00098', 'email' => 'occ.reyes.maria2@gmail.com', 'password' => null, 'password_confirmation' => null]))
            ->assertJsonValidationErrors('password');
    }

    public function test_login_with_student_id_and_password(): void
    {
        User::factory()->create(['student_id' => '2024-0001', 'password' => 'password']);

        $this->postJson('/api/auth/login', ['student_id' => '2024-0001', 'password' => 'password'])
            ->assertOk()->assertJsonPath('status', 'ok');
        $this->postJson('/api/auth/login', ['student_id' => ' 2024-0001 ', 'password' => 'password'])->assertOk();
        $this->postJson('/api/auth/login', ['student_id' => '2024-0001', 'password' => 'nope'])
            ->assertStatus(422)->assertJsonValidationErrors('student_id');
        $this->postJson('/api/auth/login', ['student_id' => 'nobody', 'password' => 'password'])
            ->assertStatus(422);
    }

    public function test_google_only_account_cannot_use_password_login(): void
    {
        User::factory()->create(['student_id' => 'G-0001', 'password' => null, 'google_id' => 'g-9']);
        $this->postJson('/api/auth/login', ['student_id' => 'G-0001', 'password' => 'anything1'])->assertStatus(422);
    }

    public function test_google_signs_in_existing_user_by_email(): void
    {
        $this->fakeGoogle(['email' => 'juan@gmail.com']);
        $u = User::factory()->create(['email' => 'juan@gmail.com']);

        $this->postJson('/api/auth/google', ['credential' => 'tok'])
            ->assertOk()->assertJsonPath('user.id', $u->id);
        $this->assertSame('g-1', $u->fresh()->google_id);
    }

    public function test_google_new_user_must_finish_registration(): void
    {
        $this->fakeGoogle();

        $this->postJson('/api/auth/google', ['credential' => 'tok'])
            ->assertStatus(202)->assertJsonPath('status', 'needs_registration')
            ->assertJsonPath('profile.email', 'new.user@gmail.com');

        $res = $this->postJson('/api/auth/register', [
            'google_credential' => 'tok', 'student_id' => '2024-1-00200',
            'first_name' => 'New', 'last_name' => 'User', 'course' => self::COURSE,
            'email' => 'ignored@gmail.com',
        ])->assertCreated();

        $this->assertSame('new.user@gmail.com', $res->json('user.email'));
        $this->assertDatabaseHas('users', ['student_id' => '2024-1-00200', 'google_id' => 'g-1']);
        $this->assertNull(User::where('student_id', '2024-1-00200')->first()->password);
    }

    public function test_google_rejects_wrong_audience(): void
    {
        $this->fakeGoogle(['aud' => 'someone-elses-app']);
        $this->postJson('/api/auth/google', ['credential' => 'tok'])->assertStatus(422);
    }

    public function test_me_and_logout(): void
    {
        $user = User::factory()->create(['student_id' => '2024-0001', 'password' => 'password']);
        $token = $this->postJson('/api/auth/login', ['student_id' => '2024-0001', 'password' => 'password'])->json('token');

        $this->getJson('/api/me')->assertUnauthorized();
        $this->withToken($token)->getJson('/api/me')->assertOk()->assertJsonPath('user.id', $user->id);
        $this->withToken($token)->postJson('/api/auth/logout')->assertOk();
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_set_password_for_google_account_then_login(): void
    {
        $user = User::factory()->create(['student_id' => 'G-0002', 'password' => null, 'google_id' => 'g-2']);
        $this->actingAs($user, 'sanctum')->putJson('/api/profile/password', [
            'password' => 'Brand-New-1', 'password_confirmation' => 'Brand-New-1',
        ])->assertOk()->assertJsonPath('user.has_password', true);

        $this->postJson('/api/auth/login', ['student_id' => 'G-0002', 'password' => 'Brand-New-1'])->assertOk();
    }

    public function test_login_requires_both_fields(): void
    {
        $this->postJson('/api/auth/login', [])
            ->assertStatus(422)->assertJsonValidationErrors(['student_id', 'password']);
    }

    public function test_password_change_must_differ_and_follow_policy(): void
    {
        $user = User::factory()->create(['password' => 'Old-Password1']);

        $this->actingAs($user, 'sanctum')->putJson('/api/profile/password', [
            'current_password' => 'Old-Password1', 'password' => 'Old-Password1', 'password_confirmation' => 'Old-Password1',
        ])->assertStatus(422)->assertJsonValidationErrors('password');

        $this->actingAs($user, 'sanctum')->putJson('/api/profile/password', [
            'current_password' => 'Old-Password1', 'password' => 'weak', 'password_confirmation' => 'weak',
        ])->assertStatus(422)->assertJsonValidationErrors('password');
    }

    public function test_profile_update_validates_names_and_course(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user, 'sanctum')->putJson('/api/profile', ['first_name' => '', 'last_name' => 'X1', 'course' => 'Nope'])
            ->assertStatus(422)->assertJsonValidationErrors(['first_name', 'last_name', 'course']);
        $this->actingAs($user, 'sanctum')->putJson('/api/profile', ['first_name' => 'ana', 'last_name' => 'lim', 'course' => self::COURSE])
            ->assertOk()->assertJsonPath('user.name', 'Ana Lim');
    }
}
