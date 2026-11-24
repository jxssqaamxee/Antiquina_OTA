<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Self-registration approval. Every existing account is "approved" (the column default), so nobody is locked out. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'approval_status')) {
                $table->string('approval_status', 16)->default('approved')->index();
                $table->unsignedBigInteger('approval_reviewed_by')->nullable();
                $table->timestamp('approval_reviewed_at')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'approval_status')) {
                $table->dropIndex(['approval_status']);
                $table->dropColumn(['approval_status', 'approval_reviewed_by', 'approval_reviewed_at']);
            }
        });
    }
};
