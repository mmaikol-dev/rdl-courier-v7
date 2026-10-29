<?php

namespace App\Jobs;

use App\Services\MerchantWebhookService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Throwable;

class SendMerchantWebhook implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public array $backoff = [10, 60, 300];

    public function __construct(
        public int $integrationId,
        public string $event,
        public array $data,
    ) {}

    public function handle(MerchantWebhookService $service): void
    {
        $service->deliver($this->integrationId, $this->event, $this->data);
    }

    public function failed(Throwable $exception): void
    {
        report($exception);
    }
}
