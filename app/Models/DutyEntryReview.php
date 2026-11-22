<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Immutable review history: updates and deletes throw. */
class DutyEntryReview extends Model
{
    public const UPDATED_AT = null;

    protected $guarded = [];

    protected static function booted(): void
    {
        static::updating(fn () => throw new \LogicException('Review history is immutable.'));
        static::deleting(fn () => throw new \LogicException('Review history is immutable.'));
    }
}
