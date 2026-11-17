<?php

namespace App\Http\Controllers;

use App\Support\PrivateMedia;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * Serves the signed-in person's OWN profile picture from the private disk
 * (GET /api/me/photo). Access is the session cookie: there is no link to share, and
 * nobody can ask for another account's file because no filename is taken from the URL.
 */
class MediaController extends Controller
{
    private const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];

    public function mine(Request $request)
    {
        $user = $request->user();

        // 1) The database copy (survives redeploys).
        $row = $user->photo;
        if ($row && in_array($row->mime, self::IMAGE_MIME, true) && ($bytes = $row->bytes()) !== '') {
            return $this->image($bytes, $row->mime);
        }

        // 2) Old accounts: the file is still on disk. Serve it AND copy it into the database,
        //    so the next redeploy cannot take it away.
        $parts = PrivateMedia::split($user->profile_photo);
        abort_unless($parts, 404);

        $disk = Storage::disk(PrivateMedia::DISK);
        $path = "{$parts[0]}/{$parts[1]}";

        if (! $disk->exists($path)) {
            return $this->notFound('missing-file');
        }

        $full = $disk->path($path);

        // Sniff the real file CONTENT, never the extension.
        $mime = false;
        if (function_exists('finfo_open') && ($finfo = finfo_open(FILEINFO_MIME_TYPE))) {
            $mime = finfo_file($finfo, $full);
        }
        if (! in_array($mime, self::IMAGE_MIME, true)) {
            $info = @getimagesize($full);
            $mime = $info['mime'] ?? false;
        }
        if (! in_array($mime, self::IMAGE_MIME, true)) {
            return $this->notFound('not-an-image');
        }

        $bytes = (string) @file_get_contents($full);
        if ($bytes !== '' && strlen($bytes) < 6_000_000) {
            try {
                \App\Models\UserPhoto::updateOrCreate(['user_id' => $user->id], ['mime' => $mime, 'data' => base64_encode($bytes)]);
            } catch (\Throwable) {
                // Backfill is best-effort; the response below still works.
            }
        }

        return $this->image($bytes, $mime);
    }

    private function image(string $bytes, string $mime)
    {
        return response($bytes, 200, [
            'Content-Type' => $mime,
            'Content-Length' => (string) strlen($bytes),
            'Content-Disposition' => 'inline',
            'X-Content-Type-Options' => 'nosniff',
            // Private: never stored by a shared cache / proxy. The ?v= value changes with every
            // new upload (the stored filename is random), so the browser may keep it for a year.
            'Cache-Control' => 'private, max-age=31536000, immutable',
            'Vary' => 'Cookie',
        ]);
    }

    private function notFound(string $reason)
    {
        return response('media-'.$reason, 404, [
            'Content-Type' => 'text/plain; charset=utf-8',
            'X-Media-Reason' => $reason,
            'Cache-Control' => 'no-store',
        ]);
    }
}
