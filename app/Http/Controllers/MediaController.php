<?php

namespace App\Http\Controllers;

use App\Support\PrivateMedia;
use Illuminate\Support\Facades\Storage;

/**
 * Serves profile pictures from the private disk.
 *
 * No login is needed here because an <img> tag cannot send the bearer token;
 * the `signed:relative` middleware on the route is the access check (see
 * PrivateMedia for how links are made and how long they last).
 */
class MediaController extends Controller
{
    private const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];

    public function show(string $dir, string $file)
    {
        abort_unless(PrivateMedia::isServable($dir, $file), 404);

        $disk = Storage::disk(PrivateMedia::DISK);
        $path = "{$dir}/{$file}";

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

        return $disk->response($path, $file, [
            'Content-Type' => $mime,
            'Content-Disposition' => 'inline',
            'X-Content-Type-Options' => 'nosniff',
            // Per-browser cache only; the URL changes when the signature bucket rolls over.
            'Cache-Control' => 'private, max-age='.min(PrivateMedia::bucketSeconds(), 86400),
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
