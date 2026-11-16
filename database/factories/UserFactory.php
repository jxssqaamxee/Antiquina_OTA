<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;

/** @extends Factory<User> */
class UserFactory extends Factory
{
    protected static ?string $password;

    public function definition(): array
    {
        return [
            'student_id' => fake()->unique()->numerify('2####-####'),
            'first_name' => fake()->firstName(),
            'middle_name' => fake()->lastName(),
            'last_name' => fake()->lastName(),
            'email' => fake()->unique()->userName().'@gmail.com',
            'course' => 'BSIT — Bachelor of Science in Information Technology',
            'password' => static::$password ??= Hash::make('password'),
            'email_verified_at' => now(),
        ];
    }
}
