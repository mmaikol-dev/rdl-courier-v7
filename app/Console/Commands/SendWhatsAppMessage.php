<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;
use App\Models\Whatsapp;
use App\Models\SheetOrder;
use App\Services\WhatsAppFallbackService;
use Carbon\Carbon;
use Exception;

class SendWhatsAppMessage extends Command
{
    protected $signature = 'whatsapp:send-meta';
    protected $description = 'Send WhatsApp messages via WasenderAPI for scheduled orders today';

    /**
     * Country name → country code mapping.
     */
    private function getCountryCode(string $country): string
    {
        return match(strtolower(trim($country))) {
            'kenya'    => '254',
            'tanzania' => '255',
            'uganda'   => '256',
            'zambia'   => '260',
            default    => '254',
        };
    }

    /**
     * Country code → OpenWA session ID mapping.
     * Returns null if the session is not configured in .env.
     */
    private function getSessionForCountry(string $countryCode): ?string
    {
        $session = match($countryCode) {
            '254' => env('OPENWA_SESSION_KENYA',    null),
            '255' => env('OPENWA_SESSION_TANZANIA', null),
            '256' => env('OPENWA_SESSION_UGANDA',   null),
            '260' => env('OPENWA_SESSION_ZAMBIA',   null),
            default => null,
        };

        return !empty($session) ? $session : null;
    }

    /**
     * Country code → currency mapping.
     */
    private function getCurrencyForCountry(string $countryCode): string
    {
        return match($countryCode) {
            '254' => 'KES',
            '255' => 'TZS',
            '256' => 'UGX',
            '260' => 'ZMW',
            default => 'KES',
        };
    }

    /**
     * Country code → contact number mapping.
     * Update each when the branch opens.
     */
    private function getContactForCountry(string $countryCode): string
    {
        return match($countryCode) {
            '254' => '0740801187', // Kenya
            '255' => '0740801187', // Tanzania — update when branch opens
            '256' => '0740801187', // Uganda — update when branch opens
            '260' => '0740801187', // Zambia — update when branch opens
            default => '0740801187',
        };
    }

    public function handle()
    {
        Log::info('🚀 Starting SendWhatsAppMessage command via WasenderAPI');

        $today = Carbon::today();

        $orders = SheetOrder::where('status', 'Scheduled')
            ->whereDate('delivery_date', $today)
            ->get();

        if ($orders->isEmpty()) {
            Log::info('📭 No scheduled orders found for today.');
            $this->info('No scheduled orders found for today.');
            return;
        }

        $this->info("📦 Found {$orders->count()} orders to process.");

        $sender = app(WhatsAppFallbackService::class);

        foreach ($orders as $order) {
            try {
                $client_name  = $order->client_name ?? 'Client';
                $order_no     = $order->order_no;
                $product_name = $order->product_name;
                $quantity     = $order->quantity;
                $amount       = $order->amount;
                $cc_email     = $order->cc_email ?? null;

                // Derive everything from country
                $country     = $order->country ?? 'kenya';
                $countryCode = $this->getCountryCode($country);

                // Skip if no OpenWA session is configured for this country
                if ($this->getSessionForCountry($countryCode) === null) {
                    Log::warning("⏭️ Skipping order {$order_no} — no OpenWA session configured for country: {$country} ({$countryCode})");
                    $this->warn("⏭️ Skipping order {$order_no} — no OpenWA session for {$country}.");
                    continue;
                }

                $phone = $this->formatPhoneForWasender($order->phone, $countryCode);

                if (!$phone) {
                    Log::warning("⚠️ Invalid phone number for order {$order_no}, trying alt number.");
                    $phone = $this->formatPhoneForWasender($order->alt_no ?? null, $countryCode);
                }

                if (!$phone) {
                    Log::error("❌ No valid phone number for order {$order_no}. Skipping.");
                    $this->error("❌ Skipping order {$order_no} — no valid phone number.");
                    continue;
                }

                $message = $this->createOrderMessage(
                    $client_name,
                    $order_no,
                    $product_name,
                    $quantity,
                    $amount,
                    $countryCode
                );

                Log::info("📤 Sending message to {$phone} for order {$order_no}", [
                    'country'      => $country,
                    'country_code' => $countryCode,
                ]);

                $options = ['country_code' => $countryCode];

                $result = $this->sendWithFallback($sender, $phone, $message, $options);

                Log::info("✅ WhatsApp send response for order {$order_no}:", [
                    'provider'   => $result['provider'],
                    'to'         => $result['to'],
                    'message_id' => $result['message_id'],
                ]);

                Whatsapp::create([
                    'to'          => $result['to'],
                    'client_name' => $client_name,
                    'store_name'  => $country,
                    'cc_agents'   => $cc_email,
                    'message'     => $message,
                    'status'      => 'sent',
                    'sid'         => $result['message_id'],
                ]);

                $this->info("✅ Message sent to {$phone} for order {$order_no} via {$result['provider']}");

                $delay = rand(30, 45);
                Log::info("⏳ Waiting {$delay}s before next message...");
                $this->info("⏳ Waiting {$delay}s...");
                sleep($delay);

            } catch (Exception $e) {
                Log::error("❌ All WhatsApp providers failed for order {$order->order_no}", [
                    'error' => $e->getMessage(),
                    'phone' => $order->phone,
                ]);

                Whatsapp::create([
                    'to'          => $order->phone,
                    'client_name' => $order->client_name ?? 'Client',
                    'store_name'  => $order->country ?? 'unknown',
                    'cc_agents'   => $order->cc_email ?? null,
                    'message'     => "Order {$order->order_no} — message failed to send.",
                    'status'      => 'failed',
                    'sid'         => null,
                ]);

                $this->error("❌ All providers failed: " . $e->getMessage());
            }
        }

        Log::info('🏁 SendWhatsAppMessage command completed.');
        $this->info('🏁 Done!');
    }

