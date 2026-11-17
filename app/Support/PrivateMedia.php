<?php

namespace App\Support;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\URL;

/**
 * Profile photos live on the PRIVATE disk (storage/app/private), not the public
 * one, so they cannot be opened by guessing a /storage/... address.
 *
 * The API returns a plain `picture` URL so <img src> keeps working. That URL is a
 * SIGNED, relative link to GET /media/{dir}/{file}: it only works while the
 * signature is valid and any edit to it is rejected.
 *
 * The expiry is rounded to a time bucket (occ.media.url_ttl_hours, default 24 h),
 * so the same photo gets the SAME URL for hours and the browser can cache it.
 * A URL is valid for between one and two buckets; /api/me always hands out a fresh one.
 */
class PrivateMedia
{
    /** Private disk (storage/app/private). */
    public const DISK = 'local';

    /** Only these folders can ever be served through /media. */
    public const DIRECTORIES = ['profile-pictures'];

    public static function bucketSeconds(): int
    {
        return max(1, (int) config('occ.media.url_ttl_hours', 24)) * 3600;
    }

    /** Signed relative URL for a stored path such as "profile-pictures/x.jpg", or null. */
    public static function url(?string $path): ?string
    {
        $parts = self::split($path);
        if (! $parts) {
            return null;
        }

        $bucket = self::bucketSeconds();
        $expires = (intdiv(now()->getTimestamp(), $bucket) + 2) * $bucket;

        // Must be a date object: a bare int would be read as "seconds from now".
        return URL::temporarySignedRoute(
            'media.show',
            Carbon::createFromTimestamp($expires),
            ['dir' => $parts[0], 'file' => $parts[1]],
            absolute: false,
        );
    }

    /** @return array{0:string,1:string}|null [directory, filename] when servable */
    public static function split(?string $path): ?array
    {
        if (! $path || ! str_contains($path, '/')) {
            return null;
        }

        [$dir, $file] = explode('/', $path, 2);

        return self::isServable($dir, $file) ? [$dir, $file] : null;
    }

    public static function isServable(string $dir, string $file): bool
    {
        return in_array($dir, self::DIRECTORIES, true)
            && preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]*$/', $file) === 1
            && ! str_contains($file, '..');
    }
}
