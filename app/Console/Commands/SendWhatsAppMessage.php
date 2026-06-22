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
    protected $description = 'Send WhatsApp messages via WasenderAPI with stealth enhancements';

    private array $messageTemplates = [];

    public function __construct()
    {
        parent::__construct();
        $this->initMessageTemplates();
    }

    // -----------------------------------------------------------------
    //  Country helpers
    // -----------------------------------------------------------------
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

    private function getContactForCountry(string $countryCode): string
    {
        return match($countryCode) {
            '254' => '254740801187',
            '255' => '255614924382',
            '256' => '256701600293',
            '260' => '0740801187',
            default => '0740801187',
        };
    }

    // -----------------------------------------------------------------
    //  Message templates (pool of variations)
    // -----------------------------------------------------------------
    private function initMessageTemplates(): void
    {
$this->messageTemplates = [
    "*REALDEAL LOGISTICS - DELIVERY REMINDER*\n\nHi {name}, this is Realdeal Logistics.\nYour order *{order}* for *{product}* ({qty} pcs) worth *{currency} {amount}* is scheduled for delivery *TODAY*.\n📞 *Please call us on {contact}* to confirm your availability.\nThank you for choosing Realdeal Logistics!\n_Delivering Excellence, Every Time._",

    "Hi {name} 👋\nRealdeal Logistics here! Just a quick heads‑up:\nYour order *{order}* ({product}, {qty} pcs, {currency} {amount}) is arriving *TODAY*.\nKindly confirm your availability by calling {contact}.\nCheers,\nRealdeal Team",

    "⚠️ *DELIVERY TODAY* ⚠️\nDear {name},\nOrder *{order}* – {product} ({qty} pcs) worth {currency} {amount} will be delivered *today*. Please call {contact} immediately to confirm you'll be available.\n- Realdeal Logistics",

    "Hi {name}, your order {order} ({product}) is on its way *TODAY*. Call us on {contact} to confirm receipt. Thanks! – Realdeal Logistics",

    "Good news, {name}! 🚚\nYour {product} order (No. {order}) is out for delivery today. Value: {currency} {amount}.\nPlease call {contact} to confirm you're ready to receive it.\nWarm regards,\nRealdeal Logistics",

    "Dear {name},\nWe are pleased to inform you that your order {order} ({product}, {qty} pieces) will be delivered today. Kindly call {contact} to confirm your availability.\nSincerely,\nRealdeal Logistics",

    "Hello {name}, Realdeal Logistics here.\nYour delivery for order #{order} ({product}) is scheduled for today. Please confirm by calling {contact}.\nThank you!",

    "Hi {name}! This is a friendly reminder from Realdeal Logistics:\nOrder *{order}* ({product}, {qty} pcs) arrives TODAY. Call {contact} to confirm.\nHave a great day!",

    "🚚 *Delivery Alert*\n\nDear {name},\nYour order *{order}* containing {product} (Qty: {qty}) with value {currency} {amount} is out for delivery today.\nPlease call our team at {contact} to ensure you're available to receive it.\nThank you for your trust.\n- Realdeal Logistics",

    "Dear {name},\nWe are reaching out regarding your order {order} ({product}). It is due for delivery today.\nTo confirm your availability, kindly call us on {contact} at your earliest convenience.\nRegards,\nRealdeal Logistics",

    "Hello {name},\nThis is Realdeal Logistics with an update:\n\n📦 Order: {order}\n📦 Product: {product}\n📦 Quantity: {qty}\n💰 Value: {currency} {amount}\n\nDelivery is scheduled for TODAY. Please call {contact} to confirm.\nThank you!",

    "🎉 *Delivery Day!* 🎉\nHi {name},\nYour {product} (Order {order}) is on the way! 🚛\n💰 {currency} {amount}\n📞 Call us at {contact} to confirm you're ready.\n- Realdeal Logistics 🚚",

    "Realdeal Logistics: Order {order} ({product}) will be delivered today. Confirm availability: {contact}",

    "Hello {name},\nJust a reminder that your order {order} ({product}) is out for delivery today. Please call {contact} to confirm.\nThanks,\nRealdeal Logistics",

    "Hi {name},\nRealdeal Logistics here. Your package ({product}) with order no. {order} is scheduled for delivery today.\nPlease call {contact} to let us know you're available.\nKind regards.",

    "Greetings {name},\nYour order *{order}* ({product}) worth {currency} {amount} is arriving today. Contact {contact} to confirm.\nBest,\nRealdeal",

    "📢 Delivery Notice\nHello {name},\nOrder {order} ({product}, qty {qty}) will be delivered today.\nPlease call {contact} to confirm.\nThank you.",

    "Hey {name},\nYour {product} (order {order}) is coming today! 🚚\nWorth: {currency} {amount}\nCall {contact} to confirm you'll be around.\nCheers,\nRealdeal",

    "Dear {name},\nThis is to inform you that your order {order} for {product} will be delivered today. Please call {contact} to ensure someone is available to receive it.\nYours sincerely,\nRealdeal Logistics",

    "Hello {name},\nRealdeal Logistics delivery update:\nOrder: {order}\nProduct: {product}\nQty: {qty}\nValue: {currency} {amount}\nCall {contact} to confirm availability.\nThank you.",

    "Good day {name},\nYour order {order} ({product}) is scheduled for delivery today. Please contact us on {contact} to confirm.\nRegards,\nRealdeal Logistics",

    "Hi {name},\nYour shipment for order {order} ({product}) is on the road today. Call {contact} to confirm receipt.\n- Realdeal",

    "🗓 Delivery Today\n{name}, order {order} containing {product} (x{qty}) arrives today. Value {currency} {amount}. Confirm by calling {contact}.",

    "Dear customer {name},\nYour order {order} – {product} ({qty} units) – will be delivered today. Kindly call {contact} to confirm.\nThank you,\nRealdeal Logistics",

    "Hello {name},\nRealdeal Logistics here. This is your delivery reminder for order {order} ({product}). Call us at {contact} to confirm availability.\nHave a wonderful day!",

    "Hi {name},\nYour order #{order} ({product}) is due for delivery today. Please call {contact} to ensure you'll be available.\nThanks,\nRealdeal Team",

    "Dear {name},\nYour delivery of {product} (order {order}, value {currency} {amount}) is scheduled for today. Please confirm by calling {contact}.\nBest regards,\nRealdeal Logistics",

    "Reminder: {name}, your order {order} ({product}) will be delivered today. Call {contact} to confirm. - Realdeal",

    "Hello {name},\nYour package ({product}) from order {order} is on its way today! 🚀\nPlease call {contact} to confirm.\n- Realdeal",

    "Hi {name}! 👋\nRealdeal Logistics here with a quick delivery update:\nYour {product} (Order {order}, Qty: {qty}) is out for delivery today.\nCall {contact} to confirm.\nCheers!",

    "Dear {name},\nWe are happy to let you know that your order {order} ({product}) is being delivered today.\nPlease call {contact} to confirm your availability.\nThank you,\nRealdeal Logistics",

    "Hello {name},\nYour order {order} ({product}) worth {currency} {amount} is arriving today. Please confirm by calling {contact}.\nThank you,\nRealdeal Logistics",

    "Hi {name},\nThis is Realdeal Logistics. Your order {order} ({product}, qty {qty}) is scheduled for delivery today. Call {contact} to confirm.\nThanks!",

    "Hey {name},\nJust a heads-up: your {product} (Order {order}) arrives today! Call {contact} to confirm.\n- Realdeal",

    "Dear {name},\nYour order {order} ({product}) is due for delivery today. Please call {contact} to confirm.\nSincerely,\nRealdeal Logistics",

    "🚛 Out for Delivery\n{name}, order {order} ({product}) is on its way. Value {currency} {amount}. Confirm via {contact}.",

    "Hello {name},\nRealdeal Logistics here. Your delivery for {product} (order {order}) is happening today. Please call {contact}.\nBest regards.",

    "Hi {name},\nReminder: your order {order} ({product}) will be delivered today. Call {contact} to confirm.\nThank you,\nRealdeal",

    "Dear {name},\nWe are delivering your order {order} ({product}) today. Please contact us on {contact} to confirm availability.\nKind regards,\nRealdeal Logistics",

    "📦 Delivery Today!\n{name}, your order {order} ({product}) worth {currency} {amount} is arriving. Call {contact} to confirm.\n- Realdeal Logistics",

    "Hello {name},\nYour {product} (order {order}, qty {qty}) is on delivery today. Confirm via {contact}.\nThanks.",

    "Hi {name},\nRealdeal Logistics delivery alert: Order {order} ({product}) is scheduled today. Call {contact} to confirm.\nCheers!",

    "Dear {name},\nYour order {order} for {product} will be delivered today. Please call {contact} to ensure a smooth delivery.\nThank you,\nRealdeal",

    "Hello {name},\nDelivery notice: Your order {order} ({product}) is out today. Please confirm by calling {contact}.\nRegards,\nRealdeal Logistics",

    "Hi {name},\nYour order {order} ({product}) is scheduled for delivery today. Call {contact} to confirm receipt.\n- Realdeal Logistics",

    "Hey {name},\nYour {product} (order {order}) is arriving today! 🎉 Call {contact} to confirm.\nThanks!",

    "Dear {name},\nWe are pleased to deliver your order {order} ({product}) today. Please call {contact} to confirm.\nWarmly,\nRealdeal Logistics",

    "Hello {name},\nYour shipment of {product} (order {order}) is on its way today. Call {contact} to confirm.\nThank you!",

    "Hi {name},\nDelivery today: Order {order} ({product}). Please call {contact} to confirm availability.\n- Realdeal",

    "Realdeal Logistics: {name}, your order {order} ({product}) will arrive today. Confirm: {contact}",
];
    }

    private function createOrderMessage(
        string $clientName,
        string $orderNo,
        string $productName,
        $quantity,
        $amount,
        string $countryCode
    ): string {
        $currency = $this->getCurrencyForCountry($countryCode);
        $formattedAmount = number_format($amount);
        $contactNumber = $this->getContactForCountry($countryCode);

        $template = $this->messageTemplates[array_rand($this->messageTemplates)];

        $replacements = [
            '{name}'     => $clientName,
            '{order}'    => $orderNo,
            '{product}'  => $productName,
            '{qty}'      => $quantity,
            '{currency}' => $currency,
            '{amount}'   => $formattedAmount,
            '{contact}'  => $contactNumber,
        ];

        return str_replace(array_keys($replacements), array_values($replacements), $template);
    }

    // -----------------------------------------------------------------
    //  Human‑like delay (log‑normal distribution)
    // -----------------------------------------------------------------
    private function humanDelay(): int
    {
        // Log‑normal params: median ~35s, range ~10–120s
        $delay = (int) round(exp(log(35) + (random_int(-100, 100) / 300.0)));
        return max(10, min(120, $delay));
    }

    // -----------------------------------------------------------------
    //  Command entry point
    // -----------------------------------------------------------------
   public function handle()
{
    Log::info('🚀 Starting SendWhatsAppMessage command (stealth mode)');

    $today = Carbon::today();
    $orders = SheetOrder::where('status', 'Scheduled')
        ->whereDate('delivery_date', $today)
        ->get();

    if ($orders->isEmpty()) {
        Log::info('📭 No scheduled orders for today.');
        $this->info('No scheduled orders for today.');
        return;
    }

    $this->info("📦 Found {$orders->count()} orders to process.");
    $sender = app(WhatsAppFallbackService::class);

    // Track sent messages per country (keyed by country code)
    $sentCount = [];
    $limitPerCountry = 12;   // safe daily limit per session

    $count = 0;
    foreach ($orders as $order) {
        try {
            $client_name  = $order->client_name ?? 'Client';
            $order_no     = $order->order_no;
            $product_name = $order->product_name;
            $quantity     = $order->quantity;
            $amount       = $order->amount;
            $cc_email     = $order->cc_email ?? null;

            $country     = $order->country ?? 'kenya';
            $countryCode = $this->getCountryCode($country);

            // --- Check per‑country limit ---
            if (isset($sentCount[$countryCode]) && $sentCount[$countryCode] >= $limitPerCountry) {
                Log::info("⏭️ Limit of {$limitPerCountry} reached for country {$country} ({$countryCode}). Skipping order {$order_no}.");
                $this->warn("⏭️ Skipping order {$order_no} – country limit reached.");
                continue;
            }

            // Skip if no OpenWA session configured (but still allow primary API)
            if ($this->getSessionForCountry($countryCode) === null) {
                Log::warning("⏭️ No OpenWA session for {$country} – will only try primary.");
            }

            $phone = $this->formatPhoneForWasender($order->phone, $countryCode);
            if (!$phone) {
                $phone = $this->formatPhoneForWasender($order->alt_no ?? null, $countryCode);
            }
            if (!$phone) {
                Log::error("❌ No valid phone for order {$order_no}. Skipping.");
                $this->error("❌ Skipping order {$order_no} – no phone.");
                continue;
            }

            $message = $this->createOrderMessage($client_name, $order_no, $product_name, $quantity, $amount, $countryCode);

            Log::info("📤 Sending to {$phone} for order {$order_no}", ['country' => $country]);

            $options = ['country_code' => $countryCode];
            $result = $this->sendWithFallback($sender, $phone, $message, $options);

            Log::info("✅ Sent for order {$order_no} via {$result['provider']}", [
                'to'         => $result['to'],
                'message_id' => $result['message_id'] ?? 'N/A',
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

            // --- Increment the counter for this country ---
            $sentCount[$countryCode] = ($sentCount[$countryCode] ?? 0) + 1;

            $this->info("✅ Order {$order_no} sent via {$result['provider']}");

            // ---- Stealth: human delay ----
            $delay = $this->humanDelay();
            Log::info("⏳ Sleeping {$delay}s before next message...");
            $this->info("⏳ Waiting {$delay}s...");
            sleep($delay);

            $count++;
            // Every 5 messages, take a longer break (2–5 minutes)
            if ($count % 5 === 0) {
                $longPause = random_int(120, 300);
                Log::info("⏸️ Long pause {$longPause}s after 5 messages.");
                $this->info("⏸️ Long pause {$longPause}s...");
                sleep($longPause);
            }

        } catch (Exception $e) {
            Log::error("❌ Failed for order {$order->order_no}: " . $e->getMessage());
            Whatsapp::create([
                'to'          => $order->phone,
                'client_name' => $order->client_name ?? 'Client',
                'store_name'  => $order->country ?? 'unknown',
                'cc_agents'   => $order->cc_email ?? null,
                'message'     => "Order {$order->order_no} — message failed.",
                'status'      => 'failed',
                'sid'         => null,
            ]);
            $this->error("❌ Failed: " . $e->getMessage());
        }
    }

    Log::info('🏁 Command finished.');
    $this->info('🏁 Done!');
}
    // -----------------------------------------------------------------
    //  Fallback logic – toggleable via env
    // -----------------------------------------------------------------
    private function sendWithFallback(WhatsAppFallbackService $sender, string $to, string $message, array $options = []): array
    {
        try {
            $result = $sender->sendText($to, $message, $options);

            $isError = $result['response']['success'] ?? null;
            if ($isError === false) {
                Log::warning('Primary provider explicit error', [
                    'message' => $result['response']['message'] ?? '',
                ]);
                throw new Exception('Primary error');
            }

            return $result;
        } catch (\Throwable $e) {
            Log::warning('Primary failed: ' . $e->getMessage());

            // Default fallback enabled = true (since you haven't paid for Wasender yet)
            if (!env('OPENWA_FALLBACK_ENABLED', true)) {
                throw new Exception('OpenWA fallback disabled. Primary failed.');
            }

            return $this->sendViaOpenWA($to, $message, $options);
        }
    }

    // -----------------------------------------------------------------
    //  OpenWA sender with obfuscated headers
    // -----------------------------------------------------------------
    private function sendViaOpenWA(string $to, string $message, array $options = []): array
    {
        $countryCode = $options['country_code'] ?? '254';
        $sessionId   = $this->getSessionForCountry($countryCode);
        $baseUrl     = config('services.openwa.base_url', env('OPENWA_BASE_URL', 'https://api.sitebase.co.ke'));
        $apiKey      = config('services.openwa.api_key',  env('OPENWA_API_KEY',  ''));

        if ($sessionId === null) {
            throw new Exception("No OpenWA session for {$countryCode}");
        }

        $chatId = ltrim($to, '+') . '@c.us';
        $url    = rtrim($baseUrl, '/') . "/api/sessions/{$sessionId}/messages/send-text";

        $response = Http::withHeaders($this->openwaHeaders($apiKey))->post($url, [
            'chatId' => $chatId,
            'text'   => $message,
        ]);

        if (!$response->successful()) {
            throw new Exception('OpenWA failed: ' . $response->body());
        }

        $data = $response->json();
        if (empty($data['messageId'])) {
            throw new Exception('No messageId from OpenWA');
        }

        return [
            'provider'   => 'openwa',
            'to'         => $chatId,
            'message_id' => $data['messageId'],
        ];
    }

    /**
     * Headers that mimic official WhatsApp Web traffic.
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

    // -----------------------------------------------------------------
    //  Phone formatting
    // -----------------------------------------------------------------
    private function formatPhoneForWasender(?string $phoneNumber, string $countryCode): ?string
    {
        if (!$phoneNumber) return null;
        $phone = preg_replace('/\D/', '', $phoneNumber);
        if (!$phone || strlen($phone) < 9) return null;

        if (!preg_match('/^(254|255|256|260)/', $phone)) {
            $phone = (substr($phone, 0, 1) === '0')
                ? $countryCode . substr($phone, 1)
                : $countryCode . $phone;
        }

        return (strlen($phone) >= 12 && strlen($phone) <= 13) ? $phone : null;
    }
}