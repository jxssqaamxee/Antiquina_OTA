<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\SecurityLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

class SecurityLoggingTest extends TestCase
{
    use RefreshDatabase;

    private string $logFile;

    protected function setUp(): void
    {
        parent::setUp();
        $this->logFile = tempnam(sys_get_temp_dir(), 'seclog');
        config(['logging.channels.security' => ['driver' => 'single', 'path' => $this->logFile, 'level' => 'debug']]);
        Log::forgetChannel('security');
        Cache::flush();
    }

    protected function tearDown(): void
    {
        @unlink($this->logFile);
        parent::tearDown();
    }

    private function log(): string
    {
        return (string) file_get_contents($this->logFile);
    }

    public function test_failed_logins_and_the_lockout_are_logged_without_the_password(): void
    {
        RateLimiter::clear('login|2024-1-00042|127.0.0.1');
        User::factory()->create(['student_id' => '2024-1-00042']);

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', ['student_id' => '2024-1-00042', 'password' => 'Secret-Wrong-'.$i])->assertStatus(422);
        }
        $this->postJson('/api/auth/login', ['student_id' => '2024-1-00042', 'password' => 'Secret-Wrong-X'])->assertStatus(422);

        $this->assertSame(5, substr_count($this->log(), 'login_failed'));
        $this->assertSame(1, substr_count($this->log(), 'login_lockout'));
        $this->assertStringContainsString('2024-1-00042', $this->log());
        $this->assertStringNotContainsString('Secret-Wrong', $this->log());
        RateLimiter::clear('login|2024-1-00042|127.0.0.1');
    }

    public function test_a_successful_login_is_logged(): void
    {
        User::factory()->create(['student_id' => '2024-1-00043']);
        $this->postJson('/api/auth/login', ['student_id' => '2024-1-00043', 'password' => 'password'])->assertOk();
        $this->assertStringContainsString('login_ok', $this->log());
        RateLimiter::clear('login|2024-1-00043|127.0.0.1');
    }

    public function test_password_reset_request_is_logged_without_the_email_address(): void
    {
        $this->postJson('/api/forgot-password', ['email' => 'someone@gmail.com'])->assertOk();
        $this->assertStringContainsString('password_reset_requested', $this->log());
        $this->assertStringNotContainsString('someone@gmail.com', $this->log());
    }

    public function test_a_password_change_is_logged(): void
    {
        $u = User::factory()->create();
        $this->signedIn($u)->putJson('/api/profile/password', [
            'current_password' => 'password', 'password' => 'New-Secret-Pass9', 'password_confirmation' => 'New-Secret-Pass9',
        ])->assertOk();
        $this->assertStringContainsString('password_changed', $this->log());
        $this->assertStringNotContainsString('New-Secret-Pass9', $this->log());
    }

    public function test_one_alert_is_raised_when_failures_reach_the_limit(): void
    {
        config(['occ.alert_failures' => 3, 'occ.alert_window_minutes' => 10]);
        for ($i = 0; $i < 6; $i++) {
            SecurityLog::failure('login_failed', ['student_id' => 'x']);
        }
        $this->assertSame(1, substr_count($this->log(), 'security_alert'));
    }
}
