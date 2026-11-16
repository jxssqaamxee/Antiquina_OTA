<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One JSON document per (user, key): logbook entries + host clients,
        // milestones, reminder flags, notification history.
        Schema::create('user_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('key', 64);
            $table->longText('value');
            $table->timestamps();
            $table->unique(['user_id', 'key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_documents');
    }
};
