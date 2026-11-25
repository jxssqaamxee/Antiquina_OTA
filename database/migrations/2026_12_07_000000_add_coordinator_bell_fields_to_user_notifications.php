<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Coordinator bell: server notices say WHICH trainee they are about (subject_user_id), so the API can drop a
     * notice the moment that trainee leaves the coordinator's section, and carry a dedupe_key so one trainee's
     * pending entries are ONE live notice (with a count) instead of a flood. Trainee rows leave these columns null.
     */
    public function up(): void
    {
        if (! Schema::hasTable('user_notifications')) {
            return;
        }
        Schema::table('user_notifications', function (Blueprint $table) {
            if (! Schema::hasColumn('user_notifications', 'subject_user_id')) {
                $table->foreignId('subject_user_id')->nullable()->constrained('users')->cascadeOnDelete();
            }
            if (! Schema::hasColumn('user_notifications', 'dedupe_key')) {
                $table->string('dedupe_key', 64)->nullable();
            }
            if (! Schema::hasColumn('user_notifications', 'item_count')) {
                $table->unsignedInteger('item_count')->default(1);
            }
        });
        Schema::table('user_notifications', function (Blueprint $table) {
            // One recipient can hold one live notice per key. NULL keys (every trainee notice) never collide.
            $table->unique(['user_id', 'dedupe_key'], 'user_notifications_user_dedupe_unique');
            $table->index(['subject_user_id', 'type'], 'user_notifications_subject_type_index');
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('user_notifications')) {
            return;
        }
        Schema::table('user_notifications', function (Blueprint $table) {
            $table->dropUnique('user_notifications_user_dedupe_unique');
            $table->dropIndex('user_notifications_subject_type_index');
        });
        Schema::table('user_notifications', function (Blueprint $table) {
            $table->dropConstrainedForeignId('subject_user_id');
            $table->dropColumn(['dedupe_key', 'item_count']);
        });
    }
};
