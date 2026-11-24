<?php
// Seeds one coordinator, one trainee with a SUBMITTED entry "race1". Run after migrate.
require '/home/claude/occ/vendor/autoload.php';
$app = require '/home/claude/occ/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\{User,Section,Course,AcademicYear};
use App\Services\Academic\{AcademicSeeder,CoordinatorAssignmentService,DutyEntryApprovalService};
use App\Support\Logbook\LogbookStore;

AcademicSeeder::run();
$admin = User::factory()->create(['role'=>'admin','admin_id'=>'ADMIN-001','student_id'=>null,'course'=>null,'email_verified_at'=>now()]);
$coord = User::factory()->create(['role'=>'coordinator','admin_id'=>'COORD-001','student_id'=>null,'course'=>null,'email_verified_at'=>now()]);
$t = User::factory()->create(['student_id'=>'2024-1-00001','email_verified_at'=>now()]);
$sec = Section::create(['course_id'=>Course::where('code','BSIT')->value('id'),'academic_year_id'=>AcademicYear::current()->id,'year_level'=>4,'label'=>'A']);
$t->enrollments()->create(['course_id'=>$sec->course_id,'academic_year_id'=>$sec->academic_year_id,'section_id'=>$sec->id,'year_level'=>4,'status'=>'active']);
app(CoordinatorAssignmentService::class)->assign($admin,$coord,$sec);
app(LogbookStore::class)->save($t,'logbook-v2',['studentName'=>'Juan','targetHours'=>486,'lastClientId'=>null,'clients'=>[],'entries'=>[[
 'id'=>'race1','date'=>'2026-01-05','client'=>null,'category'=>'regular','amIn'=>'08:00','amOut'=>'12:00','pmIn'=>'13:00','pmOut'=>'17:00','evIn'=>'','evOut'=>'','hours'=>8,'task'=>'x']]]);
app(DutyEntryApprovalService::class)->submit($t,'race1');
echo "seeded; status=".App\Models\DutyEntry::where('entry_uid','race1')->value('status')."\n";
