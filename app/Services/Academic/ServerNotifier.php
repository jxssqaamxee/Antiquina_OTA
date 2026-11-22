<?php

namespace App\Services\Academic;

use App\Models\User;
use App\Models\UserNotification;
use App\Models\UserSetting;
use Illuminate\Support\Str;

/** Bell notices created by the server (source=server). The client's notification sync never deletes or edits them. */
class ServerNotifier
{
    public function notify(User $user, string $title, string $message, string $type = 'info'): void
    {
        UserNotification::create([
            'user_id' => $user->id, 'notif_uid' => 's'.Str::lower(Str::random(15)), 'type' => $type,
            'title' => mb_substr($title, 0, 160), 'message' => mb_substr($message, 0, 500),
            'is_read' => false, 'notified_at' => now(), 'position' => 0, 'source' => 'server',
        ]);
        // A stale device holding the old list now gets a 409 and reloads instead of overwriting.
        UserSetting::firstOrCreate(['user_id' => $user->id]);
        UserSetting::where('user_id', $user->id)->increment('notifications_revision');
    }
}
