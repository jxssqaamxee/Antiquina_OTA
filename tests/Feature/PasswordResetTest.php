<?php

namespace Tests\Feature;

use App\Mail\PasswordResetMail;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class PasswordResetTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // The reset email is sent in defer(): run it right away inside tests.
        $this->withoutDefer();
    }

    private function user(array $over = []): User
    {
        return User::create(array_merge([
            'student_id' => '2024-1-00077',
            'first_name' => 'Maria',
            'last_name' => 'Reyes',
            'email' => 'occ.reyes.maria@gmail.com',
            'course' => 'BSIT — Bachelor of Science in Information Technology',
            'password' => 'Old-Pass1234',
        ], $over));
    }

    /** Request a link and return [token, email] taken from the emailed URL. */
    private function requestLink(string $email): array
    {
        $this->postJson('/api/forgot-password', ['email' => $email])->assertOk();

        $url = null;
        Mail::assertSent(PasswordResetMail::class, function (PasswordResetMail $m) use (&$url) {
            $url = $m->resetUrl;

            return true;
        });

        $this->assertNotNull($url);
        preg_match('#/reset-password/([^?]+)\?email=(.+)$#', $url, $m);

        return [$m[1], urldecode($m[2])];
    }

    public function test_find_account_endpoint_no_longer_exists(): void
    {
        $this->postJson('/api/password/find-account', ['email' => 'occ.reyes.maria@gmail.com'])->assertStatus(404);
    }

    public function test_forgot_password_answers_the_same_for_known_and_unknown_emails(): void
    {
        Mail::fake();
        $this->user();

        $known = $this->postJson('/api/forgot-password', ['email' => 'occ.reyes.maria@gmail.com']);
        $unknown = $this->postJson('/api/forgot-password', ['email' => 'nobody@gmail.com']);

        $known->assertOk()->assertJsonPath('success', true);
        $unknown->assertOk()->assertJsonPath('success', true);
        $this->assertSame($known->json(), $unknown->json());
    }

    public function test_an_email_not_in_the_database_gets_no_reset_mail(): void
    {
        Mail::fake();

        $this->postJson('/api/forgot-password', ['email' => 'nobody@gmail.com'])->assertOk();

        Mail::assertNothingSent();
    }

    public function test_asking_too_often_is_rate_limited_whatever_the_email(): void
    {
        Mail::fake();

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/forgot-password', ['email' => 'nobody@gmail.com'])->assertOk();
        }
        $this->postJson('/api/forgot-password', ['email' => 'nobody@gmail.com'])->assertStatus(429);
    }

    public function test_full_reset_flow_changes_the_password_and_signs_out_every_device(): void
    {
        Mail::fake();
        $user = $this->user();
        $this->otherDevice($user);

        [$token, $email] = $this->requestLink($user->email);

        $this->postJson('/api/password/reset-token/check', ['token' => $token, 'email' => $email])
            ->assertOk()->assertJsonPath('data.valid', true);

        $this->postJson('/api/reset-password', [
            'token' => $token, 'email' => $email,
            'password' => 'New-Pass5678', 'password_confirmation' => 'New-Pass5678',
        ])->assertOk()->assertJsonPath('success', true);

        $this->assertSame(0, \Illuminate\Support\Facades\DB::table('sessions')->where('user_id', $user->id)->count());

        $this->postJson('/api/auth/login', ['student_id' => $user->student_id, 'password' => 'New-Pass5678'])->assertOk();
        $this->postJson('/api/auth/login', ['student_id' => $user->student_id, 'password' => 'Old-Pass1234'])->assertStatus(422);
    }

    public function test_a_link_works_only_once(): void
    {
        Mail::fake();
        $user = $this->user();
        [$token, $email] = $this->requestLink($user->email);

        $body = ['token' => $token, 'email' => $email, 'password' => 'New-Pass5678', 'password_confirmation' => 'New-Pass5678'];
        $this->postJson('/api/reset-password', $body)->assertOk();

        $this->postJson('/api/reset-password', $body)->assertStatus(422)->assertJsonPath('code', 'link_invalid');
        $this->postJson('/api/password/reset-token/check', ['token' => $token, 'email' => $email])
            ->assertOk()->assertJsonPath('data.valid', false);
    }

    public function test_a_wrong_token_is_refused(): void
    {
        $user = $this->user();

        $this->postJson('/api/reset-password', [
            'token' => 'not-a-real-token', 'email' => $user->email,
            'password' => 'New-Pass5678', 'password_confirmation' => 'New-Pass5678',
        ])->assertStatus(422)->assertJsonPath('code', 'link_invalid');
    }

    public function test_a_weak_password_is_rejected(): void
    {
        Mail::fake();
        $user = $this->user();
        [$token, $email] = $this->requestLink($user->email);

        $this->postJson('/api/reset-password', [
            'token' => $token, 'email' => $email, 'password' => 'short', 'password_confirmation' => 'short',
        ])->assertStatus(422)->assertJsonValidationErrors('password');
    }

    public function test_an_account_with_no_password_can_set_one_this_way(): void
    {
        Mail::fake();
        $user = $this->user(['password' => null]);
        [$token, $email] = $this->requestLink($user->email);

        $this->postJson('/api/reset-password', [
            'token' => $token, 'email' => $email, 'password' => 'New-Pass5678', 'password_confirmation' => 'New-Pass5678',
        ])->assertOk();

        $this->assertNotNull($user->fresh()->password);
    }
}
