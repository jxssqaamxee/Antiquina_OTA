<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** A sign-up that never verified its email is not enrolled, is invisible to staff, and is deleted after a day. */
class UnverifiedAccountsTest extends TestCase
{
    use RefreshDatabase;

    public function test_unverified_trainees_are_not_counted_for_the_admin(): void
    {
        User::factory()->create();
        User::factory()->create(['email_verified_at' => null]);
        $admin = User::factory()->admin()->create();

        $this->signedIn($admin)->getJson('/api/admin/overview')->assertOk()
            ->assertJsonPath('accounts.trainees', 1)->assertJsonPath('accounts.unverified', 1);
    }

    public function test_purge_deletes_old_unverified_trainees_only(): void
    {
        Storage::fake('local');
        $old = User::factory()->create(['email_verified_at' => null]);
        $old->forceFill(['created_at' => now()->subHours(30)])->save();
        $fresh = User::factory()->create(['email_verified_at' => null]);
        $verified = User::factory()->create();
        $verified->forceFill(['created_at' => now()->subDays(10)])->save();
        $coord = User::factory()->coordinator()->create(['email_verified_at' => null]);
        $coord->forceFill(['created_at' => now()->subDays(10)])->save();

        $this->artisan('accounts:purge-unverified', ['--dry-run' => true])->assertSuccessful();
        $this->assertDatabaseHas('users', ['id' => $old->id]);

        $this->artisan('accounts:purge-unverified')->assertSuccessful();
        $this->assertDatabaseMissing('users', ['id' => $old->id]);
        foreach ([$fresh, $verified, $coord] as $keep) {
            $this->assertDatabaseHas('users', ['id' => $keep->id]);
        }
        $this->assertSame(0, DB::table('student_enrollments')->where('user_id', $old->id)->count());
    }
}
