<?php

namespace App\Console\Commands;

use App\Models\Sheet;
use App\Models\SheetOrder;
use App\Services\ProductAutoMatchService;
use App\Services\ShopifyService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class ImportShopifyOrders extends Command
{
    protected $signature = 'shopify:import-orders';

    protected $description = 'Fetch orders from Shopify stores and insert them into the sheet_orders table';

    private ProductAutoMatchService $autoMatch;

    public function __construct(ProductAutoMatchService $autoMatch)
    {
        parent::__construct();
        $this->autoMatch = $autoMatch;
    }

    public function handle()
    {
        $stores = Sheet::all();

        if ($stores->isEmpty()) {
            $this->error('No Shopify stores configured.');
            Log::error('No Shopify stores configured.');

            return;
        }

        foreach ($stores as $store) {
            $shop = $store->shopify_name;
            $accessToken = $store->access_token;
            $sheetName = $store->sheet_name;
            $storeName = $store->store_name;

            $this->info("Fetching orders for store: $shop");
            Log::info("Fetching orders for store: $shop");

            try {
                $shopifyService = new ShopifyService($shop, $accessToken);
                $shopifyOrders = $shopifyService->fetchOrders();

                if (! isset($shopifyOrders['orders']) || empty($shopifyOrders['orders'])) {
                    $this->info("No orders found for store: $shop.");
                    Log::info("No orders found for store: $shop.");

                    continue;
                }

                $ordersToProcess = array_slice($shopifyOrders['orders'], 0, 30);

                foreach ($ordersToProcess as $order) {
                    Log::info('Order Raw Data:', $order);

                    // Use SKU if available, otherwise fallback to raw order number
                    $orderNumber = $store->sku
                        ? $store->sku.ltrim($order['order_number'], '#')
                        : '#'.ltrim($order['order_number'], '#');

                    if (SheetOrder::where('order_no', $orderNumber)->exists()) {
                        $this->info("Skipping existing order: $orderNumber");
                        Log::info("Skipping existing order: $orderNumber");

                        continue;
                    }

                    $orderDate = Carbon::parse($order['created_at'])->format('Y-m-d H:i:s');

                    $noteAttributes = collect($order['note_attributes'] ?? [])
                        ->mapWithKeys(fn ($item) => [strtolower(trim($item['name'])) => $item['value']]);

                    $customerName = $noteAttributes['full name']
                        ?? ($order['billing_address']['name'] ?? 'Unknown');

                    $phone = $noteAttributes['phone number']
                        ?? ($order['customer']['phone'] ?? 'No Phone');

                    $altPhone = $order['shipping_address']['phone'] ?? 'No Alt No';

                    $address = $noteAttributes['address']
                        ?? ($order['shipping_address']['address1'] ?? 'No Address');

                    $city = $noteAttributes['city']
                        ?? ($order['shipping_address']['city'] ?? 'No City');

                    $country = 'Kenya'; // Static country

                    // Assign cc_email from cc_agents using round-robin
                    $cc_email = null;
                    $ccAgents = explode(',', $store->cc_agents);
                    $ccAgents = array_filter(array_map('trim', $ccAgents)); // clean and remove empty

                    if (! empty($ccAgents)) {
                        $lastAssigned = SheetOrder::whereNotNull('cc_email')
                            ->whereIn('cc_email', $ccAgents)
                            ->latest('id')
                            ->value('cc_email');

                        $nextIndex = 0;
                        if ($lastAssigned) {
                            $lastIndex = array_search($lastAssigned, $ccAgents);
                            $nextIndex = ($lastIndex !== false && $lastIndex + 1 < count($ccAgents)) ? $lastIndex + 1 : 0;
                        }

                        $cc_email = $ccAgents[$nextIndex];
                    }

                    SheetOrder::create([
                        'order_no' => $orderNumber,
                        'order_date' => $orderDate,
                        'amount' => $order['total_price'],
                        'client_name' => $customerName,
                        'address' => $address,
                        'phone' => $phone,
                        'alt_no' => $altPhone,
                        'country' => $country,
                        'city' => $city,
                        'product_name' => implode(', ', array_column($order['line_items'], 'name')),
                        'quantity' => array_sum(array_column($order['line_items'], 'quantity')),
                        'status' => null,
                        'agent' => null,
                        'delivery_date' => null,
                        'instructions' => null,
                        'cc_email' => $cc_email,
                        'merchant' => $sheetName,
                        'order_type' => null,
                        'sheet_id' => $store->sheet_id,
                        'sheet_name' => 'Sheet1',
                        'store_name' => $storeName,
                        'code' => null,
                        'processed' => false,
                    ]);

                    $createdOrder = SheetOrder::where('order_no', $orderNumber)->first();
                    if ($createdOrder) {
                        $this->autoMatch->applyMatches($createdOrder, $this->autoMatch->match($createdOrder));
                    }
                }

                $this->info("Imported first 30 orders for store: $shop.");
                Log::info("Imported first 30 orders for store: $shop.");
            } catch (\Exception $e) {
                $this->error("Error importing orders for store: $shop. Error: ".$e->getMessage());
                Log::error("Error importing orders for store: $shop. Error: ".$e->getMessage());
            }
        }
    }
}
