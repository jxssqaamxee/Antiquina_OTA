<?php

namespace App\Services\Academic;

use App\Models\ActivityLog;
use App\Models\User;

class ActivityLogService
{
    public function record(?User $actor, string $action, ?string $subjectType = null, ?int $subjectId = null, ?int $sectionId = null, array $details = []): ActivityLog
    {
        return ActivityLog::create([
            'actor_id' => $actor?->id, 'action' => $action, 'subject_type' => $subjectType,
            'subject_id' => $subjectId, 'section_id' => $sectionId, 'details' => $details ?: null,
        ]);
    }

    /** Audit viewer rows: newest first, with the actor's name; optional action prefix filter (e.g. "entry."). */
    public function feed(\Illuminate\Database\Eloquent\Builder $q, ?string $actionPrefix = null, int $limit = 100): array
    {
        if ($actionPrefix !== null && $actionPrefix !== '') {
            $q->where('action', 'like', preg_replace('/[^a-z.]/i', '', mb_substr($actionPrefix, 0, 40)).'%'); // letters and dots only: no LIKE wildcards
        }
        $rows = $q->orderByDesc('id')->limit($limit)->get();
        $names = User::whereIn('id', $rows->pluck('actor_id')->filter())->get()->keyBy('id');

        return $rows->map(fn (ActivityLog $r) => [
            'id' => $r->id, 'created_at' => $r->created_at, 'action' => $r->action, 'subject_type' => $r->subject_type,
            'subject_id' => $r->subject_id, 'section_id' => $r->section_id, 'details' => $r->details,
            'actor' => $r->actor_id ? ($names[$r->actor_id]?->fullName() ?? 'User #'.$r->actor_id) : 'System',
        ])->all();
    }
}
