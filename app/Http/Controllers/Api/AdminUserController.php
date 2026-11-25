<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CoordinatorAssignment;
use App\Models\StudentEnrollment;
use App\Models\TraineePlacement;
use App\Models\User;
use App\Services\Academic\AccountStatusService;
use App\Services\Academic\TrainingHourService;
use App\Support\PrivateMedia;
use App\Services\Academic\ActivityLogService;
use App\Services\Auth\SessionLogin;
use App\Support\SecurityLog;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use App\Support\Formats;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Admin-only (role:admin): the ONLY place where account details (name, email) can be changed, for every
 * account (trainees, coordinators, administrators). Profile Settings is read-only for everyone, like sclf_APP.
 * Sign-in IDs (Student ID / Admin ID) and roles are never edited here.
 */
class AdminUserController extends Controller
{
    private function present(User $u): array
    {
        return [
            'id' => $u->id,
            'role' => $u->role,
            'first_name' => $u->first_name,
            'middle_name' => $u->middle_name,
            'last_name' => $u->last_name,
            'name' => $u->fullName(),
            'login_id' => $u->student_id ?: $u->admin_id,
            'email' => $u->email,
            'is_active' => $u->isActive(),
        ];
    }

    public function index(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));
        $role = (string) $request->query('role', '');
        $like = '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q).'%';

        $users = User::query()
            ->when(in_array($role, ['trainee', 'coordinator', 'admin'], true), fn ($x) => $x->where('role', $role))
            ->when($q !== '', fn ($x) => $x->where(fn ($w) => $w
                ->where('first_name', 'like', $like)->orWhere('last_name', 'like', $like)
                ->orWhere('student_id', 'like', $like)->orWhere('admin_id', 'like', $like)->orWhere('email', 'like', $like)))
            ->orderBy('last_name')->orderBy('first_name')->limit(51)->get();

        // 51 are fetched so the screen can say "showing the first 50, search to narrow it" instead of silently hiding the rest.
        return response()->json(['users' => $users->take(50)->map(fn (User $u) => $this->present($u))->values(), 'truncated' => $users->count() > 50]);
    }


    /**
     * Everything the Administrator may want to know about ONE account, read-only (the "View" button on the Users screen).
     * Trainee: enrollment now + history, placement, hours. Coordinator: section now + assignment history.
     * Never returns a password, 2FA secret or recovery code (User::$hidden is not relied on: fields are listed by hand).
     */
    public function show(User $user, TrainingHourService $hours): JsonResponse
    {
        $out = $this->present($user) + [
            'email_verified' => $user->hasVerifiedEmail(),
            'email_verified_at' => $user->email_verified_at,
            'approval_status' => $user->approval_status ?: User::APPROVAL_APPROVED,
            'course' => $user->course,
            'created_at' => $user->created_at,
            'deactivated_at' => $user->deactivated_at,
            'must_change_password' => (bool) $user->must_change_password,
            'two_factor' => $user->hasAdminAccess() ? $user->hasTwoFactor() : null,
            'photo_v' => $user->photoUrl() ? PrivateMedia::version($user->profile_photo) : null,
            'enrollment' => null, 'enrollments' => [], 'placement' => null, 'hours' => null,
            'assignment' => null, 'assignments' => [],
        ];

        if ($user->isTrainee()) {
            $rows = $user->enrollments()->with(['course', 'section.course', 'academicYear'])->orderByDesc('id')->get();
            $row = fn (StudentEnrollment $e) => [
                'id' => $e->id, 'status' => $e->status, 'year_level' => $e->year_level,
                'course' => $e->course?->code, 'section' => $e->section?->code(), 'academic_year' => $e->academicYear?->name,
                'started_at' => $e->started_at, 'ended_at' => $e->ended_at, 'is_open' => $e->ended_at === null,
            ];
            $out['enrollments'] = $rows->map($row)->values();
            $open = $rows->first(fn (StudentEnrollment $e) => $e->ended_at === null);
            $out['enrollment'] = $open ? $row($open) : null;
            $p = TraineePlacement::where('user_id', $user->id)->whereNull('ended_at')->with('establishment')->latest('id')->first();
            $out['placement'] = $p ? [
                'establishment' => $p->establishment?->name, 'address' => $p->establishment?->address,
                'supervisor' => $p->supervisor_name ?: $p->establishment?->supervisor_name,
                'days' => $p->days, 'time_in' => $p->time_in, 'time_out' => $p->time_out, 'starts_on' => $p->starts_on?->toDateString(),
            ] : null;
            $out['hours'] = $hours->summary($user);
        } elseif ($user->isCoordinator()) {
            $rows = CoordinatorAssignment::where('coordinator_id', $user->id)->with('section.course', 'section.academicYear')->orderByDesc('id')->get();
            $row = fn (CoordinatorAssignment $a) => [
                'section' => $a->section?->code(), 'academic_year' => $a->section?->academicYear?->name,
                'started_at' => $a->started_at, 'ended_at' => $a->ended_at, 'is_open' => $a->ended_at === null,
            ];
            $out['assignments'] = $rows->map($row)->values();
            $open = $rows->first(fn (CoordinatorAssignment $a) => $a->ended_at === null);
            $out['assignment'] = $open ? $row($open) : null;
        }

        return response()->json(['user' => $out]);
    }

    /** Photo of any account (the Administrator may see every account's picture on the details screen). */
    public function photo(User $user)
    {
        return app(\App\Http\Controllers\MediaController::class)->forUser($user);
    }

    public function update(Request $request, User $user, ActivityLogService $log, SessionLogin $sessions): JsonResponse
    {
        $request->merge([
            'first_name' => Formats::squish($request->input('first_name')),
            'middle_name' => Formats::squish($request->input('middle_name')),
            'last_name' => Formats::squish($request->input('last_name')),
            'email' => strtolower(trim((string) $request->input('email'))),
        ]);

        $data = $request->validate([
            'first_name' => ['required', 'string', 'max:80', 'regex:'.Formats::NAME],
            'middle_name' => ['nullable', 'string', 'max:80', 'regex:'.Formats::NAME],
            'last_name' => ['required', 'string', 'max:80', 'regex:'.Formats::NAME],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
        ], [
            'first_name.regex' => 'First name can only contain letters, spaces, hyphens and apostrophes.',
            'middle_name.regex' => 'Middle name can only contain letters, spaces, hyphens and apostrophes.',
            'last_name.regex' => 'Last name can only contain letters, spaces, hyphens and apostrophes.',
            'email.unique' => 'That email is already used by another account.',
        ]);

        $new = [
            'first_name' => Formats::titleCase($data['first_name']),
            'middle_name' => ! empty($data['middle_name']) ? Formats::titleCase($data['middle_name']) : null,
            'last_name' => Formats::titleCase($data['last_name']),
            'email' => $data['email'],
        ];
        $changed = array_keys(array_filter($new, fn ($v, $k) => $user->{$k} !== $v, ARRAY_FILTER_USE_BOTH));
        $emailChanged = in_array('email', $changed, true);
        $oldEmail = $user->email;

        // Rewriting someone's email is the first step of an account takeover (with "forgot password"),
        // so it needs the acting administrator's own current password.
        if ($emailChanged) {
            $actor = $request->user();
            if (! Hash::check((string) $request->input('admin_password', ''), (string) $actor->password)) {
                SecurityLog::failure('admin_email_change_bad_password', ['target_id' => $user->id]);
                throw ValidationException::withMessages(['admin_password' => 'Enter your own current password to change an email address.']);
            }
        }

        if ($changed) {
            $old = [];
            foreach ($changed as $f) {
                $old[$f] = $user->{$f};
            }
            DB::transaction(function () use ($user, $new, $emailChanged, $log, $request, $changed, $old) {
                $user->fill($new);
                if ($emailChanged) {
                    $user->email_verified_at = null; // the new address must prove it is theirs
                }
                $user->save();
                $log->record($request->user(), 'user.updated', 'user', $user->id, null, [
                    'fields' => $changed,
                    'old' => $old,
                    'new' => array_intersect_key($new, $old),
                ]);
            });

            if ($emailChanged) {
                // Whoever holds a session (or a reset link sent to the old address) loses it now.
                $keep = $user->id === $request->user()->id ? $request->session()->getId() : null;
                $sessions->revokeOthers($user, $keep);
                if ($keep === null) {
                    $user->pushSubscriptions()->delete();
                }
                DB::table(config('auth.passwords.users.table', 'password_reset_tokens'))->where('email', $oldEmail)->delete();
                \App\Mail\EmailChangedMail::notifyOld($user->first_name ?: $user->fullName(), $oldEmail, $user->email);
                \App\Http\Controllers\Api\EmailVerificationController::send($user);
            }
        }

        return response()->json(['user' => $this->present($user->fresh())]);
    }

    public function deactivate(Request $request, User $user, AccountStatusService $status): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:255']]);
        $status->deactivate($request->user(), $user, trim($data['reason']));

        return response()->json(['user' => $this->present($user->fresh())]);
    }

    public function reactivate(Request $request, User $user, AccountStatusService $status): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:255']]);
        $status->reactivate($request->user(), $user, trim($data['reason']));

        return response()->json(['user' => $this->present($user->fresh())]);
    }

    /** Lost phone and no recovery codes: an administrator clears another staff account's two-factor (own password needed). */
    public function resetTwoFactor(Request $request, User $user, ActivityLogService $log, SessionLogin $sessions, \App\Services\Auth\TwoFactorService $tf): JsonResponse
    {
        abort_if($user->id === $request->user()->id, 422, 'Use your own settings to change your two-factor.');
        abort_unless($user->hasAdminAccess() && $user->hasTwoFactor(), 409, 'That account has no two-factor to reset.');
        if (! Hash::check((string) $request->input('admin_password', ''), (string) $request->user()->password)) {
            SecurityLog::failure('admin_2fa_reset_bad_password', ['target_id' => $user->id]);
            throw ValidationException::withMessages(['admin_password' => 'Enter your own current password to reset two-factor.']);
        }
        $tf->disable($user);
        $sessions->revokeAll($user);
        $log->record($request->user(), 'two_factor.reset_by_admin', 'user', $user->id);

        return response()->json(['user' => $this->present($user->fresh())]);
    }
}
