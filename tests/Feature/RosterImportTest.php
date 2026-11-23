<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Course;
use App\Models\Section;
use App\Models\User;
use App\Services\Academic\AcademicSeeder;
use App\Services\Academic\CoordinatorAssignmentService;
use App\Services\Roster\CourseResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;
use ZipArchive;

/** Coordinator roster import (Student ID + course, any file type) and the registration check that uses it. */
class RosterImportTest extends TestCase
{
    use RefreshDatabase;

    private Section $a;
    private Section $b;
    private User $coordA;
    private User $coordB;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        AcademicSeeder::run();
        $bsit = Course::where('code', 'BSIT')->value('id');
        $year = AcademicYear::current()->id;
        $this->a = Section::create(['course_id' => $bsit, 'academic_year_id' => $year, 'year_level' => 4, 'label' => 'A']);
        $this->b = Section::create(['course_id' => $bsit, 'academic_year_id' => $year, 'year_level' => 4, 'label' => 'B']);
        $this->admin = $this->staff('admin', 'ADMIN-001');
        $this->coordA = $this->staff('coordinator', 'COORD-4A');
        $this->coordB = $this->staff('coordinator', 'COORD-4B');
        $svc = app(CoordinatorAssignmentService::class);
        $svc->assign($this->admin, $this->coordA, $this->a);
        $svc->assign($this->admin, $this->coordB, $this->b);
    }

    private function staff(string $role, string $id): User
    {
        return User::factory()->create(['role' => $role, 'admin_id' => $id, 'student_id' => null, 'course' => null, 'email_verified_at' => now()]);
    }

    private function upload(User $who, string $name, string $content, array $extra = [], string $prefix = 'coordinator')
    {
        return $this->signedIn($who)->post("/api/{$prefix}/roster/import", ['file' => UploadedFile::fake()->createWithContent($name, $content)] + $extra, ['Accept' => 'application/json']);
    }

    private function onRoster(string $id): ?object
    {
        return DB::table('enrolled_students')->where('student_id', $id)->first();
    }

    /** Builds a tiny .xlsx / .docx in memory (zip + XML), the same structure Excel / Word write. */
    private function zipFile(array $parts): string
    {
        $path = tempnam(sys_get_temp_dir(), 'rz');
        $zip = new ZipArchive();
        $zip->open($path, ZipArchive::OVERWRITE);
        foreach ($parts as $name => $xml) {
            $zip->addFromString($name, $xml);
        }
        $zip->close();
        $bin = (string) file_get_contents($path);
        unlink($path);

        return $bin;
    }

    public function test_coordinator_imports_student_id_and_course_into_own_section(): void
    {
        $csv = "Student ID,College,Course,Name\n2021-2-04062,CIT,BSIT,Juan Dela Cruz\n2021-2-04063,CIT bsit,,Maria Reyes\n";
        $r = $this->upload($this->coordA, 'list.csv', $csv)->assertOk();

        $this->assertSame(2, $r->json('counts.added'));
        $row = $this->onRoster('2021-2-04062');
        $this->assertSame($this->a->id, (int) $row->section_id);
        $this->assertSame($this->a->course_id, (int) $row->course_id);
        $this->assertSame(4, (int) $row->year_level);
        $this->assertSame($this->coordA->id, (int) $row->imported_by);
        $this->assertSame('list.csv', $row->source_file);
        $this->assertNotNull($this->onRoster('2021-2-04063'));
        $this->assertDatabaseHas('activity_logs', ['action' => 'roster.imported', 'section_id' => $this->a->id]);
    }

    public function test_every_id_needs_a_course_and_it_must_be_the_sections_course(): void
    {
        $txt = implode("\n", [
            '2021-2-00001 BEED',            // other course -> wrong
            '2021-2-00002',                 // no course
            '2021-2-00003 BSBA',            // BSBA alone -> ambiguous
            '2021-2-00004 BSIT BSBA-MM',    // two courses -> ambiguous
            '2021-2-00005 CIT BSIT',        // ok
            'not an id 2021-22-1234 BSIT',  // malformed id is not read at all
        ]);
        $r = $this->upload($this->coordA, 'notes.txt', $txt)->assertOk();

        $status = collect($r->json('rows'))->pluck('status', 'student_id');
        $this->assertSame('wrong_course', $status['2021-2-00001']);
        $this->assertSame('no_course', $status['2021-2-00002']);
        $this->assertSame('ambiguous_course', $status['2021-2-00003']);
        $this->assertSame('ambiguous_course', $status['2021-2-00004']);
        $this->assertSame('added', $status['2021-2-00005']);
        $this->assertSame(1, DB::table('enrolled_students')->count());
        $this->assertSame(4, $r->json('counts.rejected'));
        $this->assertNotSame('added', $r->json('rows.0.status')); // rows that need attention are listed first
    }

    public function test_course_is_read_from_headings_and_from_cells_split_over_lines(): void
    {
        $txt = "ON-THE-JOB TRAINING LIST\nBSIT 4A\n2021-2-00010 Ana Lim\n2021-2-00011 Ben Co\n\n2021-2-00020\nCarla Uy\nBachelor of Science in Information Technology\n2021-2-00021\nDan Yu\nBeed\n";
        $r = $this->upload($this->coordA, 'class-list.txt', $txt)->assertOk();

        $rows = collect($r->json('rows'))->keyBy('student_id');
        $this->assertSame('heading', $rows['2021-2-00010']['course_from']);
        $this->assertSame('row', $rows['2021-2-00020']['course_from']);
        $this->assertSame('added', $rows['2021-2-00020']['status']);
        $this->assertSame('wrong_course', $rows['2021-2-00021']['status']); // its own line says BEED, not the heading
        $this->assertNotNull($this->onRoster('2021-2-00010'));
        $this->assertNull($this->onRoster('2021-2-00021'));
    }

    public function test_excel_word_json_html_and_rtf_files_are_read(): void
    {
        $xlsx = $this->zipFile([
            '[Content_Types].xml' => '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
            'xl/workbook.xml' => '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>',
            'xl/sharedStrings.xml' => '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>2021-2-00101</t></si><si><t>BSIT</t></si><si><r><t>2021-2-00102</t></r></si></sst>',
            'xl/worksheets/sheet1.xml' => '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
                .'<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'
                .'<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="inlineStr"><is><t>CIT BSIT</t></is></c></row></sheetData></worksheet>',
        ]);
        $docx = $this->zipFile([
            '[Content_Types].xml' => '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
            'word/document.xml' => '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
                .'<w:p><w:r><w:t>BSIT 4A</w:t></w:r></w:p>'
                .'<w:tbl><w:tr><w:tc><w:p><w:r><w:t>2021-2-00103</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Juan</w:t></w:r></w:p></w:tc></w:tr>'
                .'<w:tr><w:tc><w:p><w:r><w:t>2021-2-00104</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>BSIT</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>',
        ]);
        $json = json_encode(['students' => [['student_id' => '2021-2-00105', 'course' => 'BSIT'], ['student_id' => '2021-2-00106', 'course' => 'BSIT']]]);
        $html = '<table><tr><td>2021-2-00107</td><td>BSIT</td></tr><tr><td>2021-2-00108</td><td>Information Technology</td></tr></table>';
        $rtf = '{\rtf1\ansi {\b Roster}\par 2021-2-00109 \tab CIT BSIT\par 2021-2-00110 \tab BSIT\par}';

        foreach ([['a.xlsx', $xlsx, ['2021-2-00101', '2021-2-00102']], ['b.docx', $docx, ['2021-2-00103', '2021-2-00104']],
            ['c.json', $json, ['2021-2-00105', '2021-2-00106']], ['d.html', $html, ['2021-2-00107', '2021-2-00108']],
            ['e.rtf', $rtf, ['2021-2-00109', '2021-2-00110']]] as [$name, $content, $ids]) {
            $this->upload($this->coordA, $name, $content)->assertOk();
            foreach ($ids as $id) {
                $this->assertNotNull($this->onRoster($id), "{$id} from {$name} was not imported");
                $this->assertSame($this->a->id, (int) $this->onRoster($id)->section_id);
            }
        }
    }

    public function test_text_pdf_is_read(): void
    {
        $lines = ['2021-2-00201 BSIT', '2021-2-00202 CIT BSIT', '2021-2-00203 BEED'];
        $stream = "BT /F1 12 Tf 50 750 Td 16 TL\n".implode("\n", array_map(fn ($l) => "({$l}) Tj T*", $lines))."\nET";
        $objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
            '<< /Length '.strlen($stream)." >>\nstream\n{$stream}\nendstream", '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
        $pdf = "%PDF-1.4\n";
        $offsets = [];
        foreach ($objs as $i => $o) {
            $offsets[] = strlen($pdf);
            $pdf .= ($i + 1)." 0 obj\n{$o}\nendobj\n";
        }
        $x = strlen($pdf);
        $pdf .= "xref\n0 ".(count($objs) + 1)."\n0000000000 65535 f \n";
        foreach ($offsets as $off) {
            $pdf .= sprintf("%010d 00000 n \n", $off);
        }
        $pdf .= 'trailer << /Size '.(count($objs) + 1)." /Root 1 0 R >>\nstartxref\n{$x}\n%%EOF";

        if (! class_exists(\Smalot\PdfParser\Parser::class) && ! is_executable('/usr/bin/pdftotext')) {
            $this->markTestSkipped('No PDF reader available on this machine.');
        }
        $r = $this->upload($this->coordA, 'roster.pdf', $pdf)->assertOk();
        $this->assertSame(2, $r->json('counts.added'));
        $this->assertSame(1, $r->json('counts.rejected'));
    }

    public function test_unreadable_files_get_a_clear_message(): void
    {
        $this->upload($this->coordA, 'old.xls', "\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1".str_repeat('x', 50))->assertStatus(422)->assertJsonValidationErrors('file');
        $this->upload($this->coordA, 'scan.png', "\x89PNG\r\n\x1a\n".str_repeat('x', 50))->assertStatus(422)->assertJsonValidationErrors('file');
        $this->upload($this->coordA, 'empty.txt', 'no ids here, just words')->assertStatus(422)->assertJsonValidationErrors('file');
        $this->assertSame(0, DB::table('enrolled_students')->count());
    }

    public function test_preview_saves_nothing_and_assume_course_fills_in_for_id_only_lists(): void
    {
        $r = $this->upload($this->coordA, 'ids.txt', "2021-2-00301\n2021-2-00302\n", ['dry_run' => '1', 'assume_course' => '1'])->assertOk();
        $this->assertTrue($r->json('dry_run'));
        $this->assertSame(2, $r->json('counts.added'));
        $this->assertSame(0, DB::table('enrolled_students')->count());

        $this->upload($this->coordA, 'ids.txt', "2021-2-00301\n", ['assume_course' => '1'])->assertOk();
        $this->assertSame($this->a->id, (int) $this->onRoster('2021-2-00301')->section_id);
        // Without the tick an ID-only list is rejected: the course is always read first.
        $this->upload($this->coordA, 'ids.txt', "2021-2-00303\n")->assertOk()->assertJsonPath('counts.rejected', 1);
        $this->assertNull($this->onRoster('2021-2-00303'));
    }

    public function test_each_coordinator_only_touches_their_own_section(): void
    {
        $this->upload($this->coordA, 'a.csv', "2021-2-00401,BSIT\n")->assertOk();

        $r = $this->upload($this->coordB, 'b.csv', "2021-2-00401,BSIT\n2021-2-00402,BSIT\n")->assertOk();
        $this->assertSame('other_section', collect($r->json('rows'))->firstWhere('student_id', '2021-2-00401')['status']);
        $this->assertSame($this->a->id, (int) $this->onRoster('2021-2-00401')->section_id); // not stolen
        $this->assertSame($this->b->id, (int) $this->onRoster('2021-2-00402')->section_id);

        $b = $this->signedIn($this->coordB)->getJson('/api/coordinator/roster')->assertOk();
        $this->assertSame(['2021-2-00402'], collect($b->json('students'))->pluck('student_id')->all());
        // A request value can never widen the scope.
        $this->signedIn($this->coordB)->getJson('/api/coordinator/roster?section_id='.$this->a->id)->assertOk()->assertJsonPath('section.id', $this->b->id);
        $this->signedIn($this->coordB)->deleteJson('/api/coordinator/roster/2021-2-00401')->assertNotFound();
        $this->signedIn($this->coordB)->deleteJson('/api/coordinator/roster/2021-2-00402')->assertOk();
        $this->assertNull($this->onRoster('2021-2-00402'));
    }

    public function test_coordinator_without_a_section_trainees_and_unknown_roles(): void
    {
        $free = $this->staff('coordinator', 'COORD-NONE');
        $this->upload($free, 'x.csv', "2021-2-00501,BSIT\n")->assertStatus(422)->assertJsonValidationErrors('file');

        $trainee = User::factory()->create(['email_verified_at' => now()]);
        $this->signedIn($trainee)->postJson('/api/coordinator/roster/import', [])->assertForbidden();
        $this->signedIn($this->coordA)->postJson('/api/admin/roster/import', [])->assertForbidden();
    }

    public function test_admin_imports_into_a_chosen_section(): void
    {
        $this->upload($this->admin, 'x.csv', "2021-2-00601,BSIT\n", ['section_id' => $this->b->id], 'admin')->assertOk();
        $this->assertSame($this->b->id, (int) $this->onRoster('2021-2-00601')->section_id);
        $this->upload($this->admin, 'x.csv', "2021-2-00602,BSIT\n", [], 'admin')->assertStatus(422)->assertJsonValidationErrors('section_id');
    }

    public function test_registration_needs_the_imported_student_id_and_course_and_lands_in_the_section(): void
    {
        config(['occ.roster_enforce' => true]);
        $this->upload($this->coordA, 'list.csv', "Student ID,Course\n2021-2-04062,CIT BSIT\n")->assertOk();

        $bsit = Course::where('code', 'BSIT')->value('name');
        $beed = Course::where('code', 'BEED')->value('name');
        $form = fn (array $o = []) => $o + [
            'student_id' => '2021-2-04062', 'first_name' => 'Juan', 'last_name' => 'Reyes', 'email' => 'occ.reyes.juan@gmail.com',
            'course' => $bsit, 'password' => 'Secret-Pass1', 'password_confirmation' => 'Secret-Pass1',
            'profile_photo' => UploadedFile::fake()->image('me.jpg', 400, 500),
        ];

        // Right ID, wrong course -> rejected.
        $this->postJson('/api/auth/register', $form(['course' => $beed]))->assertStatus(422)->assertJsonValidationErrors('student_id');
        // Course on the list but an ID nobody imported -> rejected.
        $this->postJson('/api/auth/register', $form(['student_id' => '2021-2-09999']))->assertStatus(422)->assertJsonValidationErrors('student_id');
        $this->assertSame(0, User::where('role', 'trainee')->count());

        // ID + course match -> registered, enrolled in the importing coordinator's section.
        $this->postJson('/api/auth/register', $form())->assertCreated();
        $enrollment = User::where('student_id', '2021-2-04062')->first()->currentEnrollment();
        $this->assertSame('active', $enrollment->status);
        $this->assertSame($this->a->id, $enrollment->section_id);

        $this->app['auth']->guard('web')->logout();
        $mine = $this->signedIn($this->coordA)->getJson('/api/coordinator/trainees')->assertOk();
        $this->assertSame(['2021-2-04062'], collect($mine->json('trainees'))->pluck('student_id')->all());
        $this->signedIn($this->coordB)->getJson('/api/coordinator/trainees')->assertOk()->assertJsonCount(0, 'trainees');

        $list = $this->signedIn($this->coordA)->getJson('/api/coordinator/roster')->assertOk();
        $this->assertTrue($list->json('students.0.registered'));
        $this->assertSame(1, $list->json('registered'));
        $this->assertSame('occ.reyes.juan@gmail.com', $list->json('students.0.email'));
        $this->assertNotNull($list->json('students.0.registered_at'));
        // A registered student cannot be deleted from the roster.
        $this->signedIn($this->coordA)->deleteJson('/api/coordinator/roster/2021-2-04062')->assertStatus(422);
    }

    public function test_course_resolver_reads_the_ways_people_write_a_course(): void
    {
        $r = app(CourseResolver::class);
        $code = fn (string $t) => $r->resolve($t)['course']?->code ?? $r->resolve($t)['status'];

        $this->assertSame('BSIT', $code('CIT bsit'));
        $this->assertSame('BSIT', $code('Bachelor of Science in Information Technology'));
        $this->assertSame('BSIT', $code('CIT'));
        $this->assertSame('BEED', $code('BEED — Elementary Education'));
        $this->assertSame('BSED', $code('BSEd English'));
        $this->assertSame('BSBA-MM', $code('BSBA - Marketing'));
        $this->assertSame('BSBA-MM', $code('BSBA-MM'));
        $this->assertSame('BSBA-FM', $code('BSBA (Financial Management)'));
        $this->assertSame('ambiguous', $code('BSBA'));
        $this->assertSame('ambiguous', $code('CTE'));
        $this->assertSame('none', $code('Juan Dela Cruz'));
    }

    public function test_roster_csv_download_is_scoped_filterable_and_formula_safe(): void
    {
        $this->upload($this->coordA, 'a.csv', "2021-2-00701,BSIT\n2021-2-00702,BSIT\n")->assertOk();
        $this->upload($this->coordB, 'b.csv', "2021-2-00703,BSIT\n")->assertOk();
        User::factory()->create(['student_id' => '2021-2-00701', 'first_name' => '=HYPERLINK("x")', 'last_name' => 'Cruz', 'email_verified_at' => now()]);

        $csv = $this->signedIn($this->coordA)->get('/api/coordinator/roster.csv')->assertOk()->assertHeader('Content-Disposition', 'attachment; filename="roster-BSIT-4A.csv"')->getContent();
        $this->assertStringContainsString('2021-2-00701', $csv);
        $this->assertStringContainsString('Registered', $csv);
        $this->assertStringContainsString('Not registered yet', $csv);
        $this->assertStringNotContainsString('2021-2-00703', $csv); // 4B's student
        $this->assertStringContainsString("'=HYPERLINK", $csv);

        $waiting = $this->signedIn($this->coordA)->get('/api/coordinator/roster.csv?status=waiting')->getContent();
        $this->assertStringContainsString('2021-2-00702', $waiting);
        $this->assertStringNotContainsString('2021-2-00701', $waiting);
        $this->signedIn($this->admin)->get('/api/admin/roster.csv?section_id='.$this->b->id)->assertOk();
    }
}
