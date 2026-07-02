<?php

namespace App\Http\Controllers;

use App\Models\InventoryLog;
use App\Models\Product;
use App\Models\SheetOrder;
use App\Models\User;
use App\Models\Whatsapp;
use App\Support\CountryAccess;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use Inertia\Response;

class InventoryDeductionController extends Controller
{
    private function deliveredOrdersQuery(Request $request)
    {
        return CountryAccess::scopeByCountryName(
            SheetOrder::query(),
            $request->user()?->loadMissing('country')
        )
            ->whereNotNull('merchant')
            ->where('merchant', '!=', '')
            ->where(function ($query): void {
                $query->whereNotNull('delivered_at')
                    ->orWhere('status', 'Delivered')
                    ->orWhereRaw('LOWER(status) = ?', ['delivered']);
            })
            ->whereNull('inventory_deducted_at');
    }

    public function index(Request $request): Response
    {
        $user = $request->user()?->loadMissing('country');
        $selectedMerchant = trim((string) $request->string('merchant'));

        $merchantOptions = (clone $this->deliveredOrdersQuery($request))
            ->select('merchant')
            ->distinct()
            ->orderBy('merchant')
            ->pluck('merchant')
            ->values();

        $orders = collect();
        $products = collect();

        if ($selectedMerchant !== '') {
            $orders = (clone $this->deliveredOrdersQuery($request))
                ->where('merchant', $selectedMerchant)
                ->orderByDesc('delivery_date')
                ->limit(300)
                ->get([
                    'id',
                    'order_no',
                    'client_name',
                    'product_name',
                    'code',
                    'quantity',
                    'amount',
                    'status',
                    'merchant',
                    'delivery_date',
                    'inventory_product_id',
                ])
                ->map(function (SheetOrder $order) use ($selectedMerchant) {
                    return [
                        'id' => $order->id,
                        'order_no' => $order->order_no,
                        'client_name' => $order->client_name,
                        'product_name' => $order->product_name,
                        'code' => $order->code,
                        'quantity' => (int) $order->quantity,
                        'amount' => (float) ($order->amount ?? 0),
                        'status' => $order->status,
                        'merchant' => $selectedMerchant,
                        'delivery_date' => $order->delivery_date,
                        'inventory_product_id' => $order->inventory_product_id,
                    ];
                })
                ->values();

            $products = CountryAccess::scopeProducts(
                Product::query(),
                $user
            )
                ->where('merchant', $selectedMerchant)
                ->orderBy('name')
                ->get([
                    'id',
                    'name',
                    'code',
                    'quantity',
                    'merchant',
                    'country',
                ])
                ->map(fn (Product $product) => [
                    'id' => $product->id,
                    'name' => $product->name,
                    'code' => $product->code,
                    'quantity' => (int) $product->quantity,
                    'merchant' => $product->merchant,
                    'country' => $product->country,
                ])
                ->values();
        }

        return Inertia::render('inventory-deductions/index', [
            'merchantOptions' => $merchantOptions,
            'selectedMerchant' => $selectedMerchant !== '' ? $selectedMerchant : null,
            'orders' => $orders,
            'products' => $products,
        ]);
    }

    /**
     * Clean phone number - ONLY remove non-digits, no country code manipulation.
     * Numbers are already saved with correct country codes.
     */
    private function cleanPhoneNumber(?string $phoneNumber): ?string
    {
        if (!$phoneNumber) return null;
        
        // Just remove any non-digit characters (spaces, +, -, etc.)
        $phone = preg_replace('/\D/', '', $phoneNumber);
        
        // Return if valid length (at least 9 digits for any international number)
        return (strlen($phone) >= 9) ? $phone : null;
    }

