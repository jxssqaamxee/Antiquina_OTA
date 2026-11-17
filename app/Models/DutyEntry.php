<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DutyEntry extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return ['duty_date' => 'date:Y-m-d', 'hours' => 'float'];
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
