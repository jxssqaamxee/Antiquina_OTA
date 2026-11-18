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
        // Every link the app builds (emails, redirects) uses https in production.
        if ($this->app->isProduction()) {
            \Illuminate\Support\Facades\URL::forceScheme('https');
        }

        VerifyEmail::toMailUsing(function ($notifiable, string $url) {
            $fullName = trim(($notifiable->first_name ?? '').' '.($notifiable->last_name ?? '')) ?: $notifiable->email;
            $code = app(EmailVerificationCodeService::class)->issue($notifiable);

            return new VerifyEmailMail($fullName, $url, $notifiable->email, $code);
        });

        // Same password policy as sclf_APP: 8+ characters, upper + lower case, a number.
        // Production also rejects passwords found in known data breaches (3+ times, checked through the
        // haveibeenpwned range API; only a 5-character hash prefix leaves the server, and if that
        // service is down the check is skipped instead of blocking sign-ups).
        Password::defaults(fn () => $this->app->isProduction()
            ? Password::min(8)->mixedCase()->numbers()->uncompromised(3)
            : Password::min(8)->mixedCase()->numbers());
    }
}
