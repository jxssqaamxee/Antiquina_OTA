<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StudentEnrollment extends Model
{
    public const PENDING = 'pending_placement';
    public const ACTIVE = 'active';
    public const COMPLETED = 'completed';
    public const TRANSFERRED = 'transferred';
    public const REPEATING = 'repeating';
    public const STATUSES = [self::PENDING, self::ACTIVE, self::COMPLETED, self::TRANSFERRED, self::REPEATING];

    protected $fillable = ['user_id', 'course_id', 'academic_year_id', 'section_id', 'year_level', 'status', 'started_at', 'ended_at'];

    protected function casts(): array
    {
        return ['started_at' => 'datetime', 'ended_at' => 'datetime'];
    }

    /** The student's current (open) enrollment. */
    public function scopeOpen(Builder $q): Builder
    {
        return $q->whereNull('ended_at');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }

    public function section(): BelongsTo
    {
        return $this->belongsTo(Section::class);
    }

    public function academicYear(): BelongsTo
    {
        return $this->belongsTo(AcademicYear::class);
    }

    public function toClient(): array
    {
        return [
            'id' => $this->id, 'status' => $this->status, 'year_level' => $this->year_level,
            'course' => $this->course ? ['id' => $this->course->id, 'code' => $this->course->code, 'name' => $this->course->name] : null,
            'section' => $this->section ? ['id' => $this->section->id, 'code' => $this->section->code()] : null,
            'student' => $this->user ? ['id' => $this->user->id, 'student_id' => $this->user->student_id, 'name' => $this->user->fullName()] : null,
        ];
    }
}
