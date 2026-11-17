<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
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
