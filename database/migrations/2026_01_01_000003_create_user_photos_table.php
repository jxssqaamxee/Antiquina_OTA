<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The profile photo lives IN THE DATABASE (base64 text), not only on the container's disk.
        // A redeploy wipes the container's disk, but the database survives, so photos survive too.
        if (! Schema::hasTable('user_photos')) {
            Schema::create('user_photos', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
                $table->string('mime', 50);
                $table->longText('data'); // base64 of the (already shrunk) image
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('user_photos');
    }
};
