<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Phase 1: account roles. Additive only; every existing account stays a trainee.
     *
     *  - role         admin | coordinator | trainee (default trainee). Never mass-assignable.
     *  - staff_id     sign-in ID for Admin / Coordinator accounts (unique, nullable for trainees).
     *  - is_active    false = deactivated: cannot sign in, existing sessions are revoked.
     *  - student_id / course become nullable because staff accounts have neither.
     *    (A unique index allows many NULLs on both MySQL and SQLite.)
     */
    public function up(): void
    {
        if (! Schema::hasColumn('users', 'role')) {
            Schema::table('users', function (Blueprint $table) {
                $table->string('role', 16)->default('trainee')->index();
            });
        }
        if (! Schema::hasColumn('users', 'staff_id')) {
            Schema::table('users', function (Blueprint $table) {
                $table->string('staff_id', 32)->nullable()->unique();
            });
        }
        if (! Schema::hasColumn('users', 'is_active')) {
            Schema::table('users', function (Blueprint $table) {
                $table->boolean('is_active')->default(true);
            });
        }
        if (! Schema::hasColumn('users', 'deactivated_at')) {
            Schema::table('users', function (Blueprint $table) {
                $table->timestamp('deactivated_at')->nullable();
            });
        }

        Schema::table('users', function (Blueprint $table) {
            $table->string('student_id', 32)->nullable()->change();
            $table->string('course', 160)->nullable()->change();
        });
    }

    public function down(): void
    {
        // student_id / course stay nullable: restoring NOT NULL would fail once staff rows exist.
        Schema::table('users', function (Blueprint $table) {
            foreach (['role', 'staff_id', 'is_active', 'deactivated_at'] as $column) {
                if (Schema::hasColumn('users', $column)) {
                    if ($column === 'staff_id') {
                        $table->dropUnique(['staff_id']);
                    }
                    if ($column === 'role') {
                        $table->dropIndex(['role']);
                    }
                    $table->dropColumn($column);
                }
            }
        });
    }
};
