<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The list of Student IDs allowed to register (filled with `php artisan roster:import file.csv`).
        // Only enforced when OCC_ROSTER_ENFORCE=true.
        if (! Schema::hasTable('enrolled_students')) {
            Schema::create('enrolled_students', function (Blueprint $table) {
                $table->id();
                $table->string('student_id', 12)->unique();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('enrolled_students');
    }
};
