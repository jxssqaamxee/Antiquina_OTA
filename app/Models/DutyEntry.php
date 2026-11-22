<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DutyEntry extends Model
{
    public const DRAFT = 'draft';
    public const SUBMITTED = 'submitted';
    public const APPROVED = 'approved';
    public const REJECTED = 'rejected';
    /** Entries the trainee can no longer change or delete through sync. */
    public const LOCKED = [self::SUBMITTED, self::APPROVED];

    protected $guarded = [];

    protected function casts(): array
    {
        return ['duty_date' => 'date:Y-m-d', 'hours' => 'float', 'verified_hours' => 'float', 'submitted_at' => 'datetime', 'reviewed_at' => 'datetime', 'legacy' => 'boolean'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function hostClient(): BelongsTo
    {
        return $this->belongsTo(HostClient::class);
    }
}
