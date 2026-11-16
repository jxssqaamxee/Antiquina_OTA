<?php

namespace App\Providers;

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
        // Same password policy as sclf_APP: 8+ characters, upper + lower case, a number.
        Password::defaults(fn () => Password::min(8)->mixedCase()->numbers());
    }
}
