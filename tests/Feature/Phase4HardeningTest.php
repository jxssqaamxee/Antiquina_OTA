<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Course;
use App\Models\Section;
use App\Models\StudentEnrollment;
use App\Models\User;
use App\Models\UserPhoto;
use App\Services\Academic\AcademicSeeder;
use App\Services\Roster\RosterFileReader;
use App\Services\Roster\RosterReadException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;
use ZipArchive;

/** Phase 4: password throttle (F6), login timing (F5), XML (F7), PDF/photo (F12), progression (F10), FKs (F12). */
class Phase4HardeningTest extends TestCase
{
    use RefreshDatabase;

    // ------------------------------------------------------------------ F6
    public function test_password_change_is_throttled_after_repeated_wrong_guesses(): void
    {
        $u = User::factory()->create(['email_verified_at' => now()]);
        $codes = [];
        for ($i = 0; $i < 9; $i++) {
            $codes[] = $this->signedIn($u)->putJson('/api/profile/password', [
                'current_password' => 'wrong-guess-'.$i, 'password' => 'N3w-Str0ng!Pass#9', 'password_confirmation' => 'N3w-Str0ng!Pass#9',
            ])->getStatusCode();
        }
        $this->assertContains(429, $codes, 'no 429 after 9 wrong guesses: '.implode(',', $codes));
        $this->assertSame(422, $codes[0]);
    }

    // ------------------------------------------------------------------ F5
    public function test_unknown_ids_still_run_a_password_hash_check_on_both_logins(): void
    {
        $counter = new class(['rounds' => 4]) extends \Illuminate\Hashing\BcryptHasher {
            public int $n = 0;
            public function check($value, $hashedValue, array $options = []): bool
            {
                $this->n++;

                return parent::check($value, $hashedValue, $options);
            }
        };
        Hash::swap(new class(app(), $counter) extends \Illuminate\Hashing\HashManager {
            public function __construct($app, private $c) { parent::__construct($app); }
            public function driver($driver = null) { return $this->c; }
            public function check($value, $hashedValue, array $options = []): bool { return $this->c->check($value, $hashedValue, $options); }
            public function make($value, array $options = []): string { return $this->c->make($value, $options); }
        });

        $this->postJson('/api/auth/login', ['student_id' => '2099-9-99999', 'password' => 'whatever12'])->assertStatus(422);
        $this->assertSame(1, $counter->n, 'trainee login: no hash check for unknown id');

        $this->postJson('/api/auth/administrator', ['admin_id' => 'NOPE-1', 'password' => 'whatever12'])->assertStatus(422);
        $this->assertSame(2, $counter->n, 'admin login: no hash check for unknown id');

        // A real account with no password set behaves the same way.
        User::factory()->create(['student_id' => '2024-1-00077', 'password' => null]);
        $this->postJson('/api/auth/login', ['student_id' => '2024-1-00077', 'password' => 'whatever12'])->assertStatus(422);
        $this->assertSame(3, $counter->n);
    }

    public function test_unknown_and_wrong_password_answers_are_identical(): void
    {
        User::factory()->create(['student_id' => '2024-1-00078']);
        $a = $this->postJson('/api/auth/login', ['student_id' => '2024-1-00078', 'password' => 'wrongwrong1']);
        $b = $this->postJson('/api/auth/login', ['student_id' => '2099-9-99998', 'password' => 'wrongwrong1']);
        $this->assertSame($a->getStatusCode(), $b->getStatusCode());
        $this->assertSame($a->json('errors'), $b->json('errors'));
    }

