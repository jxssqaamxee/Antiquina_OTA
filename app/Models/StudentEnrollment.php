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

    /**
     * What a school year "contains": each student's LAST enrollment made in that year, open or already closed
     * (completed, carried over, transferred). This is what year-scoped screens show, so a finished year stays
     * readable as history while the new year starts empty.
     */
    public function scopeInYear(Builder $q, int $yearId): Builder
    {
        return $q->whereIn('student_enrollments.id', static::query()->where('academic_year_id', $yearId)->selectRaw('max(id)')->groupBy('user_id'));
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
            'academic_year' => $this->relationLoaded('academicYear') ? $this->academicYear?->name : null,
            'course' => $this->course ? ['id' => $this->course->id, 'code' => $this->course->code, 'name' => $this->course->name] : null,
            'section' => $this->section ? ['id' => $this->section->id, 'code' => $this->section->code()] : null,
            'student' => $this->user ? ['id' => $this->user->id, 'student_id' => $this->user->student_id, 'name' => $this->user->fullName()] : null,
        ];
    }
}
