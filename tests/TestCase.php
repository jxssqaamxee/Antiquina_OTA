<?php

namespace Tests;

use App\Models\User;
use App\Services\Auth\SessionLogin;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\DB;

abstract class TestCase extends BaseTestCase
{
    /**
     * Act as a signed-in person: the web guard is set and the session carries a valid
     * hard expiry (what SessionLogin::start() does at sign-in).
     */
    protected function signedIn(User $user, ?int $expiresAt = null): static
    {
        return $this->actingAs($user)->withSession([
            SessionLogin::EXPIRES_KEY => $expiresAt ?? now()->addHour()->getTimestamp(),
        ]);
    }

    /** Inserts a session row for another device of this account (as the database driver would). */
    protected function otherDevice(User $user, string $id = 'other-device-session'): string
    {
        DB::table('sessions')->insert([
            'id' => $id, 'user_id' => $user->id, 'ip_address' => '10.0.0.9',
            'user_agent' => 'other phone', 'payload' => '', 'last_activity' => time(),
        ]);

        return $id;
    }
}
