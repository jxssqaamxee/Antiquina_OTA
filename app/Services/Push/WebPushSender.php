<?php

namespace App\Services\Push;

use App\Models\User;
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
    public function sendToUser(User $user, array $payload): int
    {
        if (! $this->configured()) {
            return 0;
        }

        $subscriptions = $user->pushSubscriptions()->get();
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
