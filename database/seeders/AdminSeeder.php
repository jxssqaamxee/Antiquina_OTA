<?php

namespace Database\Seeders;

use App\Models\User;
use App\Support\Formats;
use Illuminate\Database\Seeder;

/**
 * First System Administrator from .env (same variables as sclfAPP):
 *
 *   INITIAL_ADMIN_NAME, INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD, INITIAL_ADMIN_ID
 *
 *   php artisan db:seed --class=AdminSeeder        (add --force on a production server)
 *
 * - The account is created already email-verified and flagged must_change_password: the first
 *   sign-in forces a new password. After that, re-seeding never touches the account again.
 * - There is only ever one seeded Admin: if an Admin already exists under another email, nothing is created.
 * - It never turns an existing trainee (same email) into an Admin.
 * - Remove INITIAL_ADMIN_PASSWORD from .env once the account exists.
 */
class AdminSeeder extends Seeder
{
    public function run(): void
    {
        $email = strtolower(trim((string) env('INITIAL_ADMIN_EMAIL')));
        $password = (string) env('INITIAL_ADMIN_PASSWORD');
        $name = trim((string) env('INITIAL_ADMIN_NAME', 'System Administrator'));
        $staffId = strtoupper(trim((string) env('INITIAL_ADMIN_ID', 'ADMIN-001')));

        if ($email === '' || $password === '') {
            $this->command?->warn('Skipping initial admin: INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD not set in .env');

            return;
        }
        if (! filter_var($email, FILTER_VALIDATE_EMAIL) || ! preg_match(Formats::STAFF_ID, $staffId)) {
            $this->command?->error('Skipping initial admin: INITIAL_ADMIN_EMAIL or INITIAL_ADMIN_ID is not valid.');

            return;
        }

        $existingAdmin = User::where('role', User::ROLE_ADMIN)->orderBy('id')->first();
        if ($existingAdmin && $existingAdmin->email !== $email) {
            $this->command?->info("An administrator already exists ({$existingAdmin->email}); not creating another.");

            return;
        }

        $user = User::where('email', $email)->first();
        if ($user && $user->role !== User::ROLE_ADMIN) {
            $this->command?->error("{$email} already belongs to a non-admin account; not changing it.");

            return;
        }
        if ($user && ! $user->must_change_password) {
            $this->command?->info("Initial administrator already set up: {$email}");

            return;
        }
        if (User::where('staff_id', $staffId)->where('email', '!=', $email)->exists()) {
            $this->command?->error("Staff ID {$staffId} is already used by another account.");

            return;
        }

        $parts = preg_split('/\s+/', $name) ?: [$name];
        $last = count($parts) > 1 ? array_pop($parts) : $name;
        $first = count($parts) ? implode(' ', $parts) : $name;

        $admin = $user ?? new User();
        $admin->forceFill([ // role / staff_id are not mass-assignable on purpose
            'role' => User::ROLE_ADMIN, 'staff_id' => $staffId, 'student_id' => null, 'course' => null,
            'first_name' => Formats::titleCase($first), 'last_name' => Formats::titleCase($last), 'email' => $email,
            'password' => $password, 'email_verified_at' => $user?->email_verified_at ?? now(),
            'is_active' => true, 'must_change_password' => true,
        ])->save();

        $this->command?->info("Initial administrator ready: {$email} (sign in at /staff-login and change the password).");
    }
}
