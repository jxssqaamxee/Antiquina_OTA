<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A profile photo kept in the database so it survives redeploys (see the user_photos migration). */
class UserPhoto extends Model
{
    protected $fillable = ['user_id', 'mime', 'data'];

    protected $hidden = ['data'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Raw image bytes. */
    public function bytes(): string
    {
        return (string) base64_decode((string) $this->data, true);
    }
}
