<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Support\Formats;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

/**
 * Creates a System Administrator from the server console. There is deliberately no Admin
 * registration page: the first Admin is made here, and later management accounts are created
 * by a signed-in Admin.
 *
 *   php artisan staff:create-admin
 *   php artisan staff:create-admin --staff-id=ADMIN-001 --first-name=Maria --last-name=Reyes --email=maria@example.com
 *
 * The password is asked for interactively (hidden). --password exists for automated deployments only:
 * a value typed on the command line can end up in shell history.
 */
class CreateAdmin extends Command
{
    protected $signature = 'staff:create-admin
        {--staff-id= : Sign-in ID, e.g. ADMIN-001}
        {--first-name= : First name}
        {--last-name= : Last name}
        {--email= : Email address (used for password reset)}
        {--password= : Password (prefer the hidden prompt)}';

    protected $description = 'Create a System Administrator account (already email-verified)';

    public function handle(): int
    {
        $staffId = strtoupper(trim((string) ($this->option('staff-id') ?: $this->ask('Staff ID (e.g. ADMIN-001)'))));
        $first = trim((string) ($this->option('first-name') ?: $this->ask('First name')));
        $last = trim((string) ($this->option('last-name') ?: $this->ask('Last name')));
        $email = strtolower(trim((string) ($this->option('email') ?: $this->ask('Email address'))));

        $password = (string) $this->option('password');
        if ($password === '') {
            $password = (string) $this->secret('Password (hidden)');
            if ($password !== (string) $this->secret('Repeat password')) {
                $this->error('The passwords do not match.');

                return self::FAILURE;
            }
        }

        $validator = Validator::make(
            ['staff_id' => $staffId, 'first_name' => $first, 'last_name' => $last, 'email' => $email, 'password' => $password],
            [
                'staff_id' => ['required', 'regex:'.Formats::STAFF_ID, 'unique:users,staff_id'],
                'first_name' => ['required', 'string', 'max:80', 'regex:'.Formats::NAME],
                'last_name' => ['required', 'string', 'max:80', 'regex:'.Formats::NAME],
                'email' => ['required', 'email', 'max:255', 'unique:users,email'],
                'password' => ['required', 'string', 'max:100', Password::defaults()],
            ]
        );

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $message) {
                $this->error($message);
            }

            return self::FAILURE;
        }

        $user = new User();
        // forceFill: role / staff_id are not mass-assignable on purpose.
        $user->forceFill([
            'role' => User::ROLE_ADMIN,
            'staff_id' => $staffId,
            'student_id' => null,
            'course' => null,
            'first_name' => Formats::titleCase($first),
            'last_name' => Formats::titleCase($last),
            'email' => $email,
            'password' => $password,
            'email_verified_at' => now(),
            'is_active' => true,
        ])->save();

        $this->info("Administrator {$staffId} created. Sign in at /staff-login.");

        return self::SUCCESS;
    }
}
