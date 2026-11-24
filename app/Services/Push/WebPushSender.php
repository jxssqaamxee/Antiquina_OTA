<?php

namespace App\Services\Push;

use App\Models\User;
use Illuminate\Support\Facades\Log;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;

/**
 * Sends a real OS-level push (it reaches the phone even when the app is closed) to every device
 * the user subscribed. Same approach as sclf_APP's WebPushChannel, but a plain service so the
 * scheduler command can use it directly.
 *
 * Push is best-effort: any failure is reported to the log and never thrown at the caller.
 */
class WebPushSender
{
    /** Keys set and the library installed? */
    public function configured(): bool
    {
        return filled(config('webpush.vapid.public_key'))
            && filled(config('webpush.vapid.private_key'))
            && class_exists(WebPush::class);
    }

    /** "mailto:" or "https://": Apple's push service refuses anything else. */
    public static function subject(): string
    {
        $subject = trim((string) config('webpush.vapid.subject', ''));
        if ($subject === '') {
            return 'mailto:admin@example.com';
        }

        return preg_match('/^(mailto:|https:\/\/)/i', $subject) ? $subject : 'mailto:'.$subject;
    }

    /**
     * @param  array{title:string,body?:string,url?:string,tag?:string,icon?:string}  $payload
     * @return int number of devices the push service accepted
     */
    public function sendToUser(User $user, array $payload, ?string $installId = null): int
    {
        if (! $this->configured()) {
            return 0;
        }

        // Every install of this account, or only the one with $installId (the "send me a test" button).
        $subscriptions = $user->pushSubscriptions()->when($installId, fn ($q) => $q->where('install_id', $installId))->get();
        if ($subscriptions->isEmpty()) {
            return 0;
        }

        $accepted = 0;

        try {
            $webPush = new WebPush(['VAPID' => [
                'subject' => self::subject(),
                'publicKey' => config('webpush.vapid.public_key'),
                'privateKey' => config('webpush.vapid.private_key'),
            ]]);
            // A reminder that arrives after its moment is useless: let the push service drop it after 10 minutes.
            $webPush->setDefaultOptions(['TTL' => 600, 'urgency' => 'high']);

            // The message always says whose it is (user id + Student/Admin ID), so a shared phone can tell.
            $payload += ['uid' => $user->id, 'sid' => $user->student_id ?? $user->admin_id ?? null];
            $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            foreach ($subscriptions as $sub) {
                $webPush->queueNotification(Subscription::create([
                    'endpoint' => $sub->endpoint,
                    'publicKey' => $sub->public_key,
                    'authToken' => $sub->auth_token,
                    'contentEncoding' => $sub->content_encoding ?: 'aes128gcm',
                ]), $json);
            }

            foreach ($webPush->flush() as $report) {
                if ($report->isSuccess()) {
                    $accepted++;
                    continue;
                }
                // 404 / 410: the phone removed the app or revoked permission -> forget the device.
                $status = $report->getResponse()?->getStatusCode();
                Log::warning('Web Push was not accepted', ['user_id' => $user->id, 'status' => $status, 'reason' => $report->getReason()]);
                if (in_array($status, [404, 410], true)) {
                    $user->pushSubscriptions()
                        ->where('endpoint_hash', hash('sha256', (string) $report->getRequest()->getUri()))
                        ->delete();
                }
            }
        } catch (\Throwable $e) {
            report($e);
        }

        return $accepted;
    }
}