    // ------------------------------------------------------------------ F7
    private function xlsxWithSharedStrings(string $sharedBytes): string
    {
        $path = tempnam(sys_get_temp_dir(), 'x4');
        $zip = new ZipArchive();
        $zip->open($path, ZipArchive::OVERWRITE);
        $zip->addFromString('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
        $zip->addFromString('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>');
        $zip->addFromString('xl/sharedStrings.xml', $sharedBytes);
        $zip->addFromString('xl/worksheets/sheet1.xml', '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>');
        $zip->close();

        return $path;
    }

    public static function xmlPayloads(): array
    {
        $body = '<!DOCTYPE sst [<!ENTITY a "2021-2-00101">]><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>&a;</t></si></sst>';
        $doctypeOnly = '<!DOCTYPE sst><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>2021-2-00101</t></si></sst>';
        $u16 = fn (string $s, string $enc) => mb_convert_encoding($s, $enc, 'UTF-8');

        return [
            'utf8 entity' => ['<?xml version="1.0"?>'.$body],
            'utf8 doctype only' => ['<?xml version="1.0"?>'.$doctypeOnly],
            'lowercase doctype' => ['<?xml version="1.0"?>'.strtolower($doctypeOnly)],
            'utf16le bom' => ["\xFF\xFE".$u16('<?xml version="1.0" encoding="UTF-16"?>'.$body, 'UTF-16LE')],
            'utf16be bom' => ["\xFE\xFF".$u16('<?xml version="1.0" encoding="UTF-16"?>'.$body, 'UTF-16BE')],
            'utf16le no bom' => [$u16('<?xml version="1.0" encoding="UTF-16LE"?>'.$body, 'UTF-16LE')],
            'utf16be no bom' => [$u16('<?xml version="1.0" encoding="UTF-16BE"?>'.$body, 'UTF-16BE')],
            'utf8 bom' => ["\xEF\xBB\xBF".'<?xml version="1.0"?>'.$body],
            'utf7' => ['<?xml version="1.0" encoding="UTF-7"?>+ADwAIQ-DOCTYPE sst+AD4-<sst/>'],
        ];
    }

    /** @dataProvider xmlPayloads */
    #[\PHPUnit\Framework\Attributes\DataProvider('xmlPayloads')]
    public function test_doctype_and_entities_are_refused_in_every_encoding(string $xml): void
    {
        $path = $this->xlsxWithSharedStrings($xml);
        try {
            (new RosterFileReader())->records($path, 'r.xlsx');
            $this->fail('payload was accepted');
        } catch (RosterReadException $e) {
            $this->assertStringContainsString('unsafe', $e->getMessage());
        } finally {
            @unlink($path);
        }
    }

    public function test_plain_utf8_and_utf16_xml_without_a_doctype_still_read(): void
    {
        $xml = '<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>2021-2-00101</t></si></sst>';
        $u16 = "\xFF\xFE".mb_convert_encoding(str_replace('UTF-8', 'UTF-16', $xml), 'UTF-16LE', 'UTF-8');
        foreach ([$xml, "\xEF\xBB\xBF".$xml, $u16] as $bytes) {
            $path = $this->xlsxWithSharedStrings($bytes);
            $this->assertSame(['2021-2-00101'], (new RosterFileReader())->records($path, 'r.xlsx'));
            @unlink($path);
        }
    }

    // ------------------------------------------------------------------ F12 pdf
    public function test_pdftotext_is_killed_after_the_timeout_and_big_pdfs_are_refused(): void
    {
        $script = tempnam(sys_get_temp_dir(), 'fakepdf');
        file_put_contents($script, "#!/bin/sh\nsleep 30\n");
        chmod($script, 0755);
        $pdf = tempnam(sys_get_temp_dir(), 'p4').'.pdf';
        file_put_contents($pdf, "%PDF-1.4\n".str_repeat('x', 200));

        $reader = new class($script) extends RosterFileReader {
            public function __construct(private string $fake) {}
            protected function pdftotextBinary(): ?string { return $this->fake; }
            protected function pdfTimeoutSeconds(): float { return 1.0; }
        };
        $t = microtime(true);
        try {
            $reader->records($pdf, 'a.pdf');
            $this->fail('should not read anything');
        } catch (RosterReadException $e) {
            $this->assertLessThan(6, microtime(true) - $t, 'pdftotext was not stopped by the timeout');
        }

        $small = new class extends RosterFileReader {
            protected function pdfMaxBytes(): int { return 100; }
        };
        try {
            $small->records($pdf, 'a.pdf');
            $this->fail('oversized pdf accepted');
        } catch (RosterReadException $e) {
            $this->assertStringContainsString('too large', $e->getMessage());
        }
        @unlink($script);
        @unlink($pdf);
    }

    // ------------------------------------------------------------------ F12 photo
    public function test_undecodable_image_is_rejected_not_stored_raw(): void
    {
        $u = User::factory()->create(['email_verified_at' => now()]);
        // Valid PNG signature + IHDR-looking junk: passes the mime sniff, cannot be decoded by GD.
        $junk = "\x89PNG\r\n\x1a\n".str_repeat("\x00", 64).'<?php echo 1;';
        $res = $this->signedIn($u)->post('/api/profile/photo', ['photo' => UploadedFile::fake()->createWithContent('me.png', $junk)], ['Accept' => 'application/json']);
        $res->assertStatus(422);
        $this->assertSame(0, UserPhoto::where('user_id', $u->id)->count());
        $this->assertNull($u->fresh()->profile_photo);
    }

    public function test_accepted_photo_is_reencoded_as_jpeg_and_metadata_is_stripped(): void
    {
        $u = User::factory()->create(['email_verified_at' => now()]);
        $im = imagecreatetruecolor(50, 50);
        ob_start(); imagejpeg($im); $jpg = (string) ob_get_clean();
        $exif = "Exif\0\0SECRETGPS-12.3456N";
        $jpg = substr($jpg, 0, 2)."\xFF\xE1".pack('n', strlen($exif) + 2).$exif.substr($jpg, 2);

        $this->signedIn($u)->post('/api/profile/photo', ['photo' => UploadedFile::fake()->createWithContent('me.jpg', $jpg)], ['Accept' => 'application/json'])->assertOk();
        $stored = base64_decode((string) UserPhoto::where('user_id', $u->id)->value('data'));
        $this->assertStringNotContainsString('SECRETGPS', $stored);
        $this->assertSame('image/jpeg', UserPhoto::where('user_id', $u->id)->value('mime'));
        $this->assertStringEndsWith('.jpg', (string) $u->fresh()->profile_photo);
    }

    // ------------------------------------------------------------------ F10
    private function progressionSetup(): array
    {
        AcademicSeeder::run();
        $old = AcademicYear::current();
        $new = AcademicYear::create(['name' => '2098-2099']);
        $admin = User::factory()->create(['role' => 'admin', 'admin_id' => 'ADMIN-P4', 'student_id' => null, 'course' => null, 'email_verified_at' => now()]);

        return [$old, $new, $admin];
    }

    private function sec(AcademicYear $y, int $level, string $label = 'A'): Section
    {
        return Section::create(['course_id' => Course::where('code', 'BSIT')->value('id'), 'academic_year_id' => $y->id, 'year_level' => $level, 'label' => $label]);
    }

    private function enrol(string $sid, Section $s, string $status = 'active', ?int $level = null): StudentEnrollment
    {
        $u = User::factory()->create(['student_id' => $sid, 'email_verified_at' => now()]);

        return $u->enrollments()->create(['course_id' => $s->course_id, 'academic_year_id' => $s->academic_year_id, 'section_id' => $s->id, 'year_level' => $level ?? $s->year_level, 'status' => $status]);
    }

    public function test_confirm_refuses_tampered_items_that_prepare_would_never_list(): void
    {
        [$old, $new, $admin] = $this->progressionSetup();
        $url = "/api/admin/academic-years/{$new->id}/progression/confirm";
        $dest2 = $this->sec($new, 2);

        // (a) already in the target year
        $inTarget = $this->enrol('2024-1-10001', $this->sec($new, 1, 'B'));
        // (b) waiting for placement
        $waiting = $this->enrol('2024-1-10002', $this->sec($old, 1, 'C'), 'pending_placement');
        // (c) first-year student pushed through as "complete"
        $first = $this->enrol('2024-1-10003', $this->sec($old, 1, 'D'));
        // (d) no year level
        $noLevel = $this->enrol('2024-1-10004', $this->sec($old, 1, 'E'));
        $noLevel->update(['year_level' => null]);

        $cases = [
            [$inTarget, ['kind' => 'promote', 'section_id' => $dest2->id]],
            [$waiting, ['kind' => 'promote', 'section_id' => $dest2->id]],
            [$first, ['kind' => 'complete']],
            [$noLevel, ['kind' => 'repeat', 'section_id' => $dest2->id]],
        ];
        foreach ($cases as $i => [$e, $item]) {
            $this->signedIn($admin)->postJson($url, ['items' => [['enrollment_id' => $e->id] + $item]])
                ->assertStatus(422, "case $i was accepted");
            $this->assertNull($e->fresh()->ended_at, "case $i changed the enrollment");
        }
        $this->assertSame(0, DB::table('enrollment_progressions')->count());
    }

    public function test_one_bad_item_rolls_back_the_good_ones(): void
    {
        [$old, $new, $admin] = $this->progressionSetup();
        $good = $this->enrol('2024-1-10010', $this->sec($old, 1));
        $bad = $this->enrol('2024-1-10011', $this->sec($old, 1, 'B'));
        $dest = $this->sec($new, 2);
        $this->signedIn($admin)->postJson("/api/admin/academic-years/{$new->id}/progression/confirm", ['items' => [
            ['enrollment_id' => $good->id, 'kind' => 'promote', 'section_id' => $dest->id],
            ['enrollment_id' => $bad->id, 'kind' => 'complete'],
        ]])->assertStatus(422);
        $this->assertNull($good->fresh()->ended_at);
    }

    // ------------------------------------------------------------------ F12 foreign keys
    private function fkMigration(): object
    {
        return require base_path('database/migrations/2026_12_06_000000_add_foreign_keys_to_enrolled_students.php');
    }

    public function test_enrolled_students_rejects_orphan_course_and_section_ids(): void
    {
        $this->expectException(\Illuminate\Database\QueryException::class);
        DB::table('enrolled_students')->insert(['student_id' => '2024-1-55555', 'course_id' => 99999, 'section_id' => null, 'created_at' => now(), 'updated_at' => now()]);
    }

    public function test_fk_migration_refuses_dirty_data_and_changes_nothing_then_passes_when_clean(): void
    {
        $names = fn () => collect(Schema::getForeignKeys('enrolled_students'))->flatMap(fn ($fk) => $fk['columns'])->sort()->values()->all();
        $this->assertContains('course_id', $names());
        $this->assertContains('section_id', $names());

        // An old install: same table, no foreign keys, and a row pointing at a course / section that is gone.
        Schema::drop('enrolled_students');
        Schema::create('enrolled_students', function ($t) {
            $t->id();
            $t->string('student_id', 12)->unique();
            $t->unsignedBigInteger('course_id')->nullable();
            $t->unsignedTinyInteger('year_level')->nullable();
            $t->unsignedBigInteger('section_id')->nullable();
            $t->timestamps();
        });
        DB::table('enrolled_students')->insert(['student_id' => '2024-1-55556', 'course_id' => 99999, 'section_id' => 88888, 'created_at' => now(), 'updated_at' => now()]);

        $m = $this->fkMigration();
        try {
            $m->up();
            $this->fail('migration ran over orphan rows');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('2024-1-55556', $e->getMessage());
        }
        $this->assertSame(1, DB::table('enrolled_students')->count(), 'migration touched the data');
        $this->assertSame([], $names(), 'migration added keys despite dirty data');

        DB::table('enrolled_students')->delete();
        $m->up();
        $this->assertContains('course_id', $names());
        $this->assertContains('section_id', $names());
        $m->up(); // running it twice is harmless
    }
}
