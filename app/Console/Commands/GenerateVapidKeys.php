<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Minishlink\WebPush\VAPID;

/**
 * One-time setup: makes the VAPID key pair for Web Push. Writes it into .env when there is one;
 * on a host that only has environment variables (Docker / EthioDeploy) it prints the two lines to copy.
 * Run it ONCE: a new pair invalidates every phone already subscribed.
 */
class GenerateVapidKeys extends Command
{
    protected $signature = 'webpush:vapid {--show : only print the keys, do not touch .env}';

    protected $description = 'Generate the VAPID key pair for Web Push';

    public function handle(): int
    {
        $keys = VAPID::createVapidKeys();
        $this->line('VAPID_PUBLIC_KEY='.$keys['publicKey']);
        $this->line('VAPID_PRIVATE_KEY='.$keys['privateKey']);

        $env = base_path('.env');
        if ($this->option('show') || ! is_file($env)) {
            $this->comment('Copy these two lines into your environment variables (and keep them forever).');

            return self::SUCCESS;
        }

        $text = (string) file_get_contents($env);
        foreach (['VAPID_PUBLIC_KEY' => $keys['publicKey'], 'VAPID_PRIVATE_KEY' => $keys['privateKey']] as $k => $v) {
            $pattern = '/^'.preg_quote($k, '/').'=.*/m';
            $text = preg_match($pattern, $text) ? preg_replace($pattern, "{$k}={$v}", $text) : rtrim($text)."\n{$k}={$v}\n";
        }
        file_put_contents($env, $text);
        $this->info('Written to .env. Run `php artisan config:clear`.');

        return self::SUCCESS;
    }
}
