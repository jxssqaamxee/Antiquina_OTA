<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\User;
use App\Services\Auth\Totp;
use App\Services\Auth\TwoFactorService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Phase 3: authenticator-app two-factor for Admin / Coordinator, same API shape as the SCLF app. */
class TwoFactorTest extends TestCase
{
    use RefreshDatabase;

    private function enrol(User $u): array
    {
        $tf = app(TwoFactorService::class);
        $secret = $tf->beginSetup($u)['secret'];
        $codes = $tf->confirm($u->fresh(), Totp::codeAt($secret, Totp::step()));

        return [$secret, $codes];
    }

    private function login(string $id = 'ADMIN-1'): array
    {
        return $this->postJson('/api/auth/administrator', ['admin_id' => $id, 'password' => 'password'])->json();
    }

    private function verify(string $token, string $code)
    {
        return $this->postJson('/api/2fa/login-verify', ['temp_token' => $token, 'code' => $code]);
    }

    public function test_totp_matches_the_rfc6238_test_vector(): void
    {
        $secret = Totp::base32Encode('12345678901234567890');
        $this->assertSame('287082', Totp::codeAt($secret, intdiv(59, 30)));
        $this->assertSame('081804', Totp::codeAt($secret, intdiv(1111111109, 30)));
        $this->assertSame('12345678901234567890', Totp::base32Decode($secret));
        $this->assertNull(Totp::matchStep($secret, '000000', 59));
        $this->assertSame(1, Totp::matchStep($secret, '287082', 59));
    }

    public function test_enrolment_setup_confirm_status_and_recovery_codes_shown_once(): void
    {
        $admin = User::factory()->adminAccess('admin', 'ADMIN-1')->create();
        $this->otherDevice($admin, 'dev-a');

        $this->signedIn($admin)->getJson('/api/2fa/status')->assertOk()->assertJsonPath('enabled', false);
        $secret = $this->signedIn($admin)->postJson('/api/2fa/setup')->assertOk()->assertJsonStructure(['secret', 'otpauth_uri'])->json('secret');

        $this->assertFalse($admin->fresh()->hasTwoFactor()); // not on until a code is confirmed
        $this->signedIn($admin)->postJson('/api/2fa/confirm', ['code' => '000000'])->assertStatus(422)->assertJsonValidationErrors('code');
        $ok = $this->signedIn($admin)->postJson('/api/2fa/confirm', ['code' => Totp::codeAt($secret, Totp::step())])->assertOk();
        $codes = $ok->json('recovery_codes');
        $this->assertCount(8, $codes);
        $this->assertMatchesRegularExpression('/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/', $codes[0]);
        $this->assertTrue($ok->json('user.two_factor_enabled'));
        $this->assertSame(0, DB::table('sessions')->where('id', 'dev-a')->count());

        $this->signedIn($admin->fresh())->getJson('/api/2fa/status')->assertJsonPath('enabled', true)->assertJsonPath('recovery_codes_remaining', 8);
        // Encrypted at rest; recovery codes only as hashes; nothing in API output.
        $raw = DB::table('users')->where('id', $admin->id)->first();
        $this->assertStringNotContainsString($secret, (string) $raw->two_factor_secret);
        $this->assertStringNotContainsString($codes[0], (string) $raw->two_factor_recovery_codes);
        $this->assertStringNotContainsString($codes[0], json_encode($admin->fresh()->two_factor_recovery_codes));
        $this->assertStringNotContainsString($secret, json_encode($this->signedIn($admin->fresh())->getJson('/api/me')->json()));
        // Starting a new setup while it is on is refused (it would silently replace the secret).
        $this->signedIn($admin->fresh())->postJson('/api/2fa/setup')->assertStatus(409);
    }

    public function test_trainees_cannot_use_the_two_factor_routes(): void
    {
        $t = User::factory()->create();
        $this->signedIn($t)->postJson('/api/2fa/setup')->assertForbidden();
        $this->signedIn($t)->getJson('/api/2fa/status')->assertForbidden();
    }

