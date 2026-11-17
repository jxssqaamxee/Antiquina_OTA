<?php

namespace Tests\Feature;

use Tests\TestCase;

/** The installed app's bar colour: navy on light themes, white on the dark theme (like sclf_APP). */
class PwaManifestTest extends TestCase
{
    public function test_manifest_is_navy_on_the_default_light_theme_and_named_occdl(): void
    {
        $this->get('/manifest.webmanifest')->assertOk()
            ->assertJsonPath('name', 'OCCDL')
            ->assertJsonPath('short_name', 'OCCDL')
            ->assertJsonPath('theme_color', '#01215f')
            ->assertJsonPath('background_color', '#ffffff');
    }

    public function test_manifest_is_white_on_the_dark_theme(): void
    {
        $this->withUnencryptedCookie('occ-theme', 'black')->get('/manifest.webmanifest')->assertOk()
            ->assertJsonPath('theme_color', '#ffffff')
            ->assertJsonPath('background_color', '#0a0c12');
    }

    public function test_an_unknown_theme_cookie_falls_back_to_light(): void
    {
        $this->withUnencryptedCookie('occ-theme', '<script>')->get('/manifest.webmanifest')->assertOk()
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
        $res = $this->get('/manifest.webmanifest')->assertOk();
        $this->assertStringStartsWith('application/manifest+json', (string) $res->headers->get('Content-Type'));
        $this->assertIsArray(json_decode($res->getContent(), true));
        $this->assertEmpty($res->headers->getCookies(), 'the manifest must not set cookies / start a session');
    }
}
