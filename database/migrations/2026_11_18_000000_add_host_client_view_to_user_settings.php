<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Remembers, per user, which host client the progress view and the PDF export are scoped to
     * (null = all host clients, "none" = unassigned, otherwise a host client uid), so the
     * choice restores when the user signs in on another device. Non-destructive.
     */
    public function up(): void
    {
        Schema::table('user_settings', function (Blueprint $table) {
            if (! Schema::hasColumn('user_settings', 'view_client_uid')) {
                $table->string('view_client_uid', 32)->nullable();
            }
            if (! Schema::hasColumn('user_settings', 'export_client_uid')) {
                $table->string('export_client_uid', 32)->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('user_settings', function (Blueprint $table) {
            foreach (['view_client_uid', 'export_client_uid'] as $col) {
                if (Schema::hasColumn('user_settings', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
