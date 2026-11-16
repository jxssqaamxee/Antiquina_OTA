<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\UserDocument;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Per-user JSON documents: the logbook (entries + host clients), milestones,
 * reminder flags and notification history. The React app keeps a local copy for
 * speed/offline use and writes every change through to here.
 */
class DocumentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $docs = $request->user()->documents()->get()
            ->mapWithKeys(fn (UserDocument $d) => [$d->key => json_decode($d->value, true)]);

        return response()->json(['documents' => (object) $docs->all()]);
    }

    public function update(Request $request, string $key): JsonResponse
    {
        abort_unless(in_array($key, config('occ.document_keys'), true), 404);

        $request->validate(['value' => ['present']]);

        $json = json_encode($request->input('value'));
        abort_if(strlen($json) > config('occ.document_max_bytes'), 413, 'Document too large.');

        $request->user()->documents()->updateOrCreate(['key' => $key], ['value' => $json]);

        return response()->json(['ok' => true]);
    }

    public function destroy(Request $request, string $key): JsonResponse
    {
        abort_unless(in_array($key, config('occ.document_keys'), true), 404);
        $request->user()->documents()->where('key', $key)->delete();

        return response()->json(['ok' => true]);
    }
}
