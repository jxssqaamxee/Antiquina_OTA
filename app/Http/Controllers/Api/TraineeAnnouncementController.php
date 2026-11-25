<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** What a trainee sees on the Announcements page: only announcements that were delivered to THEM (announcement_recipients). */
class TraineeAnnouncementController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $rows = DB::table('announcement_recipients as r')
            ->join('announcements as a', 'a.id', '=', 'r.announcement_id')
            ->leftJoin('users as u', 'u.id', '=', 'a.author_id')
            ->leftJoin('sections as s', 's.id', '=', 'a.section_id')
            ->leftJoin('courses as c', 'c.id', '=', 's.course_id')
            ->where('r.user_id', $request->user()->id)
            ->orderByDesc('a.id')
            ->limit(100)
            ->get(['a.id', 'a.title', 'a.body', 'a.audience_type', 'a.created_at', 'u.first_name', 'u.middle_name', 'u.last_name', 'u.role as author_role', 's.year_level as section_year', 's.label as section_label', 'c.code as course_code']);

        return response()->json(['announcements' => $rows->map(fn ($a) => [
            'id' => $a->id,
            'title' => $a->title,
            'body' => $a->body,
            'audience' => $a->audience_type,
            // sections has no `code` column: the display code (e.g. BSIT-4A) is course + year level + label, like Section::code().
            'section' => $a->section_label ? ($a->course_code ?? '').'-'.$a->section_year.$a->section_label : null,
            'from' => trim(implode(' ', array_filter([$a->first_name, $a->middle_name, $a->last_name]))) ?: 'Your coordinator',
            'from_role' => $a->author_role,
            'created_at' => $a->created_at,
        ])->values()])->header('Cache-Control', 'no-store');
    }
}
