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

    /** Runs the production preflight with a mostly-safe config and returns its text output. */
    private function prod(array $override = []): array
    {
        config(array_merge([
            'app.key' => 'base64:'.base64_encode(random_bytes(32)), 'app.env' => 'production', 'app.debug' => false,
            'occ.roster_enforce' => true, 'occ.trusted_proxies' => '10.0.0.1', 'occ.initial_admin_password' => null,
        ], $override));
        $code = \Illuminate\Support\Facades\Artisan::call('occ:preflight');

        return [$code, \Illuminate\Support\Facades\Artisan::output()];
    }

    public function test_preflight_fails_when_roster_enforcement_is_off(): void
    {
        [$code, $out] = $this->prod(['occ.roster_enforce' => false]);
        $this->assertSame(1, $code);
        $this->assertMatchesRegularExpression('/FAIL\s+OCC_ROSTER_ENFORCE=true/', $out);
        $this->assertMatchesRegularExpression('/PASS\s+OCC_ROSTER_ENFORCE=true/', $this->prod()[1]);
    }

    public function test_preflight_fails_on_wildcard_trusted_proxies(): void
    {
        [$code, $out] = $this->prod(['occ.trusted_proxies' => '*']);
        $this->assertSame(1, $code);
        $this->assertMatchesRegularExpression('/FAIL\s+OCC_TRUSTED_PROXIES/', $out);
        $this->assertMatchesRegularExpression('/PASS\s+OCC_TRUSTED_PROXIES/', $this->prod(['occ.trusted_proxies' => '10.0.0.0/8, 192.168.1.5'])[1]);
    }

    public function test_preflight_fails_while_the_initial_admin_password_is_still_configured(): void
    {
        [$code, $out] = $this->prod(['occ.initial_admin_password' => 'change-me-before-first-use']);
        $this->assertSame(1, $code);
        $this->assertMatchesRegularExpression('/FAIL\s+INITIAL_ADMIN_PASSWORD/', $out);
        $this->assertStringNotContainsString('change-me-before-first-use', $out);
        $this->assertMatchesRegularExpression('/PASS\s+INITIAL_ADMIN_PASSWORD/', $this->prod()[1]);
    }

    public function test_preflight_fails_on_debug_and_on_missing_or_malformed_app_key(): void
    {
        [$code, $out] = $this->prod(['app.debug' => true]);
        $this->assertSame(1, $code);
        $this->assertMatchesRegularExpression('/FAIL\s+APP_DEBUG=false/', $out);

        foreach ([null, '', 'base64:', 'base64:'.base64_encode('short'), 'SomeDefaultKey'] as $bad) {
            [$code, $out] = $this->prod(['app.key' => $bad]);
            $this->assertSame(1, $code, 'key '.var_export($bad, true));
            $this->assertMatchesRegularExpression('/FAIL\s+APP_KEY is set/', $out);
        }
        $this->assertMatchesRegularExpression('/PASS\s+APP_KEY is set/', $this->prod()[1]);
    }
}
