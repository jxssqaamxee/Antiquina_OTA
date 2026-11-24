<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

/** Phase 5: COOP header and the root-DB-user preflight warning. */
class Phase5HardeningTest extends TestCase
{
    use RefreshDatabase;

    public function test_responses_carry_a_same_origin_opener_policy(): void
    {
        $this->get('/')->assertHeader('Cross-Origin-Opener-Policy', 'same-origin');
        $this->getJson('/api/config')->assertHeader('Cross-Origin-Opener-Policy', 'same-origin');
    }

    public function test_preflight_warns_when_the_database_user_is_root(): void
    {
        config(['app.key' => 'base64:'.base64_encode(random_bytes(32)), 'app.env' => 'production', 'app.debug' => false,
            'occ.roster_enforce' => true, 'occ.trusted_proxies' => '10.0.0.1', 'occ.initial_admin_password' => null]);
        $conn = config('database.default');
        config(["database.connections.{$conn}.username" => 'root']);
        Artisan::call('occ:preflight');
        $this->assertStringContainsString('database user is not root', Artisan::output());

        config(["database.connections.{$conn}.username" => 'occ_app']);
        Artisan::call('occ:preflight');
        $out = Artisan::output();
        $this->assertDoesNotMatchRegularExpression('/WARN.*database user is not root/', $out);
    }
}
