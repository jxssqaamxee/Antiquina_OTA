<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SecurityHeadersTest extends TestCase
{
    // The pages start a database-backed session, so the `sessions` table must exist.
    use RefreshDatabase;

    public function test_pages_and_api_carry_the_security_headers(): void
    {
        foreach (['/', '/api/config'] as $url) {
            $r = $this->get($url);
            $r->assertHeader('X-Content-Type-Options', 'nosniff');
            $r->assertHeader('X-Frame-Options', 'DENY');
            $r->assertHeader('Permissions-Policy');
            $r->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        }
    }

    public function test_hsts_only_on_https(): void
    {
        $this->get('/')->assertHeaderMissing('Strict-Transport-Security');
        $this->get('https://localhost/')->assertHeader('Strict-Transport-Security');
    }

    public function test_reset_page_sends_no_referrer(): void
    {
        $this->get('/reset-password/abc123')->assertHeader('Referrer-Policy', 'no-referrer');
    }

    public function test_csp_is_report_only_by_default_and_enforced_when_switched_on(): void
    {
        $r = $this->get('/');
        $r->assertHeaderMissing('Content-Security-Policy');
        $this->assertStringContainsString("frame-ancestors 'none'", $r->headers->get('Content-Security-Policy-Report-Only'));

        config(['occ.csp_enforce' => true]);
        $r = $this->get('/');
        $this->assertStringContainsString("object-src 'none'", $r->headers->get('Content-Security-Policy'));
    }

    public function test_inline_script_gets_the_same_nonce_as_the_policy(): void
    {
        $r = $this->get('/');
        preg_match("/'nonce-([^']+)'/", $r->headers->get('Content-Security-Policy-Report-Only'), $m);
        $this->assertNotEmpty($m[1] ?? null);
        $this->assertStringContainsString('nonce="'.$m[1].'"', $r->getContent());
    }
}
