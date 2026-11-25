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
        $docs = $this->store->all($request->user());
        $body = ['documents' => (object) $docs];
        // Revisions only exist alongside documents; an empty account keeps the bare {documents:[]} shape.
        if ($docs !== []) {
            $body['revisions'] = (object) $this->store->revisions($request->user());
        }

        return response()->json($body);
    }

    /**
     * Cheap change check for live refresh: only the revision numbers (a few bytes). The app polls this and
     * downloads the documents only when a number moved (a coordinator reviewed an entry, an announcement
     * arrived, another device saved).
     */
    public function revisions(Request $request): JsonResponse
    {
        return response()->json(['revisions' => (object) $this->store->revisions($request->user())])
            ->header('Cache-Control', 'no-store');
    }

    public function update(Request $request, string $key): JsonResponse
    {
        abort_unless(in_array($key, LogbookRules::KEYS, true), 404);

        // "present" (not "required"): false / 0 / [] / null are legitimate values.
        $request->validate([
            'value' => ['present'],
            'base_revision' => ['nullable', 'integer', 'min:0'],
            'save_id' => ['nullable', 'string', 'max:36'],
        ]);

        $bytes = strlen((string) json_encode($request->input('value')));
        abort_if($bytes > config('occ.document_max_bytes'), 413, 'Document too large.');

        $base = $request->input('base_revision') !== null
            ? (int) $request->input('base_revision') : null;

        $r = $this->store->save($request->user(), $key, $request->input('value'), $base, $request->input('save_id'));

        if ($r['status'] === 'conflict') {
            return response()->json([
                'message' => 'This document was changed elsewhere.',
                'revision' => $r['revision'],
                'value' => $r['value'],
            ], 409);
        }

        $body = ['ok' => true, 'revision' => $r['revision']];
        if ($r['status'] === 'duplicate' || $r['changed']) {
            $body['value'] = $r['value'];
        }

        return response()->json($body);
    }

    public function destroy(Request $request, string $key): JsonResponse
    {
        abort_unless(in_array($key, LogbookRules::KEYS, true), 404);
        $this->store->forget($request->user(), $key);

        return response()->json(['ok' => true]);
    }
}
