<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\AdminSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/** The first Admin comes from INITIAL_ADMIN_* in .env, must change the password, and is never re-seeded over. */
class AdminSeederTest extends TestCase
{
    use RefreshDatabase;

    private const VARS = ['INITIAL_ADMIN_NAME' => 'Maria Santos Reyes', 'INITIAL_ADMIN_EMAIL' => 'Admin@Example.com', 'INITIAL_ADMIN_PASSWORD' => 'Seed-Pass-123!', 'INITIAL_ADMIN_ID' => 'admin-00001'];

    private function setEnv(array $vars): void
    {
        foreach ($vars as $k => $v) {
            putenv("$k=$v");
            $_ENV[$k] = $_SERVER[$k] = $v;
        }
    }

    protected function tearDown(): void
    {
        foreach (array_keys(self::VARS) as $k) {
            putenv($k);
            unset($_ENV[$k], $_SERVER[$k]);
        }
        parent::tearDown();
    }

    public function test_seeds_a_verified_admin_flagged_for_password_change(): void
    {
        $this->setEnv(self::VARS);
        (new AdminSeeder)->run();
        $a = User::where('email', 'admin@example.com')->firstOrFail();
        $this->assertSame('admin', $a->role);
        $this->assertSame('ADMIN-00001', $a->staff_id);
        $this->assertSame('Maria Santos', $a->first_name);
        $this->assertSame('Reyes', $a->last_name);
        $this->assertTrue($a->must_change_password);
        $this->assertNotNull($a->email_verified_at);
        $this->assertTrue(Hash::check('Seed-Pass-123!', $a->password));
    }

    public function test_skips_without_env_and_never_creates_a_second_admin(): void
    {
        (new AdminSeeder)->run();
        $this->assertSame(0, User::count());

        $this->setEnv(self::VARS);
        (new AdminSeeder)->run();
        $this->setEnv(['INITIAL_ADMIN_EMAIL' => 'other@example.com', 'INITIAL_ADMIN_ID' => 'ADMIN-00002']);
        (new AdminSeeder)->run();
        $this->assertSame(1, User::where('role', 'admin')->count());
    }

    public function test_changing_the_password_clears_the_flag_and_reseeding_leaves_it_alone(): void
    {
        $this->setEnv(self::VARS);
        (new AdminSeeder)->run();
        $a = User::where('email', 'admin@example.com')->firstOrFail();
        $this->assertTrue($this->signedIn($a)->getJson('/api/me')->json('user.must_change_password'));

        $this->signedIn($a)->putJson('/api/profile/password', [
            'current_password' => 'Seed-Pass-123!', 'password' => 'My-New-Pass-456!', 'password_confirmation' => 'My-New-Pass-456!',
        ])->assertOk()->assertJsonPath('user.must_change_password', false);

        (new AdminSeeder)->run(); // .env still holds the old password: it must not come back
        $a->refresh();
        $this->assertFalse($a->must_change_password);
        $this->assertTrue(Hash::check('My-New-Pass-456!', $a->password));
    }

    public function test_never_turns_an_existing_trainee_into_an_admin(): void
    {
        User::factory()->create(['email' => 'admin@example.com', 'student_id' => '2024-1-00009', 'email_verified_at' => now()]);
        $this->setEnv(self::VARS);
        (new AdminSeeder)->run();
        $this->assertSame('trainee', User::where('email', 'admin@example.com')->value('role'));
    }
}
