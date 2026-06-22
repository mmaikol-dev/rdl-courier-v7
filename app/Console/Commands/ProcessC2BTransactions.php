<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\C2BTransaction;
use App\Models\SheetOrder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class ProcessC2BTransactions extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'c2b:process-transactions {--limit=200 : Maximum pending transactions to process in one run}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Processes C2B transactions and updates sheet_orders based on account_number, amount, and created_at.';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $lock = Cache::lock('c2b-process-transactions-lock', 600);

        if (! $lock->get()) {
            Log::info('C2B transaction processor skipped to avoid overlap.');
            return 0;
        }

        try {
            $limit = max(1, (int) $this->option('limit'));

            $transactions = C2BTransaction::query()
                ->where('processed', 0)
                ->where(function ($query): void {
                    $query->whereNull('last_attempted_at')
                        ->orWhere('last_attempted_at', '<=', now()->subMinutes(10));
                })
                ->orderBy('id')
                ->limit($limit)
                ->get();

            if ($transactions->isEmpty()) {
                $this->info('No pending C2B transactions found.');
                return 0;
            }

            $ordersByNumber = SheetOrder::query()
                ->whereIn('order_no', $transactions->pluck('account_number')->filter()->unique()->values())
                ->orderBy('id')
                ->get()
                ->keyBy('order_no');

            $processed = 0;
            $missing = 0;

            foreach ($transactions as $transaction) {
                $order = $ordersByNumber->get($transaction->account_number);

                if (! $order) {
                    $transaction->forceFill(['last_attempted_at' => now()])->save();
                    $missing++;

                    Log::warning("No order found for Account Number: {$transaction->account_number}");
                    continue;
                }

                if (strtoupper((string) $order->merchant) === 'NULL') {
                    $transaction->forceFill([
                        'processed' => 1,
                        'last_attempted_at' => now(),
                    ])->save();

                    Log::info("Skipping order {$order->order_no} for merchant null.");
                    continue;
                }

                if ((float) $transaction->amount >= (float) $order->amount) {
                    $order->update([
                        'code' => $transaction->transaction_id,
                        'status' => 'Delivered',
                        'delivery_date' => $transaction->created_at->toDateString(),
                    ]);

                    $transaction->forceFill([
                        'processed' => 1,
                        'last_attempted_at' => now(),
                    ])->save();

                    $processed++;

                    Log::info("Order {$order->order_no} updated to Delivered from C2B transaction {$transaction->transaction_id}.");
                    continue;
                }

                $order->update([
                    'code' => $transaction->transaction_id,
                    'delivery_date' => $transaction->created_at->toDateString(),
                ]);

                $transaction->forceFill([
                    'processed' => 1,
                    'last_attempted_at' => now(),
                ])->save();

                $processed++;

                Log::warning("Order {$order->order_no} received a lower C2B amount than expected.", [
                    'expected' => $order->amount,
                    'received' => $transaction->amount,
                ]);
            }

            $this->info("C2B transactions processed: {$processed}; missing orders delayed: {$missing}.");
            return 0;
        } finally {
            $lock->release();
        }
    }




}
