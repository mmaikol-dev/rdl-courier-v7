<?php

namespace App\Services;

use App\Models\Product;
use App\Models\User;
use App\Models\Whatsapp;
use App\Support\CountryAccess;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ProductStockAlertService
{
    public function maybeSend(Product $product, int $previousQuantity, int $newQuantity, ?string $context = null): void
    {
        $alertThreshold = (int) ($product->quantity_alert ?? 0);

        if ($alertThreshold <= 0) {
            return;
        }

        if (! ($newQuantity <= $alertThreshold && $newQuantity < $previousQuantity)) {
            return;
        }

        $phones = $this->alertPhones($product);

        if ($phones === []) {
            Log::warning('Low stock alert skipped: no alert phones found for roles.', [
                'product_id' => $product->id,
                'product_code' => $product->code,
            ]);
            return;
        }

        $message = $this->buildMessage($product, $newQuantity, $alertThreshold, $context);
        $country = $product->country ?? 'Kenya';

        foreach ($phones as $phone) {
            try {
                $result = $this->sendViaOpenWAKenya($phone, $message);
                
                Whatsapp::create([
                    'to' => $result['to'],
                    'client_name' => 'Stock Alert',
                    'store_name' => $country,
                    'cc_agents' => null,
                    'message' => $message,
                    'status' => 'sent',
                    'sid' => $result['message_id'],
                ]);
                
                Log::info('Low stock alert sent via OpenWA Kenya.', [
                    'product_id' => $product->id,
                    'to' => $result['to'] ?? $phone,
                    'message_id' => $result['message_id'] ?? null,
                ]);
            } catch (\Throwable $e) {
                Log::error('Low stock alert failed.', [
                    'product_id' => $product->id,
                    'phone' => $phone,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }

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

        $cleanPhone = $this->cleanPhoneNumber($phoneNumber);
        if (!$cleanPhone) {
            throw new \Exception("Invalid phone number format: {$phoneNumber}");
        }

        $chatId = $cleanPhone . '@c.us';
        $url = rtrim($baseUrl, '/') . "/api/sessions/{$sessionId}/messages/send-text";

        Log::info('Sending stock alert via OpenWA Kenya', [
            'chatId' => $chatId,
        ]);

        $response = Http::withHeaders($this->openwaHeaders($apiKey))
            ->timeout(30)
            ->post($url, [
                'chatId' => $chatId,
                'text' => $message,
            ]);

        if (!$response->successful()) {
            throw new \Exception('OpenWA Kenya request failed with status ' . $response->status() . ': ' . $response->body());
        }

        $data = $response->json();
        if (empty($data['messageId'])) {
            throw new \Exception('OpenWA Kenya did not return a valid messageId');
        }

        return [
            'provider' => 'openwa_kenya',
            'to' => $chatId,
            'message_id' => $data['messageId'],
        ];
    }

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

    private function cleanPhoneNumber(?string $phoneNumber): ?string
    {
        if (!$phoneNumber) return null;
        
        $phone = preg_replace('/\D/', '', $phoneNumber);
        
        return (strlen($phone) >= 9) ? $phone : null;
    }

    private function alertPhones(Product $product): array
    {
        $globalRole = 'g.o.d';
        $scopedRoles = ['operations', 'finance', 'warehouse', 'merchant'];
        $phones = collect();

        $globalPhones = User::query()
            ->whereNotNull('store_phone')
            ->where('store_phone', '!=', '')
            ->whereRaw('LOWER(TRIM(roles)) = ?', [$globalRole])
            ->pluck('store_phone')
            ->map(fn ($phone) => $this->cleanPhoneNumber((string) $phone))
            ->filter();

        $phones = $phones->merge($globalPhones);

        $countryName = CountryAccess::normalizeCountryName($product->country);

        if ($countryName) {
            $scopedPhones = User::query()
                ->whereNotNull('store_phone')
                ->where('store_phone', '!=', '')
                ->whereIn(DB::raw('LOWER(TRIM(roles))'), $scopedRoles)
                ->where(function($query) use ($countryName) {
                    $query->whereRaw('LOWER(store_address) LIKE ?', ['%' . strtolower($countryName) . '%'])
                        ->orWhereRaw('JSON_EXTRACT(store_address, "$.country") LIKE ?', ['%' . strtolower($countryName) . '%']);
                })
                ->pluck('store_phone')
                ->map(fn ($phone) => $this->cleanPhoneNumber((string) $phone))
                ->filter();

            $phones = $phones->merge($scopedPhones);
        }

        $phones = $phones->unique()->values()->all();

        return $phones;
    }

    private function buildMessage(Product $product, int $newQuantity, int $alertThreshold, ?string $context): string
    {
        $merchant = $product->merchant ?: $product->store_name ?: 'Unknown';
        $contextLine = $context ? "Context: {$context}\n" : '';

        return <<<MESSAGE
⚠️ LOW STOCK ALERT ⚠️

📦 Product: {$product->name}
🏷️ Code: {$product->code}
🧾 Merchant: {$merchant}
📉 Stock: {$newQuantity}
🚨 Alert Level: {$alertThreshold}
{$contextLine}
Please restock as soon as possible.
MESSAGE;
    }
}