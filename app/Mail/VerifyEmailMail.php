<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

/** "Verify your OCCDL account" email (same shape as PasswordResetMail / sclf_APP's VerifyEmailMail). */
class VerifyEmailMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $fullName,
        public string $verifyUrl,
        public string $userEmail,
        public ?string $code = null,
    ) {}

    public function build()
    {
        return $this->to($this->userEmail)
            ->subject('Verify your OCCDL account - OCCDL | Opol Community College')
            ->view('emails.verify-email')
            ->with([
                'fullName' => $this->fullName,
                'verifyUrl' => $this->verifyUrl,
                'email' => $this->userEmail,
                'code' => $this->code,
            ]);
    }
}
