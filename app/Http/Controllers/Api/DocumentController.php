<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\Logbook\LogbookRules;
use App\Support\Logbook\LogbookStore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Per-user data the app syncs: the logbook (settings, host clients, duty entries), milestones,
 * reminder flags and notification history. Each document is validated and saved into real
 * tables (see App\Support\Logbook\LogbookStore); the JSON shapes the app uses are unchanged.
 */
class DocumentController extends Controller
{
    public function __construct(private LogbookStore $store) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(['documents' => (object) $this->store->all($request->user())]);
    }

    public function update(Request $request, string $key): JsonResponse
    {
        abort_unless(in_array($key, LogbookRules::KEYS, true), 404);

        // "present" (not "required"): false / 0 / [] / null are legitimate values.
        $request->validate(['value' => ['present']]);

        $bytes = strlen((string) json_encode($request->input('value')));
        abort_if($bytes > config('occ.document_max_bytes'), 413, 'Document too large.');

        $this->store->put($request->user(), $key, $request->input('value'));

        return response()->json(['ok' => true]);
    }

    public function destroy(Request $request, string $key): JsonResponse
    {
        abort_unless(in_array($key, LogbookRules::KEYS, true), 404);
        $this->store->forget($request->user(), $key);

        return response()->json(['ok' => true]);
    }
}
