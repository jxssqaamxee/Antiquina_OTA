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
        $logbook = ['studentName' => 'A', 'entries' => [['id' => 'e1', 'date' => '2026-01-05']], 'clients' => []];

        $this->actingAs($a, 'sanctum')->putJson('/api/sync/logbook-v2', ['value' => $logbook])->assertOk();
        $this->actingAs($a, 'sanctum')->putJson('/api/sync/logbook-v2', ['value' => $logbook + ['x' => 1]])->assertOk();

        $this->actingAs($a, 'sanctum')->getJson('/api/sync')->assertOk()
            ->assertJsonPath('documents.logbook-v2.entries.0.id', 'e1');
        $this->assertDatabaseCount('user_documents', 1);

        $this->actingAs($b, 'sanctum')->getJson('/api/sync')->assertOk()->assertExactJson(['documents' => []]);
    }

    public function test_unknown_key_rejected_and_false_values_allowed(): void
    {
        $u = User::factory()->create();
        $this->actingAs($u, 'sanctum')->putJson('/api/sync/evil-key', ['value' => 1])->assertNotFound();
        $this->actingAs($u, 'sanctum')->putJson('/api/sync/onboarding-seen-v1', ['value' => true])->assertOk();
        $this->actingAs($u, 'sanctum')->getJson('/api/sync')->assertJsonPath('documents.onboarding-seen-v1', true);
    }
}