    /**
     * Try primary provider first, fall back to OpenWA if it fails.
     */
    private function sendWithFallback(WhatsAppFallbackService $sender, string $to, string $message, array $options = []): array
    {
        try {
            $result = $sender->sendText($to, $message, $options);

            $isError = $result['response']['success'] ?? null;
            if ($isError === false) {
                Log::warning('Primary WhatsApp provider returned explicit error, falling back to OpenWA', [
                    'error_message' => $result['response']['message'] ?? 'Unknown error',
                    'to'            => $to,
                ]);
                throw new Exception('Primary provider error: ' . ($result['response']['message'] ?? ''));
            }

            if (empty($result['message_id'])) {
                Log::warning('Primary provider succeeded but returned no message_id. Proceeding.', ['to' => $to]);
            }

            return $result;

        } catch (\Throwable $e) {
            Log::warning('Primary provider failed, switching to OpenWA fallback', [
                'error' => $e->getMessage(),
                'to'    => $to,
            ]);

            return $this->sendViaOpenWA($to, $message, $options);
        }
    }

    /**
     * Send via self-hosted OpenWA/WaZuri, routing to the correct
     * session based on country code.
     */
    private function sendViaOpenWA(string $to, string $message, array $options = []): array
    {
        $countryCode = $options['country_code'] ?? '254';
        $sessionId   = $this->getSessionForCountry($countryCode);
        $baseUrl     = config('services.openwa.base_url', env('OPENWA_BASE_URL', 'https://api.sitebase.co.ke'));
        $apiKey      = config('services.openwa.api_key',  env('OPENWA_API_KEY',  ''));

        if ($sessionId === null) {
            Log::warning("⏭️ OpenWA fallback skipped — no session configured for country code {$countryCode}");
            throw new Exception("No OpenWA session configured for country code {$countryCode}. Skipping order.");
        }

        $chatId = ltrim($to, '+') . '@c.us';
        $url    = rtrim($baseUrl, '/') . "/api/sessions/{$sessionId}/messages/send-text";

        Log::info('Attempting OpenWA fallback', [
            'url'          => $url,
            'chatId'       => $chatId,
            'country_code' => $countryCode,
        ]);

        $response = Http::withHeaders([
            'X-API-Key'    => $apiKey,
            'Content-Type' => 'application/json',
        ])->post($url, [
            'chatId' => $chatId,
            'text'   => $message,
        ]);

        Log::info('OpenWA fallback response', [
            'status' => $response->status(),
            'body'   => $response->body(),
        ]);

        if (!$response->successful()) {
            throw new Exception('All WhatsApp providers failed. OpenWA returned: ' . $response->body());
        }

        $data = $response->json();

        if (empty($data['messageId'])) {
            throw new Exception('OpenWA fallback did not return a valid messageId');
        }

        Log::info('✅ Message sent via OpenWA fallback', [
            'to'        => $chatId,
            'messageId' => $data['messageId'],
            'country'   => $countryCode,
        ]);

        return [
            'provider'   => 'openwa',
            'to'         => $chatId,
            'message_id' => $data['messageId'],
        ];
    }

    /**
     * Format phone number for WasenderAPI (digits only, no + prefix).
     */
    private function formatPhoneForWasender(?string $phoneNumber, string $countryCode): ?string
    {
        if (!$phoneNumber) return null;

        $phone = preg_replace('/\D/', '', $phoneNumber);

        if (!$phone || strlen($phone) < 9) {
            return null;
        }

        if (!preg_match('/^(254|255|256|260)/', $phone)) {
            if (substr($phone, 0, 1) === '0') {
                $phone = $countryCode . substr($phone, 1);
            } else {
                $phone = $countryCode . $phone;
            }
        }

        if (strlen($phone) >= 12 && strlen($phone) <= 13) {
            return $phone;
        }

        return null;
    }

    /**
     * Build the order notification message.
     */
    private function createOrderMessage(
        string $clientName,
        string $orderNo,
        string $productName,
        $quantity,
        $amount,
        string $countryCode
    ): string {
        $currency        = $this->getCurrencyForCountry($countryCode);
        $formattedAmount = number_format($amount);
        $contactNumber   = $this->getContactForCountry($countryCode);

        return <<<MESSAGE
*REALDEAL LOGISTICS - DELIVERY REMINDER*

Hi {$clientName}, this is Realdeal Logistics.

Your order *{$orderNo}* for *{$productName}* ({$quantity} pcs) worth *{$currency} {$formattedAmount}* is scheduled for delivery *TODAY*.

📞 *Please call us on {$contactNumber}* to confirm your availability for delivery.

Thank you for choosing Realdeal Logistics!

_Delivering Excellence, Every Time._
MESSAGE;
    }
}