<?php

namespace Tests\Feature;

use Tests\TestCase;

/** OCC_MOBILE_ONLY reaches the page as <html data-mobile-only="…"> (read by utils/mobileOnly.js). */
class MobileOnlyTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite(); // no compiled assets needed to read the <html> attribute
    }

    public function test_switch_on_marks_the_page(): void
    {
        config(['occ.mobile_only' => true]);
        $this->get('/')->assertOk()->assertSee('data-mobile-only="true"', false);
    }

    public function test_switch_off_marks_the_page(): void
    {
        config(['occ.mobile_only' => false]);
        $this->get('/')->assertOk()->assertSee('data-mobile-only="false"', false);
    }

    public function test_unknown_value_never_locks_everyone_out(): void
    {
        config(['occ.mobile_only' => 'ture']);
        $this->get('/login')->assertOk()->assertSee('data-mobile-only="false"', false);
    }

    public function test_string_values_are_understood(): void
    {
        foreach (['true', '1', 'on', 'yes', 'TRUE'] as $v) {
            config(['occ.mobile_only' => $v]);
            $this->get('/')->assertSee('data-mobile-only="true"', false);
        }
    }
}
