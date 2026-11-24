<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\Auth\SessionLogin;
use App\Services\Auth\TwoFactorService;
use Illuminate\Console\Command;

/** Break-glass for the case where every administrator lost their authenticator: run on the server. */
class TwoFactorReset extends Command
{
    protected $signature = 'occ:two-factor-reset {admin_id : The Admin ID of the staff account}';
    protected $description = 'Turn off two-factor for one Admin/Coordinator account and sign it out everywhere';

    public function handle(TwoFactorService $tf, SessionLogin $sessions): int
    {
        $user = User::where('admin_id', $this->argument('admin_id'))->whereIn('role', User::ADMIN_ACCESS_ROLES)->first();
        if (! $user) {
            $this->error('No such staff account.');

            return self::FAILURE;
        }
        $tf->disable($user);
        $sessions->revokeAll($user);
        \App\Support\SecurityLog::event('two_factor_reset_cli', ['target_id' => $user->id], 'notice');
        $this->info("Two-factor cleared for {$user->admin_id}. They must enrol again at next sign-in.");

        return self::SUCCESS;
    }
}
