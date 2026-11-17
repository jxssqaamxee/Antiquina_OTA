<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Legacy, read-only backup: one JSON blob per (user, key) from the pre-table version of the app.
     * Only LegacyImporter reads it. Nothing writes to it any more.
     */
    public function up(): void
    {
        if (! Schema::hasTable('user_documents')) {
            Schema::create('user_documents', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->string('key', 64);
                $table->longText('value');
                $table->timestamps();
                $table->unique(['user_id', 'key']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('user_documents');
    }
};
