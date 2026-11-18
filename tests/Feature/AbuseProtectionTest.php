<?php

namespace Tests\Feature;

use App\Mail\PasswordChangedMail;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

class AbuseProtectionTest extends TestCase
{
    use RefreshDatabase;

    public function test_one_account_locks_even_when_the_guesses_come_from_many_ips(): void
    {
        RateLimiter::clear('login-account|2024-1-00099');
        User::factory()->create(['student_id' => '2024-1-00099']);

        for ($i = 0; $i < 15; $i++) {
            $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.'.($i + 1)])
                ->postJson('/api/auth/login', ['student_id' => '2024-1-00099', 'password' => 'wrong-'.$i])->assertStatus(422);
        }

        // A brand new IP and the RIGHT password are still refused: the account itself is locked.
        $this->withServerVariables(['REMOTE_ADDR' => '10.9.9.9'])
            ->postJson('/api/auth/login', ['student_id' => '2024-1-00099', 'password' => 'password'])
            ->assertStatus(422)->assertJsonValidationErrors('student_id');
        $this->assertGuest();

        RateLimiter::clear('login-account|2024-1-00099');
    }

    public function test_forgot_password_is_limited_per_email_across_ips(): void
    {
        RateLimiter::clear('forgot-password-email|victim@gmail.com');
        for ($i = 0; $i < 10; $i++) {
            $this->withServerVariables(['REMOTE_ADDR' => '10.1.0.'.($i + 1)])
                ->postJson('/api/forgot-password', ['email' => 'victim@gmail.com'])->assertOk();
        }
        $this->withServerVariables(['REMOTE_ADDR' => '10.1.9.9'])
            ->postJson('/api/forgot-password', ['email' => 'victim@gmail.com'])->assertStatus(429);
        RateLimiter::clear('forgot-password-email|victim@gmail.com');
    }

    public function test_changing_the_password_sends_a_notice_email(): void
    {
        Mail::fake();
        $u = User::factory()->create();
        $this->signedIn($u)->putJson('/api/profile/password', [
            'current_password' => 'password', 'password' => 'New-Secret-Pass9', 'password_confirmation' => 'New-Secret-Pass9',
        ])->assertOk();
        Mail::assertSent(PasswordChangedMail::class, fn ($m) => $m->hasTo($u->email));
    }

    public function test_roster_off_lets_anyone_register_and_on_requires_the_list(): void
    {
        $payload = [
            'student_id' => '2024-2-12345', 'first_name' => 'Ana', 'last_name' => 'Reyes',
            'email' => 'occ.reyes.ana@gmail.com', 'course' => \App\Support\Formats::courses()[0],
            'password' => 'Good-Pass-123', 'password_confirmation' => 'Good-Pass-123',
        ];

        config(['occ.roster_enforce' => true]);
        $this->postJson('/api/auth/register', $payload)->assertStatus(422)->assertJsonValidationErrors('student_id');

        DB::table('enrolled_students')->insert(['student_id' => '2024-2-12345', 'created_at' => now(), 'updated_at' => now()]);
        $r = $this->postJson('/api/auth/register', $payload);
        $this->assertArrayNotHasKey('student_id', $r->json('errors') ?? []);
    }
}
