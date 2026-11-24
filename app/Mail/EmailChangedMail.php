<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/** Sent to the OLD address when an administrator changes an account's email, so a takeover is noticed. */
class EmailChangedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public string $fullName, public string $oldEmail, public string $newEmail) {}

    public function build()
    {
        return $this
            ->subject('The email of your OCCDL account was changed')
            ->view('emails.email-changed')
            ->with(['fullName' => $this->fullName, 'oldEmail' => $this->oldEmail, 'newEmail' => $this->newEmail]);
    }

    /** Never fails the caller: a mail outage must not block the change. */
    public static function notifyOld(string $fullName, string $oldEmail, string $newEmail): void
    {
        try {
            Mail::to($oldEmail)->send(new self($fullName, $oldEmail, $newEmail));
        } catch (\Throwable $e) {
            Log::warning('Could not send email-changed notice');
        }
    }
}
