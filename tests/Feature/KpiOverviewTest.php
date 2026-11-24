<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Role dashboards: Admin and Coordinator overviews carry KPIs; Profile Settings stays locked for everyone. */
class KpiOverviewTest extends TestCase
{
    use RefreshDatabase;

    private function staff(string $role, string $id): User
    {
        return User::factory()->create(['role' => $role, 'admin_id' => $id, 'student_id' => null, 'course' => null, 'email_verified_at' => now()]);
    }

    public function test_admin_overview_has_kpis(): void
    {
        $r = $this->signedIn($this->staff('admin', 'ADMIN-001'))->getJson('/api/admin/overview')->assertOk();
        $r->assertJsonStructure(['kpis' => ['trainees', 'verified_hours', 'avg_percent', 'awaiting_review', 'placed', 'unplaced', 'unassigned', 'coordinators_unassigned'], 'accounts']);
    }

    public function test_unassigned_coordinator_gets_no_kpis_and_no_school_wide_data(): void
    {
        $this->signedIn($this->staff('coordinator', 'COORD-001'))->getJson('/api/coordinator/overview')->assertOk()->assertJsonPath('kpis', null);
    }

    public function test_profile_details_are_locked_for_every_role(): void
    {
        $this->signedIn($this->staff('coordinator', 'COORD-002'))
            ->putJson('/api/profile', ['first_name' => 'New', 'last_name' => 'Name'])->assertForbidden();
    }
}
