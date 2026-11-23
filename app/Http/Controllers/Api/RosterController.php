<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Section;
use App\Models\User;
use App\Services\Academic\ActivityLogService;
use App\Services\Academic\CoordinatorAccessService;
use App\Services\Roster\RosterImportService;
use App\Services\Roster\RosterReadException;
use App\Support\Formats;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The roster = the list of Student IDs (with their course) allowed to register, one list per section.
 * Coordinator: always their own section (taken from their account, never from the request).
 * Admin: any section, chosen with section_id.
 */
class RosterController extends Controller
{
    public function __construct(private CoordinatorAccessService $scope) {}

    private function section(Request $request): Section
    {
        $user = $request->user();
        if ($user->isCoordinator()) {
            $section = $this->scope->section($user);
            if (! $section) {
                throw ValidationException::withMessages(['file' => 'No section has been assigned to you yet. Please contact an administrator.']);
            }

            return $section;
        }

        $data = $request->validate(['section_id' => ['required', 'integer', 'exists:sections,id']]);

        return Section::with('course')->findOrFail($data['section_id']);
    }

    /** Reads the uploaded file and either shows what would happen (dry_run) or saves it. */
    public function import(Request $request, RosterImportService $svc): JsonResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'max:10240'],
            'dry_run' => ['sometimes', 'boolean'],
            'assume_course' => ['sometimes', 'boolean'],
        ], [
            'file.required' => 'Choose a file first.',
            'file.max' => 'That file is bigger than 10 MB.',
            'file.uploaded' => 'The file could not be uploaded. It must be smaller than 10 MB.',
        ]);
        $section = $this->section($request);
        $file = $request->file('file');

        try {
            $result = $svc->run($request->user(), $section, $file->getRealPath(), $file->getClientOriginalName(),
                $request->boolean('dry_run'), $request->boolean('assume_course'));
        } catch (RosterReadException $e) {
            throw ValidationException::withMessages(['file' => $e->getMessage()]);
        }

        return response()->json($result);
    }

    /** Adds Student IDs typed by hand. The course is always the section's course (never typed). */
    public function add(Request $request, RosterImportService $svc): JsonResponse
    {
        $request->validate(['student_ids' => ['required', 'string', 'max:5000']], [
            'student_ids.required' => 'Type at least one Student ID (like 2021-2-04062).',
        ]);
        $section = $this->section($request);

        try {
            $result = $svc->addManual($request->user(), $section, (string) $request->input('student_ids'));
        } catch (RosterReadException $e) {
            throw ValidationException::withMessages(['student_ids' => $e->getMessage()]);
        }

        return response()->json($result);
    }

    /** @return \Illuminate\Support\Collection<int,array> the section's roster rows with registration status */
    private function rows(Section $section)
    {
        $courses = DB::table('courses')->pluck('code', 'id');

        return DB::table('enrolled_students as e')
            ->leftJoin('users as u', 'u.student_id', '=', 'e.student_id')
            ->where('e.section_id', $section->id)
            ->orderBy('e.student_id')->limit(3000)
            ->get(['e.student_id', 'e.course_id', 'e.source_file', 'u.id as user_id', 'u.first_name', 'u.last_name', 'u.email', 'u.created_at as registered_at'])
            ->map(fn ($r) => [
                'id' => $r->student_id, 'student_id' => $r->student_id, 'course' => $courses[$r->course_id] ?? null,
                'source_file' => $r->source_file, 'registered' => $r->user_id !== null,
                'name' => $r->user_id ? trim($r->first_name.' '.$r->last_name) : null,
                'email' => $r->email, 'registered_at' => $r->registered_at ? \Illuminate\Support\Carbon::parse($r->registered_at)->toIso8601String() : null,
            ])->values();
    }

    /** The section's roster with who has already registered. */
    public function index(Request $request): JsonResponse
    {
        $section = $this->section($request);
        $list = $this->rows($section);

        return response()->json([
            'section' => $section->toClient(),
            'total' => $list->count(),
            'registered' => $list->where('registered', true)->count(),
            'waiting' => $list->where('registered', false)->count(),
            'students' => $list,
        ]);
    }

    /** Same table as a CSV (optional ?status=registered|waiting). Cells a spreadsheet would run as a formula get an apostrophe. */
    public function export(Request $request): Response
    {
        $section = $this->section($request);
        $status = $request->query('status');
        $safe = fn ($v) => preg_match('/^[=+\-@\t\r]/', (string) $v) ? "'".$v : (string) $v;

        $fh = fopen('php://temp', 'r+');
        fputcsv($fh, ['Student ID', 'Course', 'Status', 'Name', 'Email', 'Registered on']);
        foreach ($this->rows($section) as $r) {
            if (($status === 'registered' && ! $r['registered']) || ($status === 'waiting' && $r['registered'])) {
                continue;
            }
            fputcsv($fh, array_map($safe, [
                $r['student_id'], $r['course'], $r['registered'] ? 'Registered' : 'Not registered yet',
                $r['name'], $r['email'], $r['registered_at'] ? substr($r['registered_at'], 0, 10) : '',
            ]));
        }
        rewind($fh);
        $file = 'roster-'.preg_replace('/[^A-Za-z0-9-]/', '', $section->code()).'.csv';

        return response("\xEF\xBB\xBF".stream_get_contents($fh), 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => "attachment; filename=\"{$file}\"",
            'Cache-Control' => 'no-store',
        ]);
    }

    /** Removes a Student ID that has not registered yet (a mistaken import). Registered students are untouched. */
    public function destroy(Request $request, string $studentId, ActivityLogService $log): JsonResponse
    {
        abort_unless(preg_match(Formats::STUDENT_ID, $studentId) === 1, 404);
        $section = $this->section($request);

        $row = DB::table('enrolled_students')->where('student_id', $studentId)->where('section_id', $section->id)->first();
        abort_unless($row, 404);
        if (User::where('student_id', $studentId)->exists()) {
            throw ValidationException::withMessages(['student_id' => 'This student has already registered and cannot be removed from the list.']);
        }

        DB::table('enrolled_students')->where('id', $row->id)->delete();
        $log->record($request->user(), 'roster.removed', 'section', $section->id, $section->id, ['student_id' => $studentId]);

        return response()->json(['ok' => true]);
    }
}
