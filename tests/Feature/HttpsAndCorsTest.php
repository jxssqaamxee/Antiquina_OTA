<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HttpsAndCorsTest extends TestCase
{
    // The pages start a database-backed session, so the `sessions` table must exist.
    use RefreshDatabase;

    public function test_http_is_left_alone_when_the_switch_is_off(): void
    {
        config(['occ.force_https' => false]);
        $this->get('http://localhost/')->assertOk();
    }

    public function test_http_is_redirected_to_https_when_the_switch_is_on(): void
    {
        config(['occ.force_https' => true]);
        $this->get('http://localhost/login')->assertStatus(308)->assertRedirect('https://localhost/login');
        $this->get('https://localhost/login')->assertOk();
    }

    public function test_health_check_is_never_redirected(): void
    {
        config(['occ.force_https' => true]);
        $this->get('http://localhost/up')->assertOk();
    }

    public function test_a_foreign_origin_gets_no_cors_permission(): void
    {
        $r = $this->withHeaders(['Origin' => 'https://evil.example'])->get('/api/config');
        // With one allowed origin the CORS layer answers with that origin (APP_URL), never the caller's.
        $this->assertNotSame('https://evil.example', $r->headers->get('Access-Control-Allow-Origin'));
        $this->assertNotSame('*', $r->headers->get('Access-Control-Allow-Origin'));
    }
}
