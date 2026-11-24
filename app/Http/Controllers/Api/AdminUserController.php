<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Academic\ActivityLogService;
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
            ->orderBy('last_name')->orderBy('first_name')->limit(50)->get();

        return response()->json(['users' => $users->map(fn (User $u) => $this->present($u))->values()]);
    }

    public function update(Request $request, User $user, ActivityLogService $log): JsonResponse
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

        if ($changed) {
            $user->update($new);
            $log->record($request->user(), 'user.updated', 'user', $user->id, null, ['fields' => $changed]);
        }

        return response()->json(['user' => $this->present($user->fresh())]);
    }
}
