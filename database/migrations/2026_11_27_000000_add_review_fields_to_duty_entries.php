<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Phase 5a: entry status + review trail + required-hours exceptions. Existing entries become draft + legacy. */
    public function up(): void
    {
        if (! Schema::hasColumn('duty_entries', 'status')) {
            Schema::table('duty_entries', function (Blueprint $table) {
                $table->string('status', 12)->default('draft')->index();   // draft | submitted | approved | rejected
                $table->timestamp('submitted_at')->nullable();
                $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('reviewed_at')->nullable();
                $table->string('review_reason', 500)->nullable();
                $table->decimal('verified_hours', 6, 2)->nullable();
                $table->boolean('legacy')->default(false);                  // existed before review: never silently counted as verified
            });
            DB::table('duty_entries')->update(['legacy' => true]);
        }

        if (! Schema::hasTable('duty_entry_reviews')) {
            Schema::create('duty_entry_reviews', function (Blueprint $table) {
                $table->id();
                $table->foreignId('duty_entry_id')->constrained('duty_entries')->cascadeOnDelete();
                $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('action', 12);                               // submitted | approved | rejected
                $table->string('reason', 500)->nullable();
                $table->decimal('verified_hours', 6, 2)->nullable();
                $table->timestamp('created_at')->nullable();
            });
        }

        if (! Schema::hasTable('training_hour_exceptions')) {
            Schema::create('training_hour_exceptions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->unsignedSmallInteger('previous_hours');
                $table->unsignedSmallInteger('new_hours');
                $table->string('reason', 500);
                $table->foreignId('admin_id')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('created_at')->nullable();
                $table->index(['user_id', 'id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('training_hour_exceptions');
        Schema::dropIfExists('duty_entry_reviews');
        // duty_entries review columns are left in place (nullable / defaulted, harmless).
    }
};
