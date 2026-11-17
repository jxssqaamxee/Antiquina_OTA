<?php

namespace App\Http\Controllers;

use App\Models\PushSubscription;
use App\Services\Push\WebPushSender;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Registers this phone/browser for Web Push (reminders that arrive with the app closed). */
class PushController extends Controller
{
    /** The public key the browser needs, and whether this device's subscription belongs to the signed-in account. */
    public function status(Request $request, WebPushSender $push): JsonResponse
    {
        $owned = null;
        if ($request->filled('endpoint')) {
            $owned = $request->user()->pushSubscriptions()
                ->where('endpoint_hash', hash('sha256', (string) $request->query('endpoint')))
                ->exists();
        }

        return response()->json([
            'configured' => $push->configured(),
            'vapid_public_key' => config('webpush.vapid.public_key') ?: null,
            'owned_by_current_user' => $owned,
        ]);
    }

    /**
     * Saves (or refreshes) this device. Keyed on the endpoint, and the row is MOVED to the signed-in
     * account if another trainee used the same phone before: reminders always follow whoever is
     * signed in now.
     */
    public function subscribe(Request $request): JsonResponse
    {
        $data = $request->validate([
            'endpoint' => ['required', 'string', 'url:https', 'max:2048', function ($attr, $value, $fail) {
                $host = strtolower((string) parse_url($value, PHP_URL_HOST));
                foreach ((array) config('webpush.allowed_hosts') as $ok) {
                    if ($host === $ok || str_ends_with($host, '.'.$ok)) {
                        return;
                    }
                }
                $fail('That is not a known push service address.');
            }],
            'keys.p256dh' => ['required', 'string', 'max:255'],
            'keys.auth' => ['required', 'string', 'max:255'],
        ]);

        PushSubscription::updateOrCreate(
            ['endpoint_hash' => hash('sha256', $data['endpoint'])],
            [
                'user_id' => $request->user()->id,
                'endpoint' => $data['endpoint'],
                'public_key' => $data['keys']['p256dh'],
                'auth_token' => $data['keys']['auth'],
                'content_encoding' => 'aes128gcm',
            ],
        );

        return response()->json(['success' => true]);
    }

    public function unsubscribe(Request $request): JsonResponse
    {
        $data = $request->validate(['endpoint' => ['required', 'string', 'max:2048']]);

        $request->user()->pushSubscriptions()
            ->where('endpoint_hash', hash('sha256', $data['endpoint']))
            ->delete();

        return response()->json(['success' => true]);
    }

    /** "Send me a test alert": proves the whole chain works on this phone. */
    public function test(Request $request, WebPushSender $push): JsonResponse
    {
        if (! $push->configured()) {
            return response()->json(['sent' => 0, 'message' => 'Background alerts are not set up on the server yet.'], 503);
        }

        $sent = $push->sendToUser($request->user(), [
            'title' => 'OCCDL alerts are on',
            'body' => 'You will get shift and clock-out reminders even when the app is closed.',
            'url' => '/logbook',
            'tag' => 'occ-test',
        ]);

        return response()->json(['sent' => $sent]);
    }
}
