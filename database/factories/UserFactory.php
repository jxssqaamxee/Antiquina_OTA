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
            'student_id' => fake()->unique()->numerify('2024-#-#####'),
            'first_name' => fake()->firstName(),
            'middle_name' => fake()->lastName(),
            'last_name' => fake()->lastName(),
            'email' => fake()->unique()->userName().'@gmail.com',
            'course' => 'BSIT — Bachelor of Science in Information Technology',
            'password' => static::$password ??= Hash::make('password'),
            'email_verified_at' => now(),
        ];
    }

    /** An Admin or Coordinator account: staff ID instead of Student ID / course, email already verified. */
    public function staff(string $role, ?string $staffId = null): static
    {
        return $this->state(fn () => [
            'role' => $role,
            'staff_id' => $staffId ?? strtoupper(fake()->unique()->bothify('STAFF-####')),
            'student_id' => null,
            'course' => null,
            'email' => fake()->unique()->userName().'@example.com',
        ]);
    }

    public function admin(?string $staffId = null): static
    {
        return $this->staff('admin', $staffId);
    }

    public function coordinator(?string $staffId = null): static
    {
        return $this->staff('coordinator', $staffId);
    }

    public function inactive(): static
    {
        return $this->state(fn () => ['is_active' => false, 'deactivated_at' => now()]);
    }
}
