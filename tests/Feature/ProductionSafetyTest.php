<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProductionSafetyTest extends TestCase
{
    use RefreshDatabase;

    public function test_seeder_creates_the_demo_user_outside_production(): void
    {
        $this->seed(DatabaseSeeder::class);
        $this->assertSame(1, User::count());
    }

    public function test_seeder_refuses_to_run_in_production(): void
    {
        $this->app['env'] = 'production';
        // Call the seeder directly: `seed()` goes through db:seed, which asks for confirmation in production.
        (new DatabaseSeeder)->run();
        $this->assertSame(0, User::count());
    }
}
