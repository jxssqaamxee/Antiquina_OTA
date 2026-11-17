<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Support\Logbook\LegacyImporter;
use App\Support\Logbook\LogbookStore;
use Illuminate\Console\Command;

class ImportLegacyDocuments extends Command
{
    protected $signature = 'occ:import-legacy {--user= : Only this user id}';

    protected $description = 'Copy every account\'s old user_documents JSON into the real logbook tables (user_documents is never changed)';

    public function handle(LogbookStore $store): int
    {
        $importer = new LegacyImporter($store, new \App\Support\Logbook\LogbookValidator());
        $query = User::query()->whereHas('documents')->when($this->option('user'), fn ($q, $id) => $q->whereKey($id));

        $n = 0;
        $query->each(function (User $u) use ($importer, &$n) {
            $r = $importer->import($u);
            $n++;
            $this->line(sprintf('user %d: imported [%s]%s', $u->id, implode(', ', $r['imported']),
                $r['skipped'] ? ' skipped '.json_encode($r['skipped']) : ''));
        });
        $this->info("Done: $n account(s) processed.");

        return self::SUCCESS;
    }
}
