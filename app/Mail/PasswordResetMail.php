<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

/** Password-reset email (same shape as sclf_APP's PasswordResetMail). */
class PasswordResetMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $fullName,
        public string $resetUrl,
        public string $userEmail,
    ) {}

    public function build()
    {
        return $this->subject('Password Reset Request - OCC Duty Log | Opol Community College')
            ->view('emails.password-reset')
            ->with([
                'fullName' => $this->fullName,
                'resetUrl' => $this->resetUrl,
                'email' => $this->userEmail,
            ]);
    }
}
