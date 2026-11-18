<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/** "Your password was changed" notice, so a takeover is noticed quickly. */
class PasswordChangedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public string $fullName, public string $userEmail) {}

    public function build()
    {
        return $this
            ->subject('Your OCCDL password was changed')
            ->view('emails.password-changed')
            ->with(['fullName' => $this->fullName, 'email' => $this->userEmail, 'loginUrl' => rtrim((string) config('app.url'), '/').'/login']);
    }

    /** Never fails the caller: a mail outage must not block a password change. */
    public static function notify(User $user): void
    {
        try {
            Mail::to($user->email)->send(new self($user->first_name ?: $user->fullName(), $user->email));
        } catch (\Throwable $e) {
            Log::warning('Could not send password-changed email', ['user_id' => $user->id]);
        }
    }
}
