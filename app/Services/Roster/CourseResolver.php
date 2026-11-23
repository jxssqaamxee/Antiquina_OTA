<?php

namespace App\Services\Roster;

use App\Models\Course;

/**
 * Turns the free text next to a Student ID ("CIT bsit", "BSIT", "Bachelor of Science in Information
 * Technology", "BSBA - Marketing", ...) into one Course. Never guesses: two different courses, or only
 * "BSBA" (Marketing OR Financial), is reported as ambiguous instead of picking one.
 */
class CourseResolver
{
    public const FOUND = 'found';
    public const NONE = 'none';
    public const AMBIGUOUS = 'ambiguous';

    /** course code => patterns tested against the normalised text (lower case, letters/digits/spaces). */
    private const SPECIFIC = [
        'BSIT' => ['/\bbsit\b/', '/\binformation technology\b/', '/\bb s i t\b/'],
        'BEED' => ['/\bbeed\b/', '/\belementary education\b/'],
        'BSED' => ['/\bbsed\b/', '/\bsecondary education\b/'],
        'BSBA-MM' => ['/\bbsba\s*mm\b/', '/\bmarketing\b/'],
        'BSBA-FM' => ['/\bbsba\s*fm\b/', '/\bfinancial\b/', '/\bfinance\b/'],
    ];

    /** A college code alone names a course only when that college has exactly one (CIT -> BSIT). */
    private const COLLEGE = ['cit' => 'BSIT'];

    /** Text that names a course family but not which one. */
    private const FAMILY = ['/\bbsba\b/', '/\bbusiness administration\b/', '/\bcte\b/', '/\bcba\b/'];

    /** @var array<string,Course>|null */
    private ?array $byCode = null;

    /** @return array{status:string, course:?Course} */
    public function resolve(string $text): array
    {
        $t = $this->normalise($text);
        if ($t === '') {
            return ['status' => self::NONE, 'course' => null];
        }

        $codes = [];
        foreach (self::SPECIFIC as $code => $patterns) {
            foreach ($patterns as $p) {
                if (preg_match($p, $t)) {
                    $codes[$code] = true;
                    break;
                }
            }
        }
        if (! $codes) {
            foreach (self::COLLEGE as $college => $code) {
                if (preg_match('/\b'.$college.'\b/', $t)) {
                    $codes[$code] = true;
                }
            }
        }

        if (count($codes) === 1) {
            $course = $this->courses()[array_key_first($codes)] ?? null;

            return $course ? ['status' => self::FOUND, 'course' => $course] : ['status' => self::NONE, 'course' => null];
        }
        if (count($codes) > 1) {
            return ['status' => self::AMBIGUOUS, 'course' => null];
        }
        foreach (self::FAMILY as $p) {
            if (preg_match($p, $t)) {
                return ['status' => self::AMBIGUOUS, 'course' => null];
            }
        }

        return ['status' => self::NONE, 'course' => null];
    }

    private function normalise(string $text): string
    {
        $t = mb_strtolower($text, 'UTF-8');
        $t = preg_replace('/[^a-z0-9]+/', ' ', $t) ?? '';

        return trim($t);
    }

    /** @return array<string,Course> */
    private function courses(): array
    {
        return $this->byCode ??= Course::all()->keyBy('code')->all();
    }
}
