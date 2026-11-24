<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One row = one INSTALL (browser profile or home-screen app) of one account. install_id is a random id the
        // app creates once per install (see resources/js/utils/push.js); a new endpoint from the same install
        // replaces the old row instead of piling up dead ones.
        Schema::table('push_subscriptions', function (Blueprint $table) {
            if (! Schema::hasColumn('push_subscriptions', 'install_id')) {
                $table->string('install_id', 64)->nullable()->after('user_id');
                $table->index('install_id');
            }
            if (! Schema::hasColumn('push_subscriptions', 'last_seen_at')) {
                $table->timestamp('last_seen_at')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('push_subscriptions', function (Blueprint $table) {
            if (Schema::hasColumn('push_subscriptions', 'install_id')) {
                $table->dropIndex(['install_id']);
                $table->dropColumn('install_id');
            }
            if (Schema::hasColumn('push_subscriptions', 'last_seen_at')) {
                $table->dropColumn('last_seen_at');
            }
        });
    }
};