    public function test_login_with_two_factor_returns_temp_token_and_no_session_until_the_code_is_right(): void
    {
        $coord = User::factory()->adminAccess('coordinator', 'COORD-1')->create();
        [$secret] = $this->enrol($coord);

        $r = $this->postJson('/api/auth/administrator', ['admin_id' => 'COORD-1', 'password' => 'password'])->assertOk()
            ->assertJsonPath('two_factor_required', true)->assertJsonMissingPath('user');
        $token = $r->json('temp_token');
        $this->assertGuest('web');
        $this->getJson('/api/coordinator/overview')->assertStatus(401);

        $this->verify($token, '000000')->assertStatus(422)->assertJsonValidationErrors('code');
        $this->assertGuest('web');
        $this->verify($token, Totp::codeAt($secret, Totp::step() + 1))->assertOk()->assertJsonPath('status', 'ok')->assertJsonPath('user.admin_id', 'COORD-1');
        // Single use.
        $this->verify($token, Totp::codeAt($secret, Totp::step() + 1))->assertStatus(422);
    }

    public function test_a_used_code_cannot_be_replayed(): void
    {
        $coord = User::factory()->adminAccess('coordinator', 'COORD-1')->create();
        [$secret] = $this->enrol($coord);
        $tf = app(TwoFactorService::class);

        $this->assertFalse($tf->verifyCode($coord->fresh(), Totp::codeAt($secret, Totp::step())));
        $this->assertTrue($tf->verifyCode($coord->fresh(), Totp::codeAt($secret, Totp::step() + 1)));
        $this->assertFalse($tf->verifyCode($coord->fresh(), Totp::codeAt($secret, Totp::step() + 1)));
    }

    public function test_recovery_code_works_once_in_any_case_with_or_without_dash_and_is_logged(): void
    {
        $admin = User::factory()->adminAccess('admin', 'ADMIN-1')->create();
        [, $codes] = $this->enrol($admin);

        $this->verify($this->login()['temp_token'], strtolower(str_replace('-', '', $codes[0])))->assertOk()->assertJsonPath('status', 'ok');
        $this->verify($this->login()['temp_token'], $codes[0])->assertStatus(422);
        $this->verify($this->login()['temp_token'], $codes[1])->assertOk();
        $this->assertSame(6, app(TwoFactorService::class)->recoveryCodesLeft($admin->fresh()));
        $this->assertSame(2, ActivityLog::where('action', 'two_factor.recovery_code_used')->count());
    }

    public function test_five_wrong_codes_lock_the_account_for_ten_minutes_across_new_tokens(): void
    {
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class); // route throttles are tested separately
        $admin = User::factory()->adminAccess('admin', 'ADMIN-1')->create();
        [$secret] = $this->enrol($admin);

