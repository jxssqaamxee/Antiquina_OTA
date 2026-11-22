<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SyncTest extends TestCase
{
    use RefreshDatabase;

    public function test_requires_auth(): void
    {
        $this->getJson('/api/sync')->assertUnauthorized();
    }

    public function test_round_trip_and_isolation_between_users(): void
    {
        $a = User::factory()->create();
        $b = User::factory()->create();
        $logbook = [
            'studentName' => 'A', 'targetHours' => 486, 'lastClientId' => null,
            'clients' => [['id' => 'c1', 'name' => 'City Hall', 'type' => 'public', 'days' => [1, 2, 3, 4], 'timeIn' => '08:00', 'timeOut' => '17:00']],
            'entries' => [['id' => 'e1', 'date' => '2026-01-05', 'client' => 'c1', 'category' => 'regular', 'amIn' => '08:00', 'amOut' => '12:00', 'pmIn' => '', 'pmOut' => '', 'evIn' => '', 'evOut' => '', 'task' => '']],
        ];

        $this->signedIn($a)->putJson('/api/sync/logbook-v2', ['value' => $logbook])->assertOk();
        $this->signedIn($a)->putJson('/api/sync/logbook-v2', ['value' => array_replace($logbook, ['studentName' => 'A2'])])->assertOk();

        $this->signedIn($a)->getJson('/api/sync')->assertOk()
            ->assertJsonPath('documents.logbook-v2.entries.0.id', 'e1');
        $this->assertDatabaseCount('duty_entries', 1);
        $this->assertDatabaseCount('host_clients', 1);

        $this->signedIn($b)->getJson('/api/sync')->assertOk()->assertExactJson(['documents' => []]);
    }

    public function test_unknown_key_rejected_and_false_values_allowed(): void
    {
        $u = User::factory()->create();
        $this->signedIn($u)->putJson('/api/sync/evil-key', ['value' => 1])->assertNotFound();
        $this->signedIn($u)->putJson('/api/sync/onboarding-seen-v1', ['value' => true])->assertOk();
        $this->signedIn($u)->getJson('/api/sync')->assertJsonPath('documents.onboarding-seen-v1', true);
    }

    private function doc(string $name): array
    {
        return [
            'studentName' => $name, 'targetHours' => 486, 'lastClientId' => null,
            'viewClientId' => 'all', 'exportClientId' => 'all', // canonical defaults the server returns
            'clients' => [], 'entries' => [],
        ];
    }

    public function test_save_bumps_revision_and_get_returns_revisions(): void
    {
        $u = User::factory()->create();

        $this->signedIn($u)->putJson('/api/sync/logbook-v2', ['value' => $this->doc('A'), 'base_revision' => 0, 'save_id' => 's1'])
            ->assertOk()->assertJsonPath('ok', true)->assertJsonPath('revision', 1)->assertJsonMissingPath('value');
        $this->signedIn($u)->putJson('/api/sync/logbook-v2', ['value' => $this->doc('B'), 'base_revision' => 1, 'save_id' => 's2'])
            ->assertOk()->assertJsonPath('revision', 2);

        $this->signedIn($u)->getJson('/api/sync')->assertOk()
            ->assertJsonPath('revisions.logbook-v2', 2)
            ->assertJsonPath('documents.logbook-v2.studentName', 'B');
    }

    public function test_stale_revision_gets_409_with_server_document(): void
    {
        $u = User::factory()->create();
        $this->signedIn($u)->putJson('/api/sync/logbook-v2', ['value' => $this->doc('A'), 'base_revision' => 0, 'save_id' => 's1'])->assertOk();
        $this->signedIn($u)->putJson('/api/sync/logbook-v2', ['value' => $this->doc('B'), 'base_revision' => 1, 'save_id' => 's2'])->assertOk();

        $this->signedIn($u)->putJson('/api/sync/logbook-v2', ['value' => $this->doc('C'), 'base_revision' => 1, 'save_id' => 's3'])
            ->assertStatus(409)
            ->assertJsonPath('revision', 2)
            ->assertJsonPath('value.studentName', 'B')
            ->assertJsonStructure(['message']);

        $this->signedIn($u)->getJson('/api/sync')->assertJsonPath('documents.logbook-v2.studentName', 'B');
    }

    public function test_same_save_id_is_idempotent(): void
    {
        $u = User::factory()->create();
        $this->signedIn($u)->putJson('/api/sync/logbook-v2', ['value' => $this->doc('A'), 'base_revision' => 0, 'save_id' => 's1'])
            ->assertOk()->assertJsonPath('revision', 1);

        // Same client retries (its keepalive reached the server but the response was lost).
        $this->signedIn($u)->putJson('/api/sync/logbook-v2', ['value' => $this->doc('A'), 'base_revision' => 0, 'save_id' => 's1'])
            ->assertOk()->assertJsonPath('ok', true)->assertJsonPath('revision', 1);

        $this->signedIn($u)->getJson('/api/sync')->assertJsonPath('revisions.logbook-v2', 1);
    }

    public function test_missing_base_revision_is_last_write_wins(): void
    {
        $u = User::factory()->create();
        $this->signedIn($u)->putJson('/api/sync/milestones-v1', ['value' => []])->assertOk()->assertJsonPath('revision', 1);
        $this->signedIn($u)->putJson('/api/sync/milestones-v1', ['value' => []])->assertOk()->assertJsonPath('revision', 2);
    }

    public function test_empty_account_shape_and_other_users_untouched(): void
    {
        $a = User::factory()->create();
        $b = User::factory()->create();
        $this->signedIn($a)->putJson('/api/sync/logbook-v2', ['value' => $this->doc('A'), 'base_revision' => 0, 'save_id' => 's1'])->assertOk();

        $this->signedIn($b)->getJson('/api/sync')->assertOk()->assertExactJson(['documents' => []]);
        // B starts at revision 0 regardless of A's history.
        $this->signedIn($b)->putJson('/api/sync/logbook-v2', ['value' => $this->doc('B'), 'base_revision' => 0, 'save_id' => 's9'])
            ->assertOk()->assertJsonPath('revision', 1);
        $this->signedIn($a)->getJson('/api/sync')->assertJsonPath('documents.logbook-v2.studentName', 'A');
    }

    public function test_invalid_base_revision_rejected(): void
    {
        $u = User::factory()->create();
        $this->signedIn($u)->putJson('/api/sync/logbook-v2', ['value' => $this->doc('A'), 'base_revision' => 'x'])->assertUnprocessable();
    }
}
