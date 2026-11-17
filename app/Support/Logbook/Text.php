<?php

namespace App\Support\Logbook;

/** Safe text input: every free-text value goes through here before it touches the database. */
final class Text
{
    /** Single-line text: control characters removed, whitespace collapsed, trimmed. */
    public static function line(mixed $value, int $max): string
    {
        if (! is_string($value) && ! is_numeric($value)) {
            return '';
        }
        $s = (string) $value;
        $s = preg_replace('/[\p{Cc}\p{Cf}]+/u', ' ', $s) ?? '';       // control + invisible format chars
        $s = preg_replace('/\s+/u', ' ', $s) ?? '';
        $s = trim($s);

        return mb_substr($s, 0, $max);
    }

    /** Free text (task descriptions): keeps line breaks, drops other control characters, trimmed, cut at $max. */
    public static function block(mixed $value, int $max): string
    {
        if (! is_string($value) && ! is_numeric($value)) {
            return '';
        }
        $s = str_replace(["\r\n", "\r"], "\n", (string) $value);
        $s = preg_replace('/[^\P{Cc}\n]+/u', '', $s) ?? '';           // strip control chars except \n
        $s = preg_replace('/\p{Cf}+/u', '', $s) ?? '';
        $s = preg_replace('/\n{3,}/', "\n\n", $s) ?? '';

        return mb_substr(trim($s), 0, $max);
    }

    /** Person name on the logbook header: letters, spaces, dots, hyphens, apostrophes (same filter as the app). */
    public static function personName(mixed $value, int $max): string
    {
        $s = self::line($value, $max * 2);
        $s = preg_replace('/[^\p{L}\s.\'-]/u', '', $s) ?? '';

        return mb_substr(trim(preg_replace('/\s+/u', ' ', $s) ?? ''), 0, $max);
    }
}
