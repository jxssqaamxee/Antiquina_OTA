<?php

namespace App\Services\Academic;

use App\Models\HostClient;
use App\Models\HostEstablishment;
use App\Models\StudentEnrollment;
use App\Models\TraineePlacement;
use App\Models\User;
use App\Models\UserSetting;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** A placement creates a server-managed host client for the trainee (read-only in sync; reminders keep reading host_clients). */
class PlacementService
{
    public function __construct(private ActivityLogService $log, private ServerNotifier $notify) {}

    public function place(User $actor, User $trainee, HostEstablishment $est, array $days, string $timeIn, string $timeOut, ?string $supervisor, ?string $startsOn): TraineePlacement
    {
        return DB::transaction(function () use ($actor, $trainee, $est, $days, $timeIn, $timeOut, $supervisor, $startsOn) {
            UserSetting::firstOrCreate(['user_id' => $trainee->id]);
            UserSetting::where('user_id', $trainee->id)->lockForUpdate()->first();

            $key = mb_strtolower($est->name);
            if (HostClient::where('user_id', $trainee->id)->where('name_key', $key)->exists()) {
                throw ValidationException::withMessages(['establishment_id' => 'This trainee already has a host client with that name. Ask them to remove it first.']);
            }
            $p = TraineePlacement::create([
                'user_id' => $trainee->id, 'establishment_id' => $est->id, 'supervisor_name' => $supervisor ?: $est->supervisor_name,
                'days' => array_values(array_unique($days)), 'time_in' => $timeIn, 'time_out' => $timeOut,
                'starts_on' => $startsOn, 'assigned_by' => $actor->id,
            ]);
            HostClient::create([
                'user_id' => $trainee->id, 'client_uid' => 'p'.$p->id, 'name' => $est->name, 'name_key' => $key, 'type' => $est->type,
                'days' => $p->days, 'time_in' => $timeIn, 'time_out' => $timeOut,
                'position' => (int) HostClient::where('user_id', $trainee->id)->max('position') + 1, 'placement_id' => $p->id,
            ]);
            $this->touch($trainee);
            $sectionId = StudentEnrollment::open()->where('user_id', $trainee->id)->value('section_id');
            $this->log->record($actor, 'placement.created', 'trainee', $trainee->id, $sectionId, ['establishment' => $est->name, 'placement' => $p->id]);
            $this->notify->notify($trainee, 'Placement assigned', "You are assigned to {$est->name}.");

            return $p;
        });
    }

    /** Ends the placement; the host client becomes an ordinary (unmanaged) one so past entries keep their reference. */
    public function end(User $actor, TraineePlacement $p): void
    {
        DB::transaction(function () use ($actor, $p) {
            UserSetting::firstOrCreate(['user_id' => $p->user_id]);
            UserSetting::where('user_id', $p->user_id)->lockForUpdate()->first();
            $p = TraineePlacement::whereKey($p->id)->lockForUpdate()->firstOrFail();
            if ($p->ended_at) {
                return;
            }
            $p->update(['ended_at' => now()]);
            HostClient::where('placement_id', $p->id)->update(['placement_id' => null]);
            $this->touch(User::findOrFail($p->user_id));
            $sectionId = StudentEnrollment::open()->where('user_id', $p->user_id)->value('section_id');
            $this->log->record($actor, 'placement.ended', 'trainee', $p->user_id, $sectionId, ['placement' => $p->id]);
        });
    }

    private function touch(User $trainee): void
    {
        // Stale devices reload instead of overwriting. Also make sure the logbook document exists, otherwise a trainee
        // who has never saved one would not receive the placement's host client.
        UserSetting::where('user_id', $trainee->id)->whereNull('logbook_saved_at')->update(['logbook_saved_at' => now()]);
        UserSetting::where('user_id', $trainee->id)->increment('logbook_revision');
    }
}
