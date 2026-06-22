<?php

namespace App\Http\Controllers;

use App\Models\SheetOrder;
use App\Models\User;
use App\Models\Whatsapp;
use App\Services\WhatsAppFallbackService;
use Illuminate\Support\Facades\Http;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class WhatsappController extends Controller
{
    private WhatsAppFallbackService $whatsAppService;

    // -----------------------------------------------------------------
    //  Message templates – pool of variations
    // -----------------------------------------------------------------
    private array $messageTemplates = [];

    public function __construct(WhatsAppFallbackService $whatsAppService)
    {
        $this->whatsAppService = $whatsAppService;
        $this->initMessageTemplates();
    }

    private function initMessageTemplates(): void
    {
        $this->messageTemplates = [
            // Variation 1 – original "unreachable" style
            "*REALDEAL LOGISTICS - ORDER NOTIFICATION*\n\nHello {name},\n\nWe tried contacting you regarding your order *{order}* but your phone was unreachable.\n\n*Order Details:*\n📦 Product: {product}\n🔢 Quantity: {qty} pcs\n💰 Amount: {currency} {amount}\n\n*Please call us back on {contact}* to confirm your availability for delivery.\n\nThank you for choosing Realdeal Logistics!\n\n_Delivering Excellence, Every Time._",

            // Variation 2 – friendly reminder
            "Hi {name} 👋\n\nRealdeal Logistics here! We missed you on your phone and wanted to follow up about your order *{order}* ({product}, {qty} pcs, {currency} {amount}).\n\nPlease call us on {contact} when you're free so we can arrange delivery.\n\nCheers,\nRealdeal Team",

            // Variation 3 – urgent
            "⚠️ *URGENT: ORDER PENDING* ⚠️\n\nDear {name},\n\nYour order *{order}* – {product} ({qty} pcs) worth {currency} {amount} could not be delivered because we couldn't reach you.\n\nCall us immediately on {contact} to avoid delays.\n\n- Realdeal Logistics",

            // Variation 4 – short
            "Hi {name}, we tried calling about your order {order} ({product}). Please call us back on {contact} to confirm delivery. Thanks! – Realdeal Logistics",

            // Variation 5 – enthusiastic
            "Good news, {name}! 🚚\n\nYour {product} order (No. {order}) is ready for delivery. Value: {currency} {amount}.\n\nWe tried calling but missed you – please call us on {contact} when you're available.\n\nWarm regards,\nRealdeal Logistics",

            // Variation 6 – plain but polite
            "Dear {name},\n\nWe attempted to contact you regarding your order {order} ({product}, {qty} pieces). Kindly return our call on {contact} at your earliest convenience.\n\nSincerely,\nRealdeal Logistics",
        ];
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
    //  Message builder (uses random template)
    // -----------------------------------------------------------------
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
    //  Public endpoints
    // -----------------------------------------------------------------
    public function index() {}
    public function create() {}

    /**
     * Send a custom chat message (primary + fallback to OpenWA).
     */
    public function sendChat(Request $request)
    {
        Log::info("📤 Sending custom WhatsApp chat message", $request->all());

        try {
            $validated = $request->validate([
                'to'      => 'required|string',
                'message' => 'required|string|max:4096',
                'country' => 'nullable|string',
            ]);

            $to          = $validated['to'];
            $messageText = $validated['message'];
            $country     = $validated['country'] ?? 'kenya';
            $countryCode = $this->getCountryCode($country);

            $formattedPhone = $this->whatsAppService->formatForStorage($to, $countryCode);

            if (!$formattedPhone) {
                Log::error("❌ Invalid phone number format", ['to' => $to]);
                return response()->json([
                    'success' => false,
                    'error'   => 'Invalid phone number format'
                ], 400);
            }

            Log::info("📞 Formatted phone: {$formattedPhone}");

            $result = $this->sendWithFallback($formattedPhone, $messageText, [
                'country_code' => $countryCode,
            ]);

            Log::info('✅ WhatsApp send response', [
                'provider'   => $result['provider'],
                'to'         => $result['to'],
                'message_id' => $result['message_id'],
            ]);

            $messageId = $result['message_id'];

            $existingChat = Whatsapp::where('to', $to)
                ->orWhere('to', $formattedPhone)
                ->first();

            $clientName = $existingChat->client_name ?? 'Customer';
            $storeName  = $existingChat->store_name ?? $country;
            $ccAgents   = $existingChat->cc_agents ?? null;

            $whatsapp = Whatsapp::create([
                'to'          => $result['to'],
                'client_name' => $clientName,
                'store_name'  => $storeName,
                'cc_agents'   => $ccAgents,
                'message'     => $messageText,
                'status'      => 'sent',
                'sid'         => $messageId,
            ]);

            Log::info("💾 Message saved to database", [
                'id'  => $whatsapp->id,
                'to'  => $formattedPhone,
                'sid' => $messageId
            ]);

            return response()->json([
                'success'  => true,
                'message'  => 'Message sent successfully',
                'sid'      => $messageId,
                'provider' => $result['provider'],
                'data'     => $whatsapp
            ]);

        } catch (\Throwable $e) {
            Log::error("❌ WhatsApp provider error", [
                'error' => $e->getMessage(),
                'to'    => $request->to ?? 'unknown'
            ]);

            return response()->json([
                'success' => false,
                'error'   => 'Failed to send message: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Send an order notification (primary + fallback to OpenWA).
     */
    public function sendMessage($id)
    {
        Log::info("📤 Sending WhatsApp template for Order ID: $id");

        try {
            $order = SheetOrder::findOrFail($id);

            $client_name  = $order->client_name ?? 'Client';
            $order_no     = $order->order_no;
            $product_name = $order->product_name;
            $quantity     = $order->quantity;
            $amount       = $order->amount;
            $cc_email     = $order->cc_email ?? null;

            $country     = $order->country ?? 'kenya';
            $countryCode = $this->getCountryCode($country);

            Log::info("🔍 Order details", compact('client_name', 'country', 'countryCode', 'order_no', 'product_name', 'quantity', 'amount', 'cc_email'));

            // Only log a warning if no OpenWA session – still try primary provider
            if ($this->getSessionForCountry($countryCode) === null) {
                Log::warning("⏭️ No OpenWA session for {$country} ({$countryCode}) – will only try primary provider.");
            }

            $phone = $this->getPhoneNumberForWasenderAPI($order->phone, $order->alt_no, $countryCode);

            if (!$phone) {
                Log::error("❌ Invalid phone numbers", ['phone' => $order->phone, 'alt_no' => $order->alt_no]);
                return back()->with('error', 'Invalid phone number format ❌');
            }

            Log::info("📞 Phone formatted: {$phone}");

            // Use the new varied template
            $message = $this->createOrderMessage($client_name, $order_no, $product_name, $quantity, $amount, $countryCode);
            Log::info("📝 Message content: {$message}");

            $result = $this->sendWithFallback($phone, $message, [
                'country_code' => $countryCode,
            ]);

            Log::info('✅ WhatsApp send response for order message', [
                'provider'   => $result['provider'],
                'to'         => $result['to'],
                'message_id' => $result['message_id'],
            ]);

            $whatsapp = Whatsapp::create([
                'to'          => $result['to'],
                'client_name' => $client_name,
                'store_name'  => $country,
                'cc_agents'   => $cc_email,
                'message'     => $message,
                'status'      => 'sent',
                'sid'         => $result['message_id'],
            ]);

            Log::info("✅ Saved WhatsApp record: {$whatsapp->id}");

            return back()->with('success', 'WhatsApp message sent successfully ✅');

        } catch (\Throwable $e) {
            Log::error("❌ WhatsApp sending failed", [
                'error'    => $e->getMessage(),
                'order_id' => $id
            ]);

            return back()->with('error', 'Failed to send WhatsApp message: ' . $e->getMessage() . ' ❌');
        }
    }

    /**
     * Webhook handler (unchanged – receives incoming messages & status updates).
     */
    public function webhook(Request $request)
    {
        Log::info("📩 WasenderAPI Webhook received", $request->all());

        $data = $request->all();

        if (empty($data)) {
            Log::warning("⚠️ Empty webhook data received");
            return response()->json(['status' => 'no_data'], 200);
        }

        if (!isset($data['event'])) {
            Log::warning("⚠️ No 'event' field found in webhook data");
            return response()->json(['status' => 'no_event'], 200);
        }

        $event = $data['event'];
        Log::info("📋 Event Type: {$event}");

        if ($event === 'chats.update') {
            Log::info("💬 Processing CHATS.UPDATE event");

            $chats = $data['data']['chats'] ?? null;

            if (!$chats) {
                Log::warning("⚠️ No chats data found");
                return response()->json(['status' => 'no_chats'], 200);
            }

            $messages = $chats['messages'] ?? [];

            if (empty($messages)) {
                Log::warning("⚠️ No messages found in chats");
                return response()->json(['status' => 'no_messages'], 200);
            }

            foreach ($messages as $msgWrapper) {
                try {
                    $messageData = $msgWrapper['message'] ?? null;

                    if (!$messageData) {
                        Log::warning("⚠️ No message data in wrapper");
                        continue;
                    }

                    Log::info("📨 Processing message:", $messageData);

                    $key       = $messageData['key'] ?? [];
                    $messageId = $key['id'] ?? null;
                    $fromMe    = $key['fromMe'] ?? false;

                    if ($fromMe) {
                        Log::info("⏭️ Skipping outgoing message (fromMe: true)");
                        continue;
                    }

                    $from = $key['remoteJidAlt'] ?? $key['remoteJid'] ?? null;

                    if ($from && strpos($from, '@') !== false) {
                        $from = explode('@', $from)[0];
                    }

                    $pushName    = $messageData['pushName'] ?? 'UNKNOWN';
                    $messageBody = '';
                    $message     = $messageData['message'] ?? [];

                    if (isset($message['conversation'])) {
                        $messageBody = $message['conversation'];
                    } elseif (isset($message['extendedTextMessage']['text'])) {
                        $messageBody = $message['extendedTextMessage']['text'];
                    } elseif (isset($message['imageMessage'])) {
                        $caption     = $message['imageMessage']['caption'] ?? '';
                        $messageBody = '[Image received]' . ($caption ? ": {$caption}" : '');
                    } elseif (isset($message['videoMessage'])) {
                        $caption     = $message['videoMessage']['caption'] ?? '';
                        $messageBody = '[Video received]' . ($caption ? ": {$caption}" : '');
                    } elseif (isset($message['audioMessage'])) {
                        $messageBody = '[Audio received]';
                    } elseif (isset($message['documentMessage'])) {
                        $fileName    = $message['documentMessage']['fileName'] ?? 'document';
                        $messageBody = "[Document received: {$fileName}]";
                    } elseif (isset($message['stickerMessage'])) {
                        $messageBody = '[Sticker received]';
                    } else {
                        $messageBody = '[Unknown message type]';
                        Log::info("⚠️ Unknown message type:", array_keys($message));
                    }

                    if (!$from || !$messageId) {
                        Log::error("❌ Missing required fields", compact('from', 'messageId'));
                        continue;
                    }

                    $whatsapp = Whatsapp::create([
                        'to'          => $from,
                        'client_name' => $pushName,
                        'store_name'  => 'WEBHOOK',
                        'cc_agents'   => null,
                        'message'     => $messageBody,
                        'status'      => 'received',
                        'sid'         => $messageId,
                    ]);

                    Log::info("✅✅✅ MESSAGE SAVED SUCCESSFULLY!", [
                        'id'      => $whatsapp->id,
                        'from'    => $from,
                        'message' => $messageBody
                    ]);

                } catch (\Exception $e) {
                    Log::error("❌❌❌ Failed to process message", [
                        'error' => $e->getMessage(),
                        'trace' => $e->getTraceAsString()
                    ]);
                }
            }
        } elseif ($event === 'message.status' || $event === 'messages.update') {
            Log::info("📊 Processing STATUS UPDATE event");

            $statusData = $data['data'] ?? [];
            Log::info("📊 Status Data:", $statusData);

            $messageId  = $statusData['key']['id'] ?? null;
            $statusCode = $statusData['status'] ?? null;

            if ($messageId && $statusCode !== null) {
                $statusMap = [
                    0 => 'error',
                    1 => 'pending',
                    2 => 'sent',
                    3 => 'delivered',
                    4 => 'read',
                    5 => 'played',
                ];

                $statusText = $statusMap[$statusCode] ?? "unknown_{$statusCode}";
                $updated    = Whatsapp::where('sid', $messageId)->update(['status' => $statusText]);

                if ($updated) {
                    Log::info("✅ Status updated for message {$messageId}: {$statusText}");
                } else {
                    Log::warning("⚠️ Message {$messageId} not found in database for status update");
                }
            } else {
                Log::warning("⚠️ Missing messageId or status in update event", compact('messageId', 'statusCode'));
            }
        } else {
            Log::info("ℹ️ Unhandled event type: {$event}", ['data' => $data]);
        }

        return response()->json(['status' => 'success'], 200);
    }

    // --------------------------------------------------------------------------
    //  Fallback logic
    // --------------------------------------------------------------------------

    /**
     * Try primary provider first, fall back to OpenWA if it fails.
     * Respects OPENWA_FALLBACK_ENABLED (default true).
     */
    private function sendWithFallback(string $to, string $message, array $options = []): array
    {
        try {
            $result = $this->whatsAppService->sendText($to, $message, $options);

            $isError = $result['response']['success'] ?? null;
            if ($isError === false) {
                Log::warning('Primary WhatsApp provider returned an explicit error, falling back to OpenWA', [
                    'error_message' => $result['response']['message'] ?? 'Unknown error',
                    'to'            => $to,
                ]);
                throw new \Exception('Primary provider error: ' . ($result['response']['message'] ?? ''));
            }

            if (empty($result['message_id'])) {
                Log::warning('Primary provider sent successfully but did not return a message_id. Proceeding.', ['to' => $to]);
            }

            return $result;

        } catch (\Throwable $e) {
            Log::warning('Primary WhatsApp provider failed, considering fallback', [
                'error' => $e->getMessage(),
                'to'    => $to,
            ]);

            // Fallback toggle (default enabled while Wasender is unpaid)
            if (!env('OPENWA_FALLBACK_ENABLED', true)) {
                throw new \Exception('OpenWA fallback is disabled. Primary provider failed.');
            }

            return $this->sendViaOpenWA($to, $message, $options);
        }
    }

    /**
     * Send via self-hosted OpenWA/WaZuri, routing by country code.
     * Uses obfuscated headers to mimic official WhatsApp Web.
     */
    private function sendViaOpenWA(string $to, string $message, array $options = []): array
    {
        $countryCode = $options['country_code'] ?? '254';
        $sessionId   = $this->getSessionForCountry($countryCode);
        $baseUrl     = config('services.openwa.base_url', env('OPENWA_BASE_URL', 'https://api.sitebase.co.ke'));
        $apiKey      = config('services.openwa.api_key',  env('OPENWA_API_KEY',  ''));

        if ($sessionId === null) {
            throw new \Exception("No OpenWA session configured for country code {$countryCode}.");
        }

        $chatId = ltrim($to, '+') . '@c.us';
        $url    = rtrim($baseUrl, '/') . "/api/sessions/{$sessionId}/messages/send-text";

        Log::info('Attempting OpenWA fallback request', [
            'url'          => $url,
            'chatId'       => $chatId,
            'country_code' => $countryCode,
        ]);

        $response = Http::withHeaders($this->openwaHeaders($apiKey))->post($url, [
            'chatId' => $chatId,
            'text'   => $message,
        ]);

        Log::info('OpenWA fallback response', [
            'status' => $response->status(),
            'body'   => $response->body(),
        ]);

        if (!$response->successful()) {
            Log::error('OpenWA fallback failed', [
                'status' => $response->status(),
                'body'   => $response->body(),
            ]);
            throw new \Exception('All WhatsApp providers failed. OpenWA returned: ' . $response->body());
        }

        $data = $response->json();

        if (empty($data) || empty($data['messageId'])) {
            throw new \Exception('OpenWA fallback did not return a valid messageId');
        }

        Log::info('Message sent via OpenWA fallback', [
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

    // --------------------------------------------------------------------------
    //  Phone formatting helpers
    // --------------------------------------------------------------------------
    private function getPhoneNumberForWasenderAPI($primaryPhone, $altPhone, string $countryCode): ?string
    {
        $phone = $this->formatPhoneForWasender($primaryPhone, $countryCode);
        if (!$phone) {
            $phone = $this->formatPhoneForWasender($altPhone, $countryCode);
        }
        return $phone;
    }

    private function formatPhoneForWasender(?string $phoneNumber, string $countryCode = '254'): ?string
    {
        if (!$phoneNumber) return null;

        $phone = preg_replace('/\D/', '', $phoneNumber);
        if (!$phone || strlen($phone) < 9) return null;

        if (!preg_match('/^(254|255|256|260)/', $phone)) {
            if (substr($phone, 0, 1) === '0') {
                $phone = $countryCode . substr($phone, 1);
            } else {
                $phone = $countryCode . $phone;
            }
        }

        return (strlen($phone) >= 12 && strlen($phone) <= 13) ? $phone : null;
    }

    // --------------------------------------------------------------------------
    //  Media decryption helpers (unchanged, used by webhook if needed)
    // --------------------------------------------------------------------------
    private function handleMediaDecryption(array $mediaInfo, string $mediaType, string $messageId): void
    {
        $url      = $mediaInfo['url'] ?? null;
        $mediaKey = $mediaInfo['mediaKey'] ?? null;

        if (!$url || !$mediaKey) {
            throw new \Exception("Media object is missing url or mediaKey.");
        }

        $encryptedData = file_get_contents($url);
        if ($encryptedData === false) {
            throw new \Exception("Failed to download media from URL: {$url}");
        }

        $keys       = $this->getDecryptionKeys($mediaKey, $mediaType);
        $iv         = substr($keys, 0, 16);
        $cipherKey  = substr($keys, 16, 32);
        $ciphertext = substr($encryptedData, 0, -10);

        $decryptedData = openssl_decrypt($ciphertext, 'aes-256-cbc', $cipherKey, OPENSSL_RAW_DATA, $iv);
        if ($decryptedData === false) {
            throw new \Exception('Failed to decrypt media.');
        }

        $mimeType    = $mediaInfo['mimetype'] ?? 'application/octet-stream';
        $extension   = explode('/', $mimeType)[1] ?? 'bin';
        $filename    = $mediaInfo['fileName'] ?? "{$messageId}.{$extension}";
        $storagePath = "whatsapp-media/{$filename}";

        \Storage::put($storagePath, $decryptedData);

        Log::info("✅ Media decrypted and saved", [
            'path' => $storagePath,
            'type' => $mediaType,
            'size' => strlen($decryptedData)
        ]);
    }

    private function getDecryptionKeys(string $mediaKey, string $mediaType): string
    {
        $info = match ($mediaType) {
            'image', 'sticker' => 'WhatsApp Image Keys',
            'video'            => 'WhatsApp Video Keys',
            'audio'            => 'WhatsApp Audio Keys',
            'document'         => 'WhatsApp Document Keys',
            default            => throw new \Exception("Invalid media type: {$mediaType}"),
        };

        return hash_hkdf('sha256', base64_decode($mediaKey), 112, $info, '');
    }
}