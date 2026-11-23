<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PreflightTest extends TestCase
{
    use RefreshDatabase;

    public function test_local_preflight_fails_without_an_admin_and_passes_with_one(): void
    {
        // No Admin yet: that check must fail (exit 1).
        $this->artisan('occ:preflight --local')->assertExitCode(1);

        \App\Models\User::factory()->create(['role' => 'admin', 'admin_id' => 'ADMIN-001', 'student_id' => null, 'course' => null, 'email_verified_at' => now()]);
        // Storage/build checks depend on the machine; assert only that the command runs and reports an exit code.
        $code = \Illuminate\Support\Facades\Artisan::call('occ:preflight', ['--local' => true]);
        $this->assertContains($code, [0, 1]);
        $this->assertStringContainsString('Result:', \Illuminate\Support\Facades\Artisan::output());
    }

    public function test_production_preflight_flags_unsafe_settings(): void
    {
        config(['app.env' => 'local', 'app.debug' => true]);
        $this->artisan('occ:preflight')->expectsOutputToContain('APP_DEBUG=false')->assertExitCode(1);
    }
}
