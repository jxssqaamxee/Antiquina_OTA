<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Phase 6: the desktop Admin / Coordinator screens only work because Laravel enforces every call they make. */
class StaffInterfaceTest extends TestCase
{
    use RefreshDatabase;

    private function staff(string $role, string $id): User
    {
        return User::factory()->create(['role' => $role, 'staff_id' => $id, 'student_id' => null, 'course' => null, 'email_verified_at' => now()]);
    }

    /** DESKTOP-01: every endpoint the Admin screens call is closed to Coordinators and Trainees. */
    public function test_admin_endpoints_reject_other_roles(): void
    {
        $paths = ['/api/admin/overview', '/api/admin/courses', '/api/admin/sections', '/api/admin/enrollments/unassigned',
            '/api/admin/coordinators', '/api/admin/activity', '/api/admin/establishments', '/api/admin/academic-years'];
        $others = [$this->staff('coordinator', 'COORD-001'), User::factory()->create(['student_id' => '2024-1-00001', 'email_verified_at' => now()])];
        foreach ($others as $u) {
            foreach ($paths as $p) {
                $this->signedIn($u)->getJson($p)->assertForbidden();
            }
        }
        $admin = $this->staff('admin', 'ADMIN-001');
        foreach ($paths as $p) {
            $this->signedIn($admin)->getJson($p)->assertOk();
        }
    }

    /** DESKTOP-02: every endpoint the Coordinator screens call is closed to Admins and Trainees. */
    public function test_coordinator_endpoints_reject_other_roles(): void
    {
        $paths = ['/api/coordinator/overview', '/api/coordinator/trainees', '/api/coordinator/approvals',
            '/api/coordinator/establishments', '/api/coordinator/activity'];
        $others = [$this->staff('admin', 'ADMIN-001'), User::factory()->create(['student_id' => '2024-1-00001', 'email_verified_at' => now()])];
        foreach ($others as $u) {
            foreach ($paths as $p) {
                $this->signedIn($u)->getJson($p)->assertForbidden();
            }
        }
        $coord = $this->staff('coordinator', 'COORD-001');
        foreach ($paths as $p) {
            $this->signedIn($coord)->getJson($p)->assertOk();
        }
    }

    public function test_signed_out_visitors_get_401_on_staff_endpoints(): void
    {
        $this->getJson('/api/admin/overview')->assertUnauthorized();
        $this->getJson('/api/coordinator/overview')->assertUnauthorized();
    }
}
