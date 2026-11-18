<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\UserDocument;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LogbookStorageTest extends TestCase
{
    use RefreshDatabase;

    private function client(string $id = 'c1', string $name = 'City Hall', string $type = 'public'): array
    {
        return ['id' => $id, 'name' => $name, 'type' => $type, 'days' => [1, 2, 3, 4], 'timeIn' => '08:00', 'timeOut' => '17:00'];
    }

    private function entry(string $id = 'e1', string $date = '2026-01-05', ?string $client = 'c1', array $over = []): array
    {
        return $over + [
            'id' => $id, 'date' => $date, 'client' => $client, 'category' => 'regular',
            'amIn' => '08:00', 'amOut' => '12:00', 'pmIn' => '13:00', 'pmOut' => '17:00', 'evIn' => '', 'evOut' => '',
            'hours' => 999, 'task' => 'Filing',
        ];
    }

    private function logbook(array $clients = null, array $entries = null, array $over = []): array
    {
        return $over + [
            'studentName' => 'Juan Dela Cruz', 'targetHours' => 486, 'lastClientId' => 'c1',
            'clients' => $clients ?? [$this->client()], 'entries' => $entries ?? [$this->entry()],
        ];
    }

    private function save(User $u, string $key, mixed $value)
    {
        return $this->signedIn($u)->putJson("/api/sync/$key", ['value' => $value]);
    }

    public function test_logbook_is_stored_in_real_tables_and_hours_are_computed_by_the_server(): void
    {
        $u = User::factory()->create();
        $this->save($u, 'logbook-v2', $this->logbook())->assertOk();

        $this->assertDatabaseHas('user_settings', ['user_id' => $u->id, 'student_name' => 'Juan Dela Cruz', 'target_hours' => 486]);
        $this->assertDatabaseHas('host_clients', ['user_id' => $u->id, 'client_uid' => 'c1', 'name' => 'City Hall', 'type' => 'public']);
        $this->assertDatabaseHas('duty_entries', ['user_id' => $u->id, 'entry_uid' => 'e1', 'hours' => 8.00, 'coverage' => 'full', 'task' => 'Filing']);
        $this->assertDatabaseCount('user_documents', 0);

        $this->signedIn($u)->getJson('/api/sync')->assertOk()
            ->assertJsonPath('documents.logbook-v2.entries.0.hours', 8)
            ->assertJsonPath('documents.logbook-v2.entries.0.client', 'c1')
            ->assertJsonPath('documents.logbook-v2.clients.0.type', 'public')
            ->assertJsonPath('documents.logbook-v2.lastClientId', 'c1');
    }

    public function test_resaving_replaces_rows_and_removed_items_disappear(): void
    {
        $u = User::factory()->create();
        $this->save($u, 'logbook-v2', $this->logbook(null, [$this->entry('e1'), $this->entry('e2', '2026-01-06')]))->assertOk();
        $this->save($u, 'logbook-v2', $this->logbook(null, [$this->entry('e2', '2026-01-06', 'c1', ['task' => 'Edited'])]))->assertOk();

        $this->assertDatabaseCount('duty_entries', 1);
        $this->assertDatabaseHas('duty_entries', ['entry_uid' => 'e2', 'task' => 'Edited']);
    }

    public function test_garbage_is_rejected_with_422_not_500(): void
    {
        $u = User::factory()->create();
        foreach (['text', 12, true, ['clients' => 'x'], ['entries' => [1, 2]], ['clients' => [['id' => '../x', 'name' => 'A']]]] as $bad) {
            $this->save($u, 'logbook-v2', $bad)->assertStatus(422);
        }
        $this->save($u, 'notifications-v1', 'nope')->assertStatus(422);
        $this->save($u, 'notifications-v1', [['id' => 'n1']])->assertStatus(422);
        $this->save($u, 'milestones-v1', ['a' => 1])->assertStatus(422);
        $this->save($u, 'onboarding-seen-v1', 'yes')->assertStatus(422);
        $this->save($u, 'shift-reminder-v1', '05/01/2026')->assertStatus(422);
        $this->assertDatabaseCount('duty_entries', 0);
    }

    public function test_business_rules_match_the_app(): void
    {
        $u = User::factory()->create();

        // target hours 1-2000
        $this->save($u, 'logbook-v2', $this->logbook(null, null, ['targetHours' => 0]))->assertStatus(422)->assertJsonValidationErrors(['value.targetHours']);
        $this->save($u, 'logbook-v2', $this->logbook(null, null, ['targetHours' => 2001]))->assertStatus(422);
        // duplicate client names (case-insensitive)
        $this->save($u, 'logbook-v2', $this->logbook([$this->client('c1', 'ACME'), $this->client('c2', 'acme')], []))->assertStatus(422)->assertJsonValidationErrors(['value.clients.1.name']);
        // time out before time in
        $this->save($u, 'logbook-v2', $this->logbook(null, [$this->entry('e1', '2026-01-05', 'c1', ['amIn' => '12:00', 'amOut' => '08:00'])]))->assertStatus(422)->assertJsonValidationErrors(['value.entries.0.amOut']);
        // overlap on the same date
        $this->save($u, 'logbook-v2', $this->logbook(null, [$this->entry('e1'), $this->entry('e2', '2026-01-05', 'c1', ['amIn' => '09:00', 'amOut' => '10:00', 'pmIn' => '', 'pmOut' => ''])]))->assertStatus(422);
        // no time at all
        $this->save($u, 'logbook-v2', $this->logbook(null, [$this->entry('e1', '2026-01-05', 'c1', ['amIn' => '', 'amOut' => '', 'pmIn' => '', 'pmOut' => ''])]))->assertStatus(422);
        // bad date, bad client schedule
        $this->save($u, 'logbook-v2', $this->logbook(null, [$this->entry('e1', '2026-02-31')]))->assertStatus(422);
        $this->save($u, 'logbook-v2', $this->logbook([['id' => 'c1', 'name' => 'X', 'type' => 'weird', 'days' => [9], 'timeIn' => '17:00', 'timeOut' => '08:00']], []))->assertStatus(422);

        $this->assertDatabaseCount('duty_entries', 0);
        $this->assertDatabaseCount('host_clients', 0);
    }

    public function test_a_removed_host_client_leaves_entries_unassigned_and_clears_last_client(): void
    {
        $u = User::factory()->create();
        $this->save($u, 'logbook-v2', $this->logbook([], [$this->entry('e1', '2026-01-05', 'gone')], ['lastClientId' => 'gone']))->assertOk();

        $this->signedIn($u)->getJson('/api/sync')
            ->assertJsonPath('documents.logbook-v2.entries.0.client', null)
            ->assertJsonPath('documents.logbook-v2.lastClientId', null);
    }

    public function test_selected_host_client_for_view_and_pdf_is_saved_and_restored_on_another_device(): void
    {
        $u = User::factory()->create();
        $this->save($u, 'logbook-v2', $this->logbook(null, null, ['viewClientId' => 'c1', 'exportClientId' => 'none']))->assertOk();

        $this->assertDatabaseHas('user_settings', ['user_id' => $u->id, 'view_client_uid' => 'c1', 'export_client_uid' => 'none']);
        $this->signedIn($u)->getJson('/api/sync')
            ->assertJsonPath('documents.logbook-v2.viewClientId', 'c1')
            ->assertJsonPath('documents.logbook-v2.exportClientId', 'none');

        // "all" is stored as null and read back as "all".
        $this->save($u, 'logbook-v2', $this->logbook(null, null, ['viewClientId' => 'all']))->assertOk();
        $this->assertDatabaseHas('user_settings', ['user_id' => $u->id, 'view_client_uid' => null]);
        $this->signedIn($u)->getJson('/api/sync')->assertJsonPath('documents.logbook-v2.viewClientId', 'all');
    }

    public function test_an_unknown_or_removed_host_client_selection_falls_back_to_all(): void
    {
        $u = User::factory()->create();
        $this->save($u, 'logbook-v2', $this->logbook(null, null, ['viewClientId' => 'ghost', 'exportClientId' => '<script>']))->assertOk();

        $this->signedIn($u)->getJson('/api/sync')
            ->assertJsonPath('documents.logbook-v2.viewClientId', 'all')
            ->assertJsonPath('documents.logbook-v2.exportClientId', 'all');
    }

    public function test_text_is_sanitised(): void
    {
        $u = User::factory()->create();
        $e = $this->entry('e1', '2026-01-05', 'c1', ['task' => "  Filed\x00 reports\x07 ".str_repeat('x', 900)]);
        $this->save($u, 'logbook-v2', $this->logbook(null, [$e], ['studentName' => 'Juan <b>D.</b> 123']))->assertOk();

        $doc = $this->signedIn($u)->getJson('/api/sync')->json('documents.logbook-v2');
        $this->assertSame('Juan bD.b', $doc['studentName']);
        $this->assertSame(500, mb_strlen($doc['entries'][0]['task']));
        $this->assertStringStartsWith('Filed reports', $doc['entries'][0]['task']);
    }

    public function test_notifications_milestones_flags_are_stored_per_user_without_the_old_cap_of_40(): void
    {
        $a = User::factory()->create();
        $b = User::factory()->create();
        $list = [];
        for ($i = 0; $i < 120; $i++) {
            $list[] = ['id' => "n$i", 'type' => 'milestone', 'title' => "T$i", 'message' => 'm', 'time' => '2026-01-05T08:00:00.000Z', 'read' => $i % 2 === 0];
        }
        $this->save($a, 'notifications-v1', $list)->assertOk();
        $this->save($a, 'milestones-v1', ['25pct', '50pct'])->assertOk();
        $this->save($a, 'shift-reminder-v1', '2026-01-05')->assertOk();
        $this->save($a, 'onboarding-seen-v1', true)->assertOk();

        $this->assertDatabaseCount('user_notifications', 120);
        $docs = $this->signedIn($a)->getJson('/api/sync')->json('documents');
        $this->assertCount(120, $docs['notifications-v1']);
        $this->assertSame('n0', $docs['notifications-v1'][0]['id']);
        $this->assertTrue($docs['notifications-v1'][0]['read']);
        $this->assertFalse($docs['notifications-v1'][1]['read']);
        $this->assertSame(['25pct', '50pct'], $docs['milestones-v1']);
        $this->assertSame('2026-01-05', $docs['shift-reminder-v1']);
        $this->assertTrue($docs['onboarding-seen-v1']);

        $this->signedIn($b)->getJson('/api/sync')->assertExactJson(['documents' => []]);

        $this->signedIn($a)->deleteJson('/api/sync/notifications-v1')->assertOk();
        $this->assertDatabaseCount('user_notifications', 0);
    }

    public function test_old_json_documents_are_imported_once_and_kept_as_backup(): void
    {
        $u = User::factory()->create();
        $legacy = $this->logbook([$this->client(), $this->client('c2', 'city hall')], [$this->entry(), $this->entry('e9', '2026-01-05', 'c1', ['amIn' => '09:00', 'amOut' => '10:00', 'pmIn' => '', 'pmOut' => '']), $this->entry('bad', 'nonsense')]);
        UserDocument::create(['user_id' => $u->id, 'key' => 'logbook-v2', 'value' => json_encode($legacy)]);
        UserDocument::create(['user_id' => $u->id, 'key' => 'notifications-v1', 'value' => json_encode([['id' => 'n1', 'type' => 'info', 'title' => 'Hi', 'message' => '', 'time' => '2026-01-05T08:00:00.000Z', 'read' => false]])]);

        $docs = $this->signedIn($u)->getJson('/api/sync')->assertOk()->json('documents');
        $this->assertCount(2, $docs['logbook-v2']['clients']);          // duplicate name repaired, not dropped
        $this->assertSame('city hall (2)', $docs['logbook-v2']['clients'][1]['name']);
        $this->assertCount(1, $docs['logbook-v2']['entries']);          // overlap + bad date skipped
        $this->assertCount(1, $docs['notifications-v1']);
        $this->assertDatabaseCount('user_documents', 2);                // backup untouched

        $this->signedIn($u)->getJson('/api/sync')->assertOk();          // second read does not import again
        $this->assertDatabaseCount('duty_entries', 1);
    }

    public function test_import_command_and_account_deletion_cascade(): void
    {
        $u = User::factory()->create();
        UserDocument::create(['user_id' => $u->id, 'key' => 'logbook-v2', 'value' => json_encode($this->logbook())]);
        $this->artisan('occ:import-legacy')->assertSuccessful();
        $this->assertDatabaseHas('duty_entries', ['user_id' => $u->id, 'entry_uid' => 'e1']);

        $u->delete();
        $this->assertDatabaseCount('duty_entries', 0);
        $this->assertDatabaseCount('host_clients', 0);
        $this->assertDatabaseCount('user_settings', 0);
    }

    public function test_theme_is_saved_on_the_account(): void
    {
        $u = User::factory()->create();
        $this->signedIn($u)->putJson('/api/profile/preferences', ['theme' => 'maroon'])->assertOk()->assertJsonPath('user.theme', 'maroon');
        $this->signedIn($u)->putJson('/api/profile/preferences', ['theme' => 'hotpink'])->assertStatus(422);
        $this->assertDatabaseHas('user_settings', ['user_id' => $u->id, 'theme' => 'maroon']);
        $this->signedIn($u)->getJson('/api/me')->assertJsonPath('user.theme', 'maroon');
    }
}
