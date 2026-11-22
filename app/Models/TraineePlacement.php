<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TraineePlacement extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return ['days' => 'array', 'starts_on' => 'date:Y-m-d', 'ended_at' => 'datetime'];
    }

    public function establishment(): BelongsTo
    {
        return $this->belongsTo(HostEstablishment::class, 'establishment_id');
    }
}
