<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One row per phone/browser that agreed to receive push messages.
        Schema::create('push_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->text('endpoint');
            $table->string('endpoint_hash', 64)->unique(); // sha256 of the endpoint (a text column cannot be unique)
            $table->string('public_key', 255);
            $table->string('auth_token', 255);
            $table->string('content_encoding', 20)->default('aes128gcm');
            $table->timestamps();
            $table->index('user_id');
        });

        // Which reminder was already sent, so the every-minute scheduler never sends one twice
        // (also safe if two servers run the scheduler at the same time).
        Schema::create('push_reminder_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('client_uid', 32);
            $table->string('kind', 16);          // shift-start | shift-end
            $table->date('local_date');          // the day in OCC_TIMEZONE
            $table->timestamps();
            $table->unique(['user_id', 'client_uid', 'kind', 'local_date'], 'push_reminder_once');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('push_reminder_logs');
        Schema::dropIfExists('push_subscriptions');
    }
};
