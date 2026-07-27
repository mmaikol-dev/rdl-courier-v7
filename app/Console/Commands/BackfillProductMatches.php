<?php

namespace App\Console\Commands;

use App\Models\SheetOrder;
use App\Services\ProductAutoMatchService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class BackfillProductMatches extends Command
{
    protected $signature = 'orders:backfill-product-matches
        {--chunk=100 : Number of orders to process per chunk}
        {--unmatched : Only show unmatched orders, skip updating}';

    protected $description = 'Backfill inventory_product_id for orders missing it, using ProductAutoMatchService';

    public function handle(ProductAutoMatchService $autoMatch): int
    {
        $query = SheetOrder::whereNull('inventory_product_id')
            ->whereNotNull('product_name')
            ->where('product_name', '!=', '')
            ->where('created_at', '>=', '2026-05-01 00:00:00');

        $total = $query->count();

        if ($total === 0) {
            $this->info('No orders missing inventory_product_id.');
            return 0;
        }

        $this->info("Found {$total} orders without inventory_product_id.");
        $bar = $this->output->createProgressBar($total);
        $bar->start();

        $matched = 0;
        $unmatched = 0;

        $query->chunkById((int) $this->option('chunk'), function ($orders) use ($autoMatch, $bar, &$matched, &$unmatched) {
            $results = $autoMatch->matchMany($orders);

            if ($this->option('unmatched')) {
                foreach ($orders as $order) {
                    if (! isset($results[$order->id])) {
                        $this->line(" {$order->id} | {$order->order_no} | {$order->product_name} | {$order->merchant} | {$order->country}");
                    }
                }
                $bar->advance($orders->count());
                return;
            }

            foreach ($results as $orderId => $productId) {
                SheetOrder::where('id', $orderId)
                    ->update(['inventory_product_id' => $productId]);
                $matched++;
            }

            $unmatched += $orders->count() - count($results);
            $bar->advance($orders->count());
        });

        $bar->finish();
        $this->newLine();

        if (! $this->option('unmatched')) {
            $this->info("Done. {$matched} matched, {$unmatched} still unmatched.");
        }

        return 0;
    }
}
