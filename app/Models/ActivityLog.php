<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Append-only: updates and deletes throw. */
class ActivityLog extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['actor_id', 'action', 'subject_type', 'subject_id', 'section_id', 'details'];

    protected function casts(): array
    {
        return ['details' => 'array'];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new \LogicException('Activity logs are append-only.'));
        static::deleting(fn () => throw new \LogicException('Activity logs are append-only.'));
    }
}
