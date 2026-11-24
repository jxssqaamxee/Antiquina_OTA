<?php

namespace App\Support;

use App\Models\User;
use App\Models\UserPhoto;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * Saves a profile picture on the private disk as a small, upright JPEG.
 *
 * Phones upload 12 MP+ photos (up to 5 MB). Stored as-is, every avatar the app
 * draws has to decode the full image, which iOS Safari handles badly. An avatar
 * never needs more than ~640 px.
 *
 * A file GD cannot decode is REJECTED (422), never stored as-is: the picture is always re-encoded here, which
 * also drops EXIF / GPS and any bytes hidden after the image data. The stored extension is always .jpg.
 */
class ProfilePhotoStorage
{
    public const MAX_SIDE = 640;
    public const DIRECTORY = 'profile-pictures';

    /** JPEG bytes of the upload, or a 422 on the given form field when it is not a readable picture. */
    public static function reencode(UploadedFile $file, string $field = 'photo'): string
    {
        $bytes = self::shrink((string) $file->getRealPath());
        if ($bytes === null) {
            throw ValidationException::withMessages([$field => 'That picture could not be read. Use a different JPG, PNG or WebP photo.']);
        }

        return $bytes;
    }

    /** Stores the upload and returns the path, e.g. "profile-pictures/abc.jpg". */
    public static function store(UploadedFile $file, string $field = 'photo'): string
    {
        $path = self::DIRECTORY.'/'.bin2hex(random_bytes(20)).'.jpg';
        Storage::disk(PrivateMedia::DISK)->put($path, self::reencode($file, $field));

        return $path;
    }

    /**
     * Saves the photo for a user: in the DATABASE (authoritative, survives redeploys) and, as a
     * best-effort extra copy, on the private disk. Replaces and cleans up any previous photo.
     */
    public static function save(User $user, UploadedFile $file, string $field = 'photo'): void
    {
        $old = $user->profile_photo;
        $bytes = self::reencode($file, $field);
        $mime = 'image/jpeg';
        $path = self::DIRECTORY.'/'.bin2hex(random_bytes(20)).'.jpg';

        // Both writes or neither: the stored picture and the pointer to it can never disagree.
        DB::transaction(function () use ($user, $mime, $bytes, $path) {
            UserPhoto::updateOrCreate(['user_id' => $user->id], ['mime' => $mime, 'data' => base64_encode($bytes)]);
            $user->update(['profile_photo' => $path]);
        });

        try {
            Storage::disk(PrivateMedia::DISK)->put($path, $bytes);
        } catch (\Throwable) {
            // The database copy is the real one; a read-only disk must not fail the upload.
        }
        if ($old && $old !== $path) {
            self::delete($old);
        }
    }

    /** Removes the user's photo everywhere (database + disk). */
    public static function clear(User $user): void
    {
        $old = $user->profile_photo;
        UserPhoto::where('user_id', $user->id)->delete();
        $user->update(['profile_photo' => null]);
        self::delete($old);
    }

    /** Deletes a stored photo. Only paths inside the profile-pictures folder are touched. */
    public static function delete(?string $path): void
    {
        if ($path && PrivateMedia::split($path)) {
            Storage::disk(PrivateMedia::DISK)->delete($path);
        }
    }

    /** JPEG bytes of the picture scaled to MAX_SIDE and rotated upright, or null. */
    public static function shrink(string $path): ?string
    {
        if ($path === '' || ! is_file($path) || ! function_exists('imagecreatefromstring')) {
            return null;
        }
        $info = @getimagesize($path);
        if (! $info || ($info[0] * $info[1]) > 40_000_000) {
            return null;
        }
        $raw = @file_get_contents($path);
        $img = $raw === false ? false : @imagecreatefromstring($raw);
        if (! $img) {
            return null;
        }

        // Phones store sideways pictures with an EXIF flag; GD ignores it.
        if ($info[2] === IMAGETYPE_JPEG && function_exists('exif_read_data')) {
            $exif = @exif_read_data($path);
            $angle = match ((int) ($exif['Orientation'] ?? 1)) {
                3 => 180, 6 => -90, 8 => 90, default => 0,
            };
            if ($angle !== 0 && ($rot = imagerotate($img, $angle, 0xFFFFFF))) {
                $img = $rot;
            }
        }

        $w = imagesx($img);
        $h = imagesy($img);
        if (max($w, $h) > self::MAX_SIDE) {
            $nw = $w >= $h ? self::MAX_SIDE : (int) round($w * self::MAX_SIDE / $h);
            $nh = $w >= $h ? (int) round($h * self::MAX_SIDE / $w) : self::MAX_SIDE;
            if ($s = imagescale($img, $nw, $nh, IMG_BICUBIC)) {
                $img = $s;
            }
        }

        // Flatten transparency onto white (PNG/WebP) before saving as JPEG.
        $flat = imagecreatetruecolor(imagesx($img), imagesy($img));
        imagefill($flat, 0, 0, 0xFFFFFF);
        imagecopy($flat, $img, 0, 0, 0, 0, imagesx($img), imagesy($img));

        ob_start();
        imagejpeg($flat, null, 85);
        $bytes = ob_get_clean();

        return $bytes === false || $bytes === '' ? null : $bytes;
    }
}
