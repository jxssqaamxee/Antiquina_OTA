<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Phase 4: rollover records + user_notifications.source so server notices survive the client's whole-list sync. */
    public function up(): void
    {
        if (! Schema::hasTable('enrollment_progressions')) {
            Schema::create('enrollment_progressions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('from_enrollment_id')->constrained('student_enrollments')->restrictOnDelete();
                $table->foreignId('to_enrollment_id')->nullable()->constrained('student_enrollments')->nullOnDelete();
                $table->foreignId('target_academic_year_id')->constrained('academic_years')->restrictOnDelete();
                $table->string('kind', 16);               // promote | repeat | complete | transfer
                $table->string('reason', 255)->nullable();
                $table->foreignId('confirmed_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('confirmed_at')->nullable();
                $table->timestamps();
                $table->unique('from_enrollment_id', 'progression_once_per_enrollment'); // double-confirm is a no-op
            });
        }
        if (Schema::hasTable('user_notifications') && ! Schema::hasColumn('user_notifications', 'source')) {
            Schema::table('user_notifications', function (Blueprint $table) {
                $table->string('source', 8)->default('client'); // client | server
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('enrollment_progressions');
    }
};
