<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Section extends Model
{
    protected $attributes = ['is_active' => true];

    protected $fillable = ['course_id', 'academic_year_id', 'year_level', 'label', 'is_active'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean', 'year_level' => 'integer'];
    }

    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }

    public function academicYear(): BelongsTo
    {
        return $this->belongsTo(AcademicYear::class);
    }

    public function enrollments(): HasMany
    {
        return $this->hasMany(StudentEnrollment::class);
    }

    /** Display code only (e.g. BSIT-4A); relationships always use the primary key. */
    public function code(): string
    {
        return ($this->course?->code ?? '').'-'.$this->year_level.$this->label;
    }

    public function toClient(): array
    {
        return [
            'id' => $this->id, 'code' => $this->code(), 'course_id' => $this->course_id,
            'academic_year_id' => $this->academic_year_id, 'year_level' => $this->year_level,
            'label' => $this->label, 'is_active' => $this->is_active,
        ];
    }
}