        for ($i = 0; $i < 5; $i++) {
            $this->verify($this->login()['temp_token'], '000000')->assertStatus(422);
        }
        // A brand-new temp token shares the same budget: even the right code is refused now.
        $this->verify($this->login()['temp_token'] ?? 'x', Totp::codeAt($secret, Totp::step() + 1))->assertStatus(422);
        $this->assertGuest('web');
    }

    public function test_one_temp_token_burns_after_five_wrong_tries(): void
    {
        $admin = User::factory()->adminAccess('admin', 'ADMIN-1')->create();
        [$secret] = $this->enrol($admin);
        $token = $this->login()['temp_token'];
        for ($i = 0; $i < 4; $i++) {
            $this->verify($token, '000000')->assertStatus(422);
        }
        $this->verify($token, '111111')->assertStatus(422); // 5th wrong: token destroyed
        $this->assertNull(app(TwoFactorService::class)->challenge($token));
    }

    public function test_login_verify_is_throttled(): void
    {
        $last = 0;
        for ($i = 0; $i < 11; $i++) {
            $last = $this->postJson('/api/2fa/login-verify', ['temp_token' => 'nope', 'code' => '123456'])->status();
        }
        $this->assertSame(429, $last);
    }

    public function test_a_deactivated_account_cannot_finish_the_challenge(): void
    {
        $admin = User::factory()->adminAccess('admin', 'ADMIN-1')->create();
        [$secret] = $this->enrol($admin);
        $token = $this->login()['temp_token'];
        $admin->fresh()->deactivate();
        $this->verify($token, Totp::codeAt($secret, Totp::step() + 1))->assertStatus(422);
        $this->assertGuest('web');
    }

    public function test_when_required_staff_without_it_can_only_open_enrolment_and_it_cannot_be_disabled(): void
    {
        config(['occ.two_factor_required' => true]);
        $admin = User::factory()->adminAccess('admin', 'ADMIN-1')->create();

        $this->signedIn($admin)->getJson('/api/admin/overview')->assertStatus(403)->assertJsonPath('code', 'two_factor_setup_required');
        $this->signedIn($admin)->getJson('/api/me')->assertOk()->assertJsonPath('user.two_factor_required', true);
        $this->signedIn($admin)->postJson('/api/2fa/setup')->assertOk();

        $this->enrol($admin->fresh());
        $this->signedIn($admin->fresh())->getJson('/api/admin/overview')->assertOk();
        $this->signedIn($admin->fresh())->postJson('/api/2fa/disable', ['password' => 'password'])->assertStatus(403)->assertJsonPath('code', 'two_factor_required');
        $this->assertTrue($admin->fresh()->hasTwoFactor());
        $this->signedIn(User::factory()->create())->getJson('/api/logbook/hours')->assertOk(); // trainees never forced
    }

    public function test_optional_mode_disable_and_regenerate_need_the_password_and_are_logged(): void
    {
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class); // route throttles are tested separately
        $admin = User::factory()->adminAccess('admin', 'ADMIN-1')->create();
        [, $old] = $this->enrol($admin);

        $this->signedIn($admin->fresh())->postJson('/api/2fa/recovery-codes', ['password' => 'wrong'])->assertStatus(422)->assertJsonValidationErrors('password');
        $new = $this->signedIn($admin->fresh())->postJson('/api/2fa/recovery-codes', ['password' => 'password'])->assertOk()->json('recovery_codes');
        $this->assertCount(8, $new);
        $this->verify($this->login()['temp_token'], $old[0])->assertStatus(422); // old codes no longer work
        $this->verify($this->login()['temp_token'], $new[0])->assertOk();

        $this->signedIn($admin->fresh())->postJson('/api/2fa/disable', ['password' => 'wrong'])->assertStatus(422);
        $this->assertTrue($admin->fresh()->hasTwoFactor());
        $this->signedIn($admin->fresh())->postJson('/api/2fa/disable', ['password' => 'password'])->assertOk();
        $this->assertFalse($admin->fresh()->hasTwoFactor());
        $this->assertSame(['two_factor.recovery_codes_regenerated', 'two_factor.disabled'], ActivityLog::where('subject_id', $admin->id)->where('action', 'like', 'two_factor.%')->where('action', '!=', 'two_factor.recovery_code_used')->orderBy('id')->pluck('action')->all());
    }

    public function test_admin_reset_clears_another_staff_account_needs_own_password_and_revokes_sessions(): void
    {
        $admin = User::factory()->adminAccess('admin', 'ADMIN-1')->create();
        $coord = User::factory()->adminAccess('coordinator', 'COORD-1')->create();
        $this->enrol($coord);
        $this->otherDevice($coord, 'dev-c');

        $this->signedIn($admin)->postJson("/api/admin/users/{$coord->id}/two-factor/reset", ['admin_password' => 'wrong'])->assertStatus(422);
        $this->assertTrue($coord->fresh()->hasTwoFactor());
        $this->signedIn($coord->fresh())->postJson("/api/admin/users/{$coord->id}/two-factor/reset", ['admin_password' => 'password'])->assertForbidden();

        $this->signedIn($admin)->postJson("/api/admin/users/{$coord->id}/two-factor/reset", ['admin_password' => 'password'])->assertOk();
        $this->assertFalse($coord->fresh()->hasTwoFactor());
        $this->assertSame(0, DB::table('sessions')->where('id', 'dev-c')->count());
        $this->assertTrue(ActivityLog::where('action', 'two_factor.reset_by_admin')->where('subject_id', $coord->id)->where('actor_id', $admin->id)->exists());
        $this->postJson('/api/auth/administrator', ['admin_id' => 'COORD-1', 'password' => 'password'])->assertOk()->assertJsonPath('status', 'ok');
    }

    public function test_break_glass_command_clears_two_factor(): void
    {
        $admin = User::factory()->adminAccess('admin', 'ADMIN-1')->create();
        $this->enrol($admin);
        $this->artisan('occ:two-factor-reset', ['admin_id' => 'ADMIN-1'])->assertSuccessful();
        $this->assertFalse($admin->fresh()->hasTwoFactor());
        $this->artisan('occ:two-factor-reset', ['admin_id' => 'NOPE'])->assertFailed();
    }
}
