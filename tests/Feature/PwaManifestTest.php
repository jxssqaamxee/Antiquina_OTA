<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** The installed app's bar colour: navy on light themes, white on the dark theme (like sclf_APP). */
class PwaManifestTest extends TestCase
{
    // Rendering /login starts a session, and the session driver is "database" under phpunit.
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite(); // no compiled assets needed to read the <meta> / <link> tags
    }

    public function test_manifest_is_navy_on_the_default_light_theme_and_named_occdl(): void
    {
        $this->get('/manifest.json')->assertOk()
            ->assertJsonPath('name', 'OCCDL')
            ->assertJsonPath('short_name', 'OCCDL')
            ->assertJsonPath('theme_color', '#01215f')
            ->assertJsonPath('background_color', '#ffffff');
    }

    public function test_manifest_is_white_on_the_dark_theme(): void
    {
        $this->withUnencryptedCookie('occ-theme', 'black')->get('/manifest.json')->assertOk()
            ->assertJsonPath('theme_color', '#ffffff')
            ->assertJsonPath('background_color', '#0a0c12');
    }

    public function test_an_unknown_theme_cookie_falls_back_to_light(): void
    {
        $this->withUnencryptedCookie('occ-theme', '<script>')->get('/manifest.json')->assertOk()
            ->assertJsonPath('theme_color', '#01215f');
    }

    public function test_the_page_theme_color_follows_the_theme_cookie(): void
    {
        $this->get('/login')->assertOk()->assertSee('<meta name="theme-color" content="#01215f">', false);
        $this->withUnencryptedCookie('occ-theme', 'black')->get('/login')->assertOk()
            ->assertSee('<meta name="theme-color" content="#ffffff">', false);
    }

    public function test_manifest_is_plain_json_and_opens_no_session(): void
    {
        $res = $this->get('/manifest.json')->assertOk();
        $this->assertStringStartsWith('application/manifest+json', (string) $res->headers->get('Content-Type'));
        $this->assertIsArray(json_decode($res->getContent(), true));
        $this->assertEmpty($res->headers->getCookies(), 'the manifest must not set cookies / start a session');
    }

    public function test_the_old_manifest_address_still_answers_with_the_same_json(): void
    {
        $this->get('/manifest.webmanifest')->assertOk()->assertJsonPath('short_name', 'OCCDL');
    }

    public function test_the_page_links_to_the_json_manifest_and_the_new_touch_icon(): void
    {
        $this->get('/login')->assertOk()
            ->assertSee('href="/manifest.json"', false)
            ->assertSee('href="/images/apple-touch-icon.png"', false);
    }

    public function test_staff_app_installs_from_administrator_as_its_own_app(): void
    {
        $staff = $this->get('/manifest-administrator.json')->assertOk()
            ->assertJsonPath('id', '/administrator')
            ->assertJsonPath('short_name', 'OCCDL Admin')
            ->assertJsonPath('theme_color', '#01215f');
        $this->assertStringStartsWith('/administrator', $staff->json('start_url'));
        $this->assertNotSame($this->get('/manifest.json')->json('id'), $staff->json('id')); // separate installs

        $this->get('/manifest.json')->assertJsonPath('start_url', '/?source=pwa');
    }

    public function test_the_page_points_to_the_right_manifest_for_its_address(): void
    {
        foreach (['/administrator', '/admin', '/coordinator', '/setup-account'] as $path) {
            $this->get($path)->assertOk()->assertSee('href="/manifest-administrator.json"', false)->assertSee('content="OCCDL Admin"', false);
        }
        foreach (['/', '/login'] as $path) {
            $this->get($path)->assertOk()->assertSee('href="/manifest.json"', false);
        }
    }
}
