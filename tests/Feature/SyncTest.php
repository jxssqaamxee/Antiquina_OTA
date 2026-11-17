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
}