    /**
     * OpenWA headers that mimic official WhatsApp Web traffic.
     */
    private function openwaHeaders(string $apiKey): array
    {
        return [
            'X-API-Key'      => $apiKey,
            'Content-Type'   => 'application/json',
            'User-Agent'     => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept'         => 'application/json, text/plain, */*',
            'Accept-Language'=> 'en-US,en;q=0.9',
            'Origin'         => 'https://web.whatsapp.com',
            'Referer'        => 'https://web.whatsapp.com/',
            'Sec-Fetch-Dest' => 'empty',
            'Sec-Fetch-Mode' => 'cors',
            'Sec-Fetch-Site' => 'same-origin',
        ];
    }

    /**
     * Send WhatsApp message DIRECTLY via OpenWA using Kenya session ONLY.
     * Phone number is used AS-IS since it already has country code.
     */
    private function sendViaOpenWAKenya(string $phoneNumber, string $message): array
    {
        $sessionId = env('OPENWA_SESSION_KENYA');
        $baseUrl = env('OPENWA_BASE_URL', 'https://api.sitebase.co.ke');
        $apiKey = env('OPENWA_API_KEY', '');

        if (empty($sessionId)) {
            throw new \Exception("OPENWA_SESSION_KENYA is not configured in .env");
        }

        if (empty($apiKey)) {
            throw new \Exception("OPENWA_API_KEY is not configured in .env");
        }

        // Just clean the number - no country code added
        $cleanPhone = $this->cleanPhoneNumber($phoneNumber);
        if (!$cleanPhone) {
            throw new \Exception("Invalid phone number: {$phoneNumber}");
        }

        $chatId = $cleanPhone . '@c.us';
        $url = rtrim($baseUrl, '/') . "/api/sessions/{$sessionId}/messages/send-text";

        Log::info('Sending WhatsApp via OpenWA Kenya', [
            'original_phone' => $phoneNumber,
            'clean_phone' => $cleanPhone,
            'chatId' => $chatId,
        ]);

        $response = Http::withHeaders($this->openwaHeaders($apiKey))
            ->timeout(30)
            ->post($url, [
                'chatId' => $chatId,
                'text' => $message,
            ]);

        Log::info('OpenWA response', [
            'status' => $response->status(),
            'body' => $response->body(),
        ]);

        if (!$response->successful()) {
            throw new \Exception('OpenWA request failed (HTTP ' . $response->status() . '): ' . $response->body());
        }

        $data = $response->json();
        if (empty($data['messageId'])) {
            throw new \Exception('OpenWA did not return a valid messageId. Response: ' . json_encode($data));
        }

        return [
            'provider' => 'openwa_kenya',
            'to' => $chatId,
            'message_id' => $data['messageId'],
        ];
    }

    /**
     * Get operations users. First tries to match by country, falls back to ALL operations users.
     */
    private function getOperationsUsersByCountry(string $country): \Illuminate\Database\Eloquent\Collection
    {
        $countryName = strtolower(trim($country));
        
        Log::info('Looking for operations users for country: ' . $countryName);
        
        // Try to get country-specific users
        $users = User::whereNotNull('store_phone')
            ->where('store_phone', '!=', '')
            ->where(function($query) {
                $query->whereRaw('LOWER(TRIM(roles)) = ?', ['operations'])
                    ->orWhereRaw('LOWER(TRIM(roles)) LIKE ?', ['%operations%']);
            })
            ->where(function($query) use ($countryName) {
                $query->whereRaw('LOWER(store_address) LIKE ?', ['%' . $countryName . '%'])
                    ->orWhereRaw('(JSON_VALID(store_address) AND JSON_EXTRACT(store_address, "$.country") LIKE ?)', ['%' . $countryName . '%']);
            })
            ->get();
        
        // If no country-specific users found, get ALL operations users
        if ($users->isEmpty()) {
            Log::info('No country-specific operations users found, getting ALL operations users');
            $users = User::whereNotNull('store_phone')
                ->where('store_phone', '!=', '')
                ->where(function($query) {
                    $query->whereRaw('LOWER(TRIM(roles)) = ?', ['operations'])
                        ->orWhereRaw('LOWER(TRIM(roles)) LIKE ?', ['%operations%']);
                })
                ->get();
        }
        
        Log::info('Operations users found: ' . $users->count());
        
        foreach ($users as $user) {
            Log::info('User details', [
                'id' => $user->id,
                'name' => $user->name,
                'original_phone' => $user->store_phone,
                'cleaned_phone' => $this->cleanPhoneNumber($user->store_phone),
            ]);
        }
        
        return $users;
    }

    /**
     * Create the WhatsApp notification message for inventory deduction.
     */
    private function createDeductionMessage(array $deductionSummary, string $merchant, string $country): string
    {
        $message = "*INVENTORY DEDUCTION NOTIFICATION* 📦\n\n";
        $message .= "*Merchant:* {$merchant}\n";
        $message .= "*Country:* {$country}\n";
        $message .= "*Date:* " . now()->format('d M Y, H:i') . "\n";
        $message .= "*Deducted By:* {$deductionSummary['deducted_by']}\n\n";
        
        $message .= "*Deducted Products:*\n";
        foreach ($deductionSummary['products'] as $index => $product) {
            $num = $index + 1;
            $message .= "{$num}. *{$product['name']}*\n";
            $message .= "   📦 Code: {$product['code']}\n";
            $message .= "   📊 Previous Stock: {$product['previous_quantity']} units\n";
            $message .= "   📉 Deducted: {$product['deducted_quantity']} units\n";
            $message .= "   📊 Remaining: {$product['remaining_quantity']} units\n";
            $message .= "   📋 Orders Processed: {$product['orders_count']}\n\n";
        }
        
        $message .= "*Summary:*\n";
        $message .= "• Total Orders: {$deductionSummary['total_orders']}\n";
        $message .= "• Products Affected: {$deductionSummary['total_products']}\n";
        $message .= "• Total Quantity Deducted: {$deductionSummary['total_quantity']} units\n\n";
        $message .= "_Automated notification from Inventory System_";
        
        return $message;
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'merchant' => ['required', 'string', 'max:255'],
            'deductions' => ['required', 'array', 'min:1'],
            'deductions.*.order_id' => ['required', 'integer'],
            'deductions.*.product_id' => ['required', 'integer'],
        ]);

        $user = $request->user()?->loadMissing('country');
        $merchant = $validated['merchant'];
        $deductions = collect($validated['deductions'])
            ->unique('order_id')
            ->values();

        $deductionSummary = [
            'total_orders' => $deductions->count(),
            'total_products' => 0,
            'total_quantity' => 0,
            'products' => [],
            'deducted_by' => $user?->name ?? 'System',
        ];
        
        $countriesInvolved = [];

        try {
            DB::transaction(function () use ($deductions, $merchant, $user, &$deductionSummary, &$countriesInvolved): void {
                $productTotals = [];

                foreach ($deductions as $item) {
                    $order = CountryAccess::scopeByCountryName(SheetOrder::query()->lockForUpdate(), $user)
                        ->where('id', $item['order_id'])
                        ->where('merchant', $merchant)
                        ->whereNull('inventory_deducted_at')
                        ->where(function ($query): void {
                            $query->whereNotNull('delivered_at')
                                ->orWhere('status', 'Delivered')
                                ->orWhereRaw('LOWER(status) = ?', ['delivered']);
                        })
                        ->firstOrFail();

                    $quantityToDeduct = max(0, (int) $order->quantity);

                    if ($quantityToDeduct <= 0) {
                        throw new \RuntimeException("Order {$order->order_no} has no deductible quantity.");
                    }

                    $productId = (int) $item['product_id'];

                    if (! isset($productTotals[$productId])) {
                        $product = CountryAccess::scopeProducts(Product::query()->lockForUpdate(), $user)
                            ->where('id', $productId)
                            ->where('merchant', $merchant)
                            ->firstOrFail();
                        
                        // Get country from product or user
                        $productCountry = $product->country ?? $user->country->name ?? 'Kenya';
                        if (!in_array($productCountry, $countriesInvolved)) {
                            $countriesInvolved[] = $productCountry;
                        }

                        $productTotals[$productId] = [
                            'product' => $product,
                            'total_quantity' => 0,
                            'orders' => [],
                        ];
                    }

                    $productTotals[$productId]['total_quantity'] += $quantityToDeduct;
                    $productTotals[$productId]['orders'][] = $order;
                }

                $deductionSummary['total_products'] = count($productTotals);

                foreach ($productTotals as $entry) {
                    /** @var Product $product */
                    $product = $entry['product'];
                    $totalQuantityToDeduct = (int) $entry['total_quantity'];
                    
                    $deductionSummary['total_quantity'] += $totalQuantityToDeduct;

                    if ((int) $product->quantity < $totalQuantityToDeduct) {
                        throw new \RuntimeException("Insufficient stock for {$product->name}. Tried to deduct {$totalQuantityToDeduct}.");
                    }

                    $previousQuantity = (int) $product->quantity;
                    $newQuantity = $previousQuantity - $totalQuantityToDeduct;

                    $product->update([
                        'quantity' => $newQuantity,
                    ]);

                    $deductionSummary['products'][] = [
                        'name' => $product->name,
                        'code' => $product->code,
                        'previous_quantity' => $previousQuantity,
                        'deducted_quantity' => $totalQuantityToDeduct,
                        'remaining_quantity' => $newQuantity,
                        'orders_count' => count($entry['orders']),
                    ];

                    InventoryLog::create([
                        'product_name' => $product->name,
                        'product_code' => $product->code,
                        'quantity_added' => -1 * $totalQuantityToDeduct,
                        'remaining_qnty' => $newQuantity,
                        'added_by' => $user?->name ?? 'System',
                        'product_unit_id' => $product->unit_id,
                        'date_added' => now(),
                    ]);

                    foreach ($entry['orders'] as $order) {
                        $order->forceFill([
                            'inventory_deducted_at' => now(),
                            'inventory_deducted_by' => $user?->id,
                            'inventory_product_id' => $product->id,
                        ])->save();
                    }
                }
            });

            // Send WhatsApp notifications
            Log::info('Starting deduction notifications for countries: ' . implode(', ', $countriesInvolved));
            
            foreach ($countriesInvolved as $country) {
                $deductionSummary['country'] = $country;
                
                $operationsUsers = $this->getOperationsUsersByCountry($country);
                
                if ($operationsUsers->isEmpty()) {
                    Log::warning("No operations users found for country: {$country}");
                    continue;
                }
                
                $message = $this->createDeductionMessage($deductionSummary, $merchant, $country);
                
                foreach ($operationsUsers as $operationsUser) {
                    try {
                        $phone = $this->cleanPhoneNumber($operationsUser->store_phone);
                        
                        Log::info('Attempting to send notification', [
                            'user' => $operationsUser->name,
                            'original_phone' => $operationsUser->store_phone,
                            'cleaned_phone' => $phone,
                        ]);
                        
                        $result = $this->sendViaOpenWAKenya($phone, $message);
                        
                        Whatsapp::create([
                            'to' => $result['to'],
                            'client_name' => $operationsUser->name ?? 'Operations User',
                            'store_name' => $country,
                            'cc_agents' => null,
                            'message' => $message,
                            'status' => 'sent',
                            'sid' => $result['message_id'],
                        ]);
                        
                        Log::info('✅ Deduction notification sent', [
                            'user' => $operationsUser->name,
                            'phone' => $phone,
                            'message_id' => $result['message_id'],
                        ]);
                        
                    } catch (\Exception $e) {
                        Log::error('❌ Failed to send notification', [
                            'user' => $operationsUser->name,
                            'phone' => $operationsUser->store_phone,
                            'error' => $e->getMessage(),
                        ]);
                    }
                }
            }

        } catch (\Throwable $exception) {
            Log::error('Inventory deduction failed', [
                'error' => $exception->getMessage(),
                'user_id' => $user?->id,
                'merchant' => $merchant
            ]);
            
            return back()->withErrors([
                'deductions' => $exception->getMessage(),
            ]);
        }

        return back()->with('success', $deductions->count() . ' order(s) deducted successfully.');
    }
}