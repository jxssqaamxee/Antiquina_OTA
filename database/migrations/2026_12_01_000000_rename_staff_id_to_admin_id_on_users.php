<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * users.staff_id (sign-in ID for Admin / Coordinator accounts) becomes users.admin_id.
     * Data and the unique index are kept; only the column is renamed.
     */
    public function up(): void
    {
        if (Schema::hasColumn('users', 'staff_id') && ! Schema::hasColumn('users', 'admin_id')) {
            Schema::table('users', function (Blueprint $table) {
                $table->renameColumn('staff_id', 'admin_id');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('users', 'admin_id') && ! Schema::hasColumn('users', 'staff_id')) {
            Schema::table('users', function (Blueprint $table) {
                $table->renameColumn('admin_id', 'staff_id');
            });
        }
    }
};
