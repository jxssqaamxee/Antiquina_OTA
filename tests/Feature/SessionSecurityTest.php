<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Auth\SessionLogin;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** The sign-in is a server-side session: CSRF, hard expiry, no token anywhere. */
class SessionSecurityTest extends TestCase
{
    use RefreshDatabase;

    private function user(): User
    {
        return User::factory()->create(['student_id' => '2024-1-00031', 'password' => 'password']);
    }

    public function test_writes_without_a_csrf_token_are_refused(): void
    {
        $this->user();
        // Laravel skips CSRF only when the app environment is "testing"; switch that off here.
        $this->app->instance('env', 'local');

        $this->postJson('/api/auth/login', ['student_id' => '2024-1-00031', 'password' => 'password'])
            ->assertStatus(419);
        $this->assertGuest('web');
    }

    public function test_writes_with_the_matching_csrf_token_work(): void
    {
        $this->user();
        $this->app->instance('env', 'local');

        $this->withSession(['_token' => 'known-token'])
            ->postJson('/api/auth/login', ['student_id' => '2024-1-00031', 'password' => 'password'], ['X-CSRF-TOKEN' => 'known-token'])
            ->assertOk();
        $this->assertAuthenticated('web');
    }

    public function test_session_probe_answers_200_with_no_user_for_a_visitor(): void
    {
        $this->getJson('/api/session')->assertOk()->assertExactJson(['user' => null]);
    }

    public function test_session_probe_returns_the_signed_in_user(): void
    {
        $user = $this->user();

        $this->signedIn($user)->getJson('/api/session')
            ->assertOk()->assertJsonPath('user.student_id', '2024-1-00031');
    }

    public function test_session_probe_does_not_trust_an_expired_session(): void
    {
        $this->signedIn($this->user(), now()->subMinute()->getTimestamp())
            ->getJson('/api/session')->assertUnauthorized();
    }

    public function test_a_session_past_its_hard_expiry_is_signed_out_by_the_server(): void
    {
        $user = $this->user();

        $this->signedIn($user, now()->subMinute()->getTimestamp())
            ->getJson('/api/me')->assertUnauthorized();
        $this->assertGuest('web');
    }

    public function test_a_session_with_no_expiry_stamp_is_not_trusted(): void
    {
        $this->actingAs($this->user())->getJson('/api/me')->assertUnauthorized();
    }

    public function test_remember_me_sets_a_longer_server_side_limit(): void
    {
        $this->user();

        $short = $this->postJson('/api/auth/login', ['student_id' => '2024-1-00031', 'password' => 'password', 'remember' => false])->assertOk();
        $this->app['auth']->guard('web')->logout();
        $long = $this->postJson('/api/auth/login', ['student_id' => '2024-1-00031', 'password' => 'password', 'remember' => true])->assertOk();

        $this->assertEqualsWithDelta(
            config('occ.session_hours') * 3600, strtotime($short->json('expires_at')) - time(), 30
        );
        $this->assertEqualsWithDelta(
            config('occ.session_remember_days') * 86400, strtotime($long->json('expires_at')) - time(), 30
        );
    }

    public function test_the_response_never_contains_a_token(): void
    {
        $this->user();

        $res = $this->postJson('/api/auth/login', ['student_id' => '2024-1-00031', 'password' => 'password'])->assertOk();

        $this->assertArrayNotHasKey('token', $res->json());
        $this->assertStringNotContainsString('Bearer', $res->getContent());
    }

    public function test_session_lifetime_is_never_shorter_than_remember_me(): void
    {
        $this->assertGreaterThanOrEqual(
            config('occ.session_remember_days') * 1440, config('session.lifetime')
        );
        $this->assertSame(SessionLogin::EXPIRES_KEY, 'occ_expires_at');
    }
}
