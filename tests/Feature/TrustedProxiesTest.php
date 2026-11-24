<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Phase 2 (F9): by default no proxy is trusted, so a forged X-Forwarded-For cannot change the client IP used by rate limits. */
class TrustedProxiesTest extends TestCase
{
    use RefreshDatabase;

    public function test_forwarded_headers_are_ignored_by_default(): void
    {
        Route::get('/api/_ip', fn (\Illuminate\Http\Request $r) => response()->json(['ip' => $r->ip(), 'secure' => $r->isSecure()]));

        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.9'])
            ->withHeaders(['X-Forwarded-For' => '1.2.3.4', 'X-Forwarded-Proto' => 'https'])
            ->getJson('/api/_ip')->assertOk()->assertJsonPath('ip', '203.0.113.9')->assertJsonPath('secure', false);
    }
}
