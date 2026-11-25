<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\UserNotification;
use App\Services\Academic\CoordinatorNotifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The coordinator's bell. Every query starts from CoordinatorNotifier::visibleTo(), i.e. the signed-in coordinator's
 * own notices only. There is no user id in any request: another coordinator's notice id behaves like a missing one.
 */
class CoordinatorNotificationController extends Controller
{
    private const LIMIT = 60;

    public function __construct(private CoordinatorNotifier $notices) {}

    public function index(Request $request): JsonResponse
    {
        $q = $this->notices->visibleTo($request->user());

        return response()->json([
            'notifications' => (clone $q)->orderByDesc('notified_at')->orderByDesc('id')->limit(self::LIMIT)->get()
                ->map(fn (UserNotification $n) => $this->notices->toClient($n))->values(),
            'unread_count' => (clone $q)->where('is_read', false)->count(),
        ]);
    }

    /** Body { ids: [...] } marks those read; { all: true } marks every unread one. */
    public function markRead(Request $request): JsonResponse
    {
        $data = $request->validate(['ids' => ['sometimes', 'array', 'max:100'], 'ids.*' => ['string', 'max:32'], 'all' => ['sometimes', 'boolean']]);
        $q = $this->notices->visibleTo($request->user())->where('is_read', false);
        if (! ($data['all'] ?? false)) {
            $q->whereIn('notif_uid', $data['ids'] ?? []);
        }

        return response()->json(['ok' => true, 'updated' => $q->update(['is_read' => true])]);
    }

    public function destroy(Request $request, string $uid): JsonResponse
    {
        $n = $this->notices->visibleTo($request->user())->where('notif_uid', $uid)->firstOrFail();
        $n->delete();

        return response()->json(['ok' => true]);
    }

    public function clear(Request $request): JsonResponse
    {
        return response()->json(['ok' => true, 'deleted' => $this->notices->visibleTo($request->user())->delete()]);
    }
}
