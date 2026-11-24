<?php

namespace App\Support;

/**
 * Profile photos live on the PRIVATE disk (storage/app/private), not the public one,
 * so they cannot be opened by guessing a /storage/... address.
 *
 * They are served only by GET /api/me/photo, and only to the signed-in owner's session.
 * There are no signed / shareable links: a copied URL is useless without the session cookie.
 * The `v` query value only changes when the photo changes, so the browser can cache it.
 */
class PrivateMedia
{
    /** Private disk (storage/app/private). */
    public const DISK = 'local';

    /** Only these folders can ever be served. */
    public const DIRECTORIES = ['profile-pictures'];

    /**
     * Cache-buster for a stored photo. Every upload gets a new random file name, so this value changes
     * exactly when the picture changes. Anything that serves a photo with a long browser cache
     * (see MediaController::image) MUST put this in its address, or a replaced photo would never refresh.
     */
    public static function version(?string $path): ?string
    {
        return self::split($path) ? substr(sha1((string) $path), 0, 16) : null;
    }

    /** URL the app puts in <img src> for the OWNER's stored path, or null. */
    public static function url(?string $path): ?string
    {
        $v = self::version($path);

        return $v ? '/api/me/photo?v='.$v : null;
    }

    /**
     * URL for the OWNER's photo, or null when there is none OR the file is gone from disk
     * (e.g. storage/ was not copied with the database). A dead URL would make every avatar
     * request 404 on every screen; null makes the app show initials straight away.
     */
    public static function urlIfExists(?string $path): ?string
    {
        $parts = self::split($path);
        if (! $parts) {
            return null;
        }

        try {
            if (! \Illuminate\Support\Facades\Storage::disk(self::DISK)->exists($parts[0].'/'.$parts[1])) {
                return null;
            }
        } catch (\Throwable) {
            return null;
        }

        return self::url($path);
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
