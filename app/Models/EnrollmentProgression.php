<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EnrollmentProgression extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return ['confirmed_at' => 'datetime'];
    }
}
