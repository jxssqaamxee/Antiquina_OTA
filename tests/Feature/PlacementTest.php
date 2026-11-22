<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Course;
use App\Models\HostClient;
use App\Models\HostEstablishment;
use App\Models\Section;
use App\Models\User;
use App\Services\Academic\AcademicSeeder;
use App\Services\Academic\CoordinatorAssignmentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Phase 5b: establishments, placements, and server-managed (read-only in sync) schedules. */
class PlacementTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $coord;
    private User $trainee;
    private User $outsider;

    protected function setUp(): void
    {
        parent::setUp();
        AcademicSeeder::run();
        $mk = fn ($role, $id) => User::factory()->create(['role' => $role, 'staff_id' => $id, 'student_id' => null, 'course' => null, 'email_verified_at' => now()]);
        $this->admin = $mk('admin', 'ADMIN-001');
        $this->coord = $mk('coordinator', 'COORD-001');
        $sec = Section::create(['course_id' => Course::where('code', 'BSIT')->value('id'), 'academic_year_id' => AcademicYear::current()->id, 'year_level' => 4, 'label' => 'A']);
        $other = Section::create(['course_id' => $sec->course_id, 'academic_year_id' => $sec->academic_year_id, 'year_level' => 4, 'label' => 'B']);
        $this->trainee = User::factory()->create(['student_id' => '2024-1-00001', 'email_verified_at' => now()]);
        $this->outsider = User::factory()->create(['student_id' => '2024-1-00002', 'email_verified_at' => now()]);
        foreach ([[$this->trainee, $sec], [$this->outsider, $other]] as [$u, $s]) {
            $u->enrollments()->create(['course_id' => $s->course_id, 'academic_year_id' => $s->academic_year_id, 'section_id' => $s->id, 'year_level' => 4, 'status' => 'active']);
        }
        app(CoordinatorAssignmentService::class)->assign($this->admin, $this->coord, $sec);
    }

    private function body(int $est): array
    {
        return ['establishment_id' => $est, 'days' => [1, 2, 3], 'time_in' => '08:00', 'time_out' => '17:00'];
    }

    private function est(string $name = 'City Hall'): HostEstablishment
    {
        return HostEstablishment::create(['name' => $name, 'type' => 'public']);
    }

    private function push(array $clients, array $entries = [], ?int $base = null)
    {
        return $this->signedIn($this->trainee)->putJson('/api/sync/logbook-v2', ['value' => [
            'studentName' => 'Juan Dela Cruz', 'targetHours' => 486, 'lastClientId' => null, 'clients' => $clients, 'entries' => $entries,
        ]] + ($base !== null ? ['base_revision' => $base] : []));
    }

    public function test_coordinator_places_a_trainee_and_the_schedule_becomes_a_managed_host_client(): void
    {
        $est = $this->est();
        $this->signedIn($this->coord)->postJson("/api/coordinator/trainees/{$this->trainee->id}/placements", $this->body($est->id))->assertCreated();

        $hc = HostClient::where('user_id', $this->trainee->id)->first();
        $this->assertNotNull($hc->placement_id);
        $this->assertSame('City Hall', $hc->name);
        $doc = $this->signedIn($this->trainee)->getJson('/api/sync')->json('documents.logbook-v2');
        $this->assertTrue($doc['clients'][0]['managed']);
        $this->assertDatabaseHas('activity_logs', ['action' => 'placement.created']);
    }

    public function test_sync_cannot_edit_or_delete_a_managed_host_client(): void
    {
        $this->signedIn($this->admin)->postJson("/api/admin/trainees/{$this->trainee->id}/placements", $this->body($this->est()->id))->assertCreated();
        $hc = HostClient::first();

        // a device that already adopted the managed client tries to rename it, change its hours and then drop it
        $client = ['id' => $hc->client_uid, 'name' => 'Hacked', 'type' => 'private', 'days' => [5], 'timeIn' => '01:00', 'timeOut' => '02:00'];
        $this->push([$client])->assertOk();
        $this->assertSame('City Hall', $hc->fresh()->name);
        $this->assertSame('08:00', $hc->fresh()->time_in);
        $this->push([])->assertOk();
        $this->assertSame(1, HostClient::count());
        $this->signedIn($this->trainee)->deleteJson('/api/sync/logbook-v2')->assertOk();
        $this->assertSame(1, HostClient::count());
    }

    public function test_a_placement_bumps_the_revision_so_a_stale_device_gets_409(): void
    {
        $this->push([])->assertOk();
        $rev = $this->signedIn($this->trainee)->getJson('/api/sync')->json('revisions.logbook-v2');
        $this->signedIn($this->coord)->postJson("/api/coordinator/trainees/{$this->trainee->id}/placements", $this->body($this->est()->id))->assertCreated();
        $this->push([], [], $rev)->assertStatus(409);
    }

    public function test_coordinator_scope_is_enforced_for_placements(): void
    {
        $est = $this->est();
        $this->signedIn($this->coord)->postJson("/api/coordinator/trainees/{$this->outsider->id}/placements", $this->body($est->id))->assertNotFound();
        // another section's establishment is invisible and unusable
        $foreign = HostEstablishment::create(['name' => 'Elsewhere', 'type' => 'private', 'section_id' => Section::where('label', 'B')->value('id')]);
        $this->signedIn($this->coord)->postJson("/api/coordinator/trainees/{$this->trainee->id}/placements", $this->body($foreign->id))->assertNotFound();
        $names = collect($this->signedIn($this->coord)->getJson('/api/coordinator/establishments')->json('establishments'))->pluck('name')->all();
        $this->assertSame(['City Hall'], $names);
        $this->assertSame(0, HostClient::count());
    }

    public function test_coordinator_establishments_are_limited_to_their_section_and_trainees_have_no_access(): void
    {
        $this->signedIn($this->coord)->postJson('/api/coordinator/establishments', ['name' => 'Local Clinic', 'type' => 'public'])->assertCreated();
        $this->assertSame(Section::where('label', 'A')->value('id'), HostEstablishment::where('name', 'Local Clinic')->value('section_id'));
        $this->signedIn($this->trainee)->getJson('/api/coordinator/establishments')->assertForbidden();
        $this->signedIn($this->trainee)->postJson("/api/admin/trainees/{$this->trainee->id}/placements", [])->assertForbidden();
    }

    public function test_ending_a_placement_frees_the_host_client_and_keeps_history(): void
    {
        $this->signedIn($this->coord)->postJson("/api/coordinator/trainees/{$this->trainee->id}/placements", $this->body($this->est()->id))->assertCreated();
        $pid = \App\Models\TraineePlacement::value('id');
        $this->signedIn($this->coord)->deleteJson("/api/coordinator/placements/{$pid}")->assertOk();

        $this->assertNull(HostClient::first()->placement_id);
        $this->assertNotNull(\App\Models\TraineePlacement::first()->ended_at);
        $this->push([])->assertOk(); // now an ordinary host client: the trainee may remove it
        $this->assertSame(0, HostClient::count());
    }
}
