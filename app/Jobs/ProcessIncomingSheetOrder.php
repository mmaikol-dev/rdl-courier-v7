<?php

namespace App\Jobs;

use App\Models\IncomingSheetOrder;
use App\Services\SheetOrderImportService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;
use Throwable;

class ProcessIncomingSheetOrder implements ShouldQueue, ShouldBeUnique
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 3;

    public int $timeout = 120;

    public int $uniqueFor = 1800;

    public function __construct(public int $incomingSheetOrderId)
    {
        $this->onQueue('imports');
    }

    public function backoff(): array
    {
        return [60, 300, 900];
    }

    public function uniqueId(): string
    {
        return (string) $this->incomingSheetOrderId;
    }

    public function handle(SheetOrderImportService $importer): void
    {
        $incoming = IncomingSheetOrder::find($this->incomingSheetOrderId);

        if (! $incoming || $incoming->status === 'processed') {
            return;
        }

        $lockName = 'incoming-sheet-order:' . ($incoming->source_hash ?: $incoming->id);
        $lock = Cache::lock($lockName, 120);

        if (! $lock->get()) {
            $this->release(30);
            return;
        }

        try {
            $incoming->forceFill([
                'status' => 'processing',
                'attempts' => $incoming->attempts + 1,
                'error_message' => null,
            ])->save();

            $importer->import($incoming->payload ?? []);

            $incoming->forceFill([
                'status' => 'processed',
                'processed_at' => now(),
                'available_at' => null,
            ])->save();
        } catch (Throwable $e) {
            $incoming->forceFill([
                'status' => $this->attempts() >= $this->tries ? 'failed' : 'pending',
                'error_message' => mb_substr($e->getMessage(), 0, 1000),
                'available_at' => now()->addMinutes(5),
            ])->save();

            throw $e;
        } finally {
            $lock->release();
        }
    }
}
