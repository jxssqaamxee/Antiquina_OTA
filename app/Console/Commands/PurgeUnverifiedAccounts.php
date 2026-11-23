<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Support\ProfilePhotoStorage;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Deletes trainee accounts whose email was never verified (a mistyped address, a mail that never arrived,
 * someone who gave up), so they do not sit in the database and their Student ID is free to register again.
 * Runs daily (routes/console.php). An unverified account has no logbook data: /api/sync is closed to it.
 */
class PurgeUnverifiedAccounts extends Command
{
    protected $signature = 'accounts:purge-unverified {--hours=24 : delete accounts registered more than this many hours ago} {--dry-run : only list them}';

    protected $description = 'Delete trainee accounts that never verified their email';

    public function handle(): int
    {
        $hours = max(1, (int) $this->option('hours'));
        $users = User::where('role', User::ROLE_TRAINEE)->whereNull('email_verified_at')
            ->where('created_at', '<', now()->subHours($hours))->get();

        foreach ($users as $u) {
            $this->line("{$u->student_id} <{$u->email}> registered {$u->created_at}");
            if ($this->option('dry-run')) {
                continue;
            }
            DB::transaction(function () use ($u) {
                ProfilePhotoStorage::clear($u);
                foreach (['student_enrollments', 'user_documents', 'push_subscriptions', 'user_notifications', 'user_settings'] as $table) {
                    if (\Illuminate\Support\Facades\Schema::hasTable($table) && \Illuminate\Support\Facades\Schema::hasColumn($table, 'user_id')) {
                        DB::table($table)->where('user_id', $u->id)->delete();
                    }
                }
                DB::table('sessions')->where('user_id', $u->id)->delete();
                $u->delete();
            });
        }

        $this->info(($this->option('dry-run') ? 'Would delete ' : 'Deleted ').$users->count().' unverified account(s).');

        return self::SUCCESS;
    }
}
