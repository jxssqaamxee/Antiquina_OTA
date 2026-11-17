<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** OCC_INSPECT_PROTECTION reaches the page as <html data-inspect-protection="…"> (read by utils/devtoolsGuard.js). */
class InspectProtectionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
    }

    public function test_switch_on_marks_the_page(): void
    {
        config(['occ.inspect_protection' => true]);
        $this->get('/')->assertOk()->assertSee('data-inspect-protection="true"', false);
    }

    public function test_switch_off_marks_the_page(): void
    {
        config(['occ.inspect_protection' => false]);
        $this->get('/')->assertOk()->assertSee('data-inspect-protection="false"', false);
    }

    public function test_unknown_value_never_locks_everyone_out(): void
    {
        config(['occ.inspect_protection' => 'ture']);
        $this->get('/login')->assertOk()->assertSee('data-inspect-protection="false"', false);
    }

    public function test_string_values_are_understood(): void
    {
        foreach (['true', '1', 'on', 'yes', 'TRUE'] as $v) {
            config(['occ.inspect_protection' => $v]);
            $this->get('/')->assertSee('data-inspect-protection="true"', false);
        }
    }
}
