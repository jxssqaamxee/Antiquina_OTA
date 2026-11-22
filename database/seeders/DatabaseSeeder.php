<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Safe on a live site: only acts when INITIAL_ADMIN_* are set, and never creates a known-password demo.
        $this->call(AdminSeeder::class);

        // The demo trainee below has the password "password": never create it on a live site.
        if (app()->isProduction()) {
            $this->command?->warn('Seeder skipped: it creates a demo account with a known password.');

            return;
        }

        // Demo trainee: sign in with Student ID 2024-1-00001 / password "password".
        User::factory()->create([
            'student_id' => '2024-1-00001',
            'first_name' => 'Juan',
            'middle_name' => 'Dela',
            'last_name' => 'Cruz',
            'email' => 'occ.cruz.juan@gmail.com',
        ]);
    }
}
