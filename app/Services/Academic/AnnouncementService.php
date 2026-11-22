<?php

namespace App\Services\Academic;

use App\Models\Announcement;
use App\Models\StudentEnrollment;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/** Publishes an announcement as a SERVER notification to exactly the trainees in its audience. */
class AnnouncementService
{
    public function __construct(private CoordinatorAccessService $scope, private ServerNotifier $notify, private ActivityLogService $log) {}

    /** @param array{audience_type:string,course_id?:?int,section_id?:?int,title:string,body:string} $data */
    public function publish(User $author, array $data): Announcement
    {
        $type = $data['audience_type'];
        $sectionId = $data['section_id'] ?? null;
        $courseId = $data['course_id'] ?? null;

        if ($author->isCoordinator()) {
            // A Coordinator can only ever write to their own section, whatever the request says.
            $own = $this->scope->section($author);
            abort_if(! $own, 422, 'You have no section yet.');
            abort_unless($type === 'section' && (int) $sectionId === $own->id, 404);
        }

        $q = StudentEnrollment::open()->select('user_id');
        match ($type) {
            'section' => $q->where('section_id', $sectionId ?? 0),
            'course' => $q->where('course_id', $courseId ?? 0),
            default => null,
        };
        $ids = User::where('role', User::ROLE_TRAINEE)->where('is_active', true)->whereIn('id', $q)->pluck('id');

        return DB::transaction(function () use ($author, $data, $type, $sectionId, $courseId, $ids) {
            $a = Announcement::create([
                'author_id' => $author->id, 'audience_type' => $type,
                'course_id' => $type === 'course' ? $courseId : null, 'section_id' => $type === 'section' ? $sectionId : null,
                'title' => trim($data['title']), 'body' => trim($data['body']), 'recipient_count' => $ids->count(),
            ]);
            foreach ($ids->chunk(200) as $chunk) {
                DB::table('announcement_recipients')->insert($chunk->map(fn ($id) => ['announcement_id' => $a->id, 'user_id' => $id, 'created_at' => now()])->all());
            }
            foreach (User::whereIn('id', $ids)->get() as $u) {
                $this->notify->notify($u, $a->title, $a->body, 'announcement');
            }
            $this->log->record($author, 'announcement.published', 'announcement', $a->id, $type === 'section' ? (int) $sectionId : null, ['audience' => $type, 'recipients' => $ids->count()]);

            return $a;
        });
    }
}
