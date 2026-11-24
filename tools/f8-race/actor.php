<?php
// usage: php actor.php approve|reject <startDelaySeconds> <holdLockSeconds>
require '/home/claude/occ/vendor/autoload.php';
$app = require '/home/claude/occ/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use App\Models\{User,DutyEntry};
use Illuminate\Support\Facades\DB;
[, $action, $delay, $hold] = $argv;
usleep((int)((float)$delay*1e6));
$coord = User::where('role','coordinator')->first();
$entry = DutyEntry::where('entry_uid','race1')->first();     // read outside the transaction, like the controller does
if ((float)$hold > 0) {
    DB::listen(function ($q) use ($hold) {                     // keep the settings lock open so the other actor queues behind it
        if (stripos($q->sql,'for update') !== false && stripos($q->sql,'user_settings') !== false) { usleep((int)((float)$hold*1e6)); }
    });
}
$svc = app(App\Services\Academic\DutyEntryApprovalService::class);
try {
    $action === 'approve' ? $svc->approve($coord,$entry,null) : $svc->reject($coord,$entry,'race test');
    echo "[$action] SUCCEEDED at ".date('H:i:s')."\n";
} catch (Throwable $e) {
    echo "[$action] REFUSED (".class_basename($e)."): ".json_encode($e instanceof Illuminate\Validation\ValidationException ? $e->errors() : $e->getMessage())."\n";
}
