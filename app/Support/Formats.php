<?php

namespace App\Support;

use Illuminate\Support\Str;

/**
 * Field formats shared by every form request, in one place. The React side
 * mirrors them in resources/js/utils/validators.js — change both together.
 * (Same rules as sclf_APP: Student ID, school e-mail and name formats.)
 */
final class Formats
{
    /** School student IDs: YYYY-N-NNNNN, e.g. 2021-2-04062. */
    public const STUDENT_ID = '/^\d{4}-\d-\d{5}$/';

    /** Admin (Admin / Coordinator) sign-in ID, e.g. ADMIN-001 or COORD-BSIT-4A. Stored upper-case. */
    public const ADMIN_ID = '/^[A-Z0-9][A-Z0-9\-_.]{2,31}$/';

    /** Letters, spaces, hyphens and apostrophes only; must start with a letter. */
    public const NAME = '/^[\pL][\pL\s\'\-]*$/u';

    /** Institutional e-mail: occ.lastname.firstname@gmail.com (digits after the first name optional). */
    public const SCHOOL_EMAIL = '/^occ\.[a-z]+\.[a-z]+\d{0,6}@gmail\.com$/i';

    /** Any Gmail address (loose check used where the exact school format is not needed). */
    public const GMAIL = '/^[A-Za-z0-9._%+\-]+@gmail\.com$/i';

    /** "De la Cruz" -> "delacruz", "Peña-Reyes" -> "penareyes": a name as it appears inside the e-mail. */
    public static function emailNameSegment(string $name): string
    {
        return preg_replace('/[^a-z]/', '', strtolower(Str::ascii($name))) ?? '';
    }

    /** Trim and collapse inner whitespace; returns null for an empty result. */
    public static function squish(mixed $value): ?string
    {
        $v = trim((string) preg_replace('/\s+/u', ' ', (string) $value));

        return $v === '' ? null : $v;
    }

    /** "juan  dela cruz" -> "Juan Dela Cruz" */
    public static function titleCase(string $value): string
    {
        return mb_convert_case(self::squish($value) ?? '', MB_CASE_TITLE, 'UTF-8');
    }

    /** @return list<string> every course in config/occ.php */
    public static function courses(): array
    {
        return collect(config('occ.courses'))->pluck('courses')->flatten()->all();
    }
}
