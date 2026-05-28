<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Artisan;

class RunArtisanCommandJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 3;

    public int $timeout = 1200;

    public function __construct(
        private string $command,
        private array $parameters = [],
        ?string $queue = null,
    ) {
        if ($queue) {
            $this->onQueue($queue);
        }
    }

    public function handle(): void
    {
        Artisan::call($this->command, $this->parameters);
    }
}
