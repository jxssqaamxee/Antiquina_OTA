<?php

use App\Services\Academic\AcademicSeeder;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /** Seeds the five courses + the current academic year and gives every existing trainee a pending enrollment. Never fails on odd data. */
    public function up(): void
    {
        AcademicSeeder::run();
    }

    public function down(): void
    {
        // Data only; nothing to undo (tables are dropped by the previous migration's down()).
    }
};
