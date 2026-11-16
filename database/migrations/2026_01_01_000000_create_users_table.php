<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('student_id', 32)->unique();
            $table->string('first_name', 80);
            $table->string('middle_name', 80)->nullable();
            $table->string('last_name', 80);
            $table->string('email')->unique();
            $table->string('course', 160);
            // Nullable: accounts created through Google never need a password
            // (they can add one later from Profile to use Student ID login).
            $table->string('password')->nullable();
            $table->string('google_id', 64)->nullable()->unique();
            $table->string('avatar', 500)->nullable();
            $table->timestamp('email_verified_at')->nullable();
            $table->rememberToken();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
