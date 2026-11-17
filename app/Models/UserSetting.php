<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserSetting extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'onboarding_seen' => 'boolean',
            'milestones' => 'array',
            'shift_reminder_date' => 'date:Y-m-d',
            'logbook_saved_at' => 'datetime',
            'notifications_saved_at' => 'datetime',
            'legacy_imported_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
