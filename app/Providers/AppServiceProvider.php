<?php

namespace App\Providers;

use App\Mail\VerifyEmailMail;
use App\Services\Auth\EmailVerificationCodeService;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Branded verification email (same layout as the password-reset email). The link is a
        // signed, 60-minute URL (route 'verification.verify' in routes/web.php) and a fresh
        // 6-digit code travels with it, so the person can finish inside the installed app.
        VerifyEmail::toMailUsing(function ($notifiable, string $url) {
            $fullName = trim(($notifiable->first_name ?? '').' '.($notifiable->last_name ?? '')) ?: $notifiable->email;
            $code = app(EmailVerificationCodeService::class)->issue($notifiable);

            return new VerifyEmailMail($fullName, $url, $notifiable->email, $code);
        });

        // Same password policy as sclf_APP: 8+ characters, upper + lower case, a number.
        Password::defaults(fn () => Password::min(8)->mixedCase()->numbers());
    }
}
