<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\C2BTransaction;
use App\Models\SheetOrder;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Carbon;

class ProcessC2BTransactions extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'c2b:process-transactions';

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
    // Fetch all transactions where processed is 0
    $transactions = C2BTransaction::where('processed', 0)->get();

    foreach ($transactions as $transaction) {
        // Search for the corresponding order in the sheet_orders table
        $order = SheetOrder::where('order_no', $transaction->account_number)->first();

        if ($order) {
            // Skip if merchant is TECHZONE
            if (strtoupper($order->merchant) === 'null') {
                Log::info("Skipping order {$order->order_no} for merchant null.");
                continue;
            }

            // Check if the amounts match or if the transaction amount is greater than the order amount
            if ($order->amount == $transaction->amount || $transaction->amount > $order->amount) {
                $order->update([
                    'code' => $transaction->transaction_id,
                    'status' => 'Delivered',
                    'delivery_date' => $transaction->created_at->toDateString(),
                ]);

                $transaction->update(['processed' => 1]);

                Log::info("Order {$order->order_no} updated to Delivered with transaction ID {$transaction->transaction_id}, delivery date {$transaction->created_at->toDateString()}, and amount {$transaction->amount}. Transaction marked as processed.");
            } elseif ($transaction->amount < $order->amount) {
                $order->update([
                    'code' => $transaction->transaction_id,
                    'delivery_date' => $transaction->created_at->toDateString(),
                ]);

                Log::warning("Order {$order->order_no} had a lower amount than expected. Expected: {$order->amount}, Received: {$transaction->amount}. Status unchanged. Delivery date updated.");

                // You might want to decide here whether to mark it as processed or not
                $transaction->update(['processed' => 1]);
            }
        } else {
            Log::warning("No order found for Account Number: {$transaction->account_number}");
        }
    }

    $this->info('C2B Transactions processed successfully.');
}




}
