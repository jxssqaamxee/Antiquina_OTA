<?php

namespace Tests\Feature;

use App\Models\DutyEntry;
use App\Models\HostClient;
use App\Models\PushReminderLog;
use App\Models\PushSubscription;
use App\Models\User;
use App\Models\UserSetting;
use App\Services\Push\WebPushSender;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PushTest extends TestCase
{
    use RefreshDatabase;

    private function subscription(array $over = []): array
    {
        return array_merge([
            'endpoint' => 'https://fcm.googleapis.com/fcm/send/abc123',
            'keys' => ['p256dh' => 'BPublicKeyExample', 'auth' => 'authSecret'],
        ], $over);
    }

    /** A trainee with a subscribed phone and one host client (Mon-Thu, 08:00-17:00). */
    private function trainee(array $client = []): User
    {
        $user = User::factory()->create();
        PushSubscription::create([
            'user_id' => $user->id, 'endpoint' => 'https://push.example.com/send/'.$user->id,
            'endpoint_hash' => hash('sha256', 'https://push.example.com/send/'.$user->id),
            'public_key' => 'k', 'auth_token' => 'a',
        ]);
        $c = HostClient::create(array_merge([
            'user_id' => $user->id, 'client_uid' => 'c1', 'name' => 'City Hall', 'name_key' => 'city hall',
            'type' => 'public', 'days' => [1, 2, 3, 4], 'time_in' => '08:00', 'time_out' => '17:00',
        ], $client));
        UserSetting::create(['user_id' => $user->id, 'last_client_uid' => $c->client_uid]);

        return $user;
    }

    /** Pretends the push service accepted every message and records the payloads. */
    private function fakeSender(): \ArrayObject
    {
        $log = new \ArrayObject();
        $this->mock(WebPushSender::class, function ($m) use ($log) {
            $m->shouldReceive('configured')->andReturn(true);
            $m->shouldReceive('sendToUser')->andReturnUsing(function ($user, $payload) use ($log) {
                $log[] = $payload;

                return 1;
            });
        });

        return $log;
    }

    public function test_subscribing_requires_a_signed_in_verified_account(): void
    {
        $this->postJson('/api/push/subscribe', $this->subscription())->assertStatus(401);
    }

    public function test_a_device_can_subscribe_and_unsubscribe(): void
    {
        $user = User::factory()->create();

        $this->signedIn($user)->postJson('/api/push/subscribe', $this->subscription())->assertOk();
        $this->assertSame(1, $user->pushSubscriptions()->count());

        // The same device again does not pile up duplicates.
        $this->signedIn($user)->postJson('/api/push/subscribe', $this->subscription())->assertOk();
        $this->assertSame(1, $user->pushSubscriptions()->count());

        $this->signedIn($user)->postJson('/api/push/unsubscribe', ['endpoint' => $this->subscription()['endpoint']])->assertOk();
        $this->assertSame(0, $user->pushSubscriptions()->count());
    }

    public function test_a_shared_phone_moves_to_the_account_that_signs_in_now(): void
    {
        $first = User::factory()->create();
        $second = User::factory()->create();

        $this->signedIn($first)->postJson('/api/push/subscribe', $this->subscription())->assertOk();
        $this->signedIn($second)->postJson('/api/push/subscribe', $this->subscription())->assertOk();

        $this->assertSame(0, $first->pushSubscriptions()->count());
        $this->assertSame(1, $second->pushSubscriptions()->count());
    }

    public function test_only_known_push_services_are_accepted(): void
    {
        $this->signedIn(User::factory()->create())
            ->postJson('/api/push/subscribe', $this->subscription(['endpoint' => 'https://internal.example.com/hook']))
            ->assertStatus(422)->assertJsonValidationErrors('endpoint');

        $this->signedIn(User::factory()->create())
            ->postJson('/api/push/subscribe', $this->subscription(['endpoint' => 'https://web.push.apple.com/QabC']))
            ->assertOk();
    }

    public function test_only_https_endpoints_are_accepted(): void
    {
        $this->signedIn(User::factory()->create())
            ->postJson('/api/push/subscribe', $this->subscription(['endpoint' => 'http://evil.test/x']))
            ->assertStatus(422)->assertJsonValidationErrors('endpoint');
    }

    public function test_status_reports_the_public_key(): void
    {
        config(['webpush.vapid.public_key' => 'PUBLICKEY']);

        $this->signedIn(User::factory()->create())->getJson('/api/push/status')
            ->assertOk()->assertJsonPath('vapid_public_key', 'PUBLICKEY');
    }

    public function test_the_vapid_subject_always_has_the_prefix_apple_requires(): void
    {
        config(['webpush.vapid.subject' => 'admin@gmail.com']);
        $this->assertSame('mailto:admin@gmail.com', WebPushSender::subject());
        config(['webpush.vapid.subject' => 'https://occ.example.com']);
        $this->assertSame('https://occ.example.com', WebPushSender::subject());
    }

    public function test_clock_out_reminder_is_sent_10_minutes_before_time_out_once(): void
    {
        $sent = $this->fakeSender();
        $user = $this->trainee();

        // 2026-11-16 is a Monday (a working day). 16:49 is 11 minutes before 17:00: too early.
        $this->artisan('push:reminders', ['--at' => '2026-11-16 16:49'])->assertSuccessful();
        $this->assertCount(0, $sent);

        $this->artisan('push:reminders', ['--at' => '2026-11-16 16:50'])->assertSuccessful();
        $this->assertCount(1, $sent);
        $this->assertSame('Time to clock out soon', $sent[0]['title']);
        $this->assertStringContainsString('5:00 PM', $sent[0]['body']);
        $this->assertSame('/logbook', $sent[0]['url']);

        // The next minute must not send it again.
        $this->artisan('push:reminders', ['--at' => '2026-11-16 16:51'])->assertSuccessful();
        $this->assertCount(1, $sent);
        $this->assertSame(1, PushReminderLog::where('user_id', $user->id)->where('kind', 'shift-end')->count());

        // And not once the shift is over.
        $this->artisan('push:reminders', ['--at' => '2026-11-16 17:00'])->assertSuccessful();
        $this->assertCount(1, $sent);
    }

    public function test_shift_start_reminder_is_sent_20_minutes_before_time_in(): void
    {
        $sent = $this->fakeSender();
        $this->trainee();

        $this->artisan('push:reminders', ['--at' => '2026-11-16 07:39'])->assertSuccessful();
        $this->assertCount(0, $sent);
        $this->artisan('push:reminders', ['--at' => '2026-11-16 07:40'])->assertSuccessful();
        $this->assertCount(1, $sent);
        $this->assertSame('Your OJT shift starts soon', $sent[0]['title']);
    }

    public function test_no_reminder_on_a_day_off(): void
    {
        $sent = $this->fakeSender();
        $this->trainee();

        // 2026-11-20 is a Friday and the client only works Monday to Thursday.
        $this->artisan('push:reminders', ['--at' => '2026-11-20 16:55'])->assertSuccessful();
        $this->assertCount(0, $sent);
    }

    public function test_no_clock_out_reminder_when_the_time_out_is_already_logged(): void
    {
        $sent = $this->fakeSender();
        $user = $this->trainee();
        DutyEntry::create([
            'user_id' => $user->id, 'entry_uid' => 'e1', 'duty_date' => '2026-11-16',
            'host_client_id' => HostClient::first()->id, 'am_in' => '08:00', 'am_out' => '12:00',
            'pm_in' => '13:00', 'pm_out' => '16:45', 'hours' => 7.75,
        ]);

        $this->artisan('push:reminders', ['--at' => '2026-11-16 16:50'])->assertSuccessful();
        $this->assertCount(0, $sent);
    }

    public function test_a_morning_only_entry_does_not_stop_the_clock_out_reminder(): void
    {
        $sent = $this->fakeSender();
        $user = $this->trainee();
        DutyEntry::create([
            'user_id' => $user->id, 'entry_uid' => 'e1', 'duty_date' => '2026-11-16',
            'host_client_id' => HostClient::first()->id, 'am_in' => '08:00', 'am_out' => '12:00', 'hours' => 4,
        ]);

        $this->artisan('push:reminders', ['--at' => '2026-11-16 16:50'])->assertSuccessful();
        $this->assertCount(1, $sent);
    }

    public function test_the_claim_is_given_back_when_no_device_received_it(): void
    {
        $this->mock(WebPushSender::class, function ($m) {
            $m->shouldReceive('configured')->andReturn(true);
            $m->shouldReceive('sendToUser')->andReturn(0);
        });
        $this->trainee();

        $this->artisan('push:reminders', ['--at' => '2026-11-16 16:50'])->assertSuccessful();
        $this->assertSame(0, PushReminderLog::count(), 'a failed send must be retried the next minute');
    }

    public function test_nothing_happens_when_push_is_not_configured(): void
    {
        $this->mock(WebPushSender::class, fn ($m) => $m->shouldReceive('configured')->andReturn(false));
        $this->trainee();

        $this->artisan('push:reminders', ['--at' => '2026-11-16 16:50'])->assertSuccessful();
        $this->assertSame(0, PushReminderLog::count());
    }
}
