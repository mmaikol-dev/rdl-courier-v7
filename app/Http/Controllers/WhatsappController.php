<?php

namespace App\Http\Controllers;

use App\Models\SheetOrder;
use App\Models\Whatsapp;
use App\Services\WhatsAppFallbackService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class WhatsappController extends Controller
{
    private WhatsAppFallbackService $whatsAppService;

    private string $templateName = 'pending_order_notification';

    private string $chatTemplateName = 'agent_message_notification';

    public function __construct(WhatsAppFallbackService $whatsAppService)
    {
        $this->whatsAppService = $whatsAppService;
    }

    private function getCountryCode(string $country): string
    {
        return match (strtolower(trim($country))) {
            'kenya' => '254',
            'tanzania' => '255',
            'uganda' => '256',
            'zambia' => '260',
            default => '254',
        };
    }

    private function getContactForCountry(string $countryCode): string
    {
        return match ($countryCode) {
            '20'   => '+20 000 000 000',    // Egypt
            '27'   => '+27 000 000 000',    // South Africa
            '211'  => '+211 000 000 000',   // South Sudan
            '212'  => '+212 000 000 000',   // Morocco
            '213'  => '+213 000 000 000',   // Algeria
            '216'  => '+216 000 000 000',   // Tunisia
            '218'  => '+218 000 000 000',   // Libya
            '220'  => '+220 000 000 000',   // Gambia
            '221'  => '+221 000 000 000',   // Senegal
            '222'  => '+222 000 000 000',   // Mauritania
            '223'  => '+223 000 000 000',   // Mali
            '224'  => '+224 000 000 000',   // Guinea
            '225'  => '+225 000 000 000',   // Cote d'Ivoire
            '226'  => '+226 000 000 000',   // Burkina Faso
            '227'  => '+227 000 000 000',   // Niger
            '228'  => '+228 000 000 000',   // Togo
            '229'  => '+229 000 000 000',   // Benin
            '230'  => '+230 000 000 000',   // Mauritius
            '231'  => '+231 000 000 000',   // Liberia
            '232'  => '+232 000 000 000',   // Sierra Leone
            '233'  => '+233 000 000 000',   // Ghana
            '234'  => '+234 000 000 000',   // Nigeria
            '235'  => '+235 000 000 000',   // Chad
            '236'  => '+236 000 000 000',   // Central African Republic
            '237'  => '+237 000 000 000',   // Cameroon
            '238'  => '+238 000 000 000',   // Cabo Verde
            '239'  => '+239 000 000 000',   // Sao Tome and Principe
            '240'  => '+240 000 000 000',   // Equatorial Guinea
            '241'  => '+241 000 000 000',   // Gabon
            '242'  => '+242 000 000 000',   // Congo (Republic)
            '243'  => '+243 000 000 000',   // Congo (DRC)
            '244'  => '+244 000 000 000',   // Angola
            '245'  => '+245 000 000 000',   // Guinea-Bissau
            '248'  => '+248 000 000 000',   // Seychelles
            '249'  => '+249 000 000 000',   // Sudan
            '250'  => '+250 000 000 000',   // Rwanda
            '251'  => '+251 000 000 000',   // Ethiopia
            '252'  => '+252 000 000 000',   // Somalia
            '253'  => '+253 000 000 000',   // Djibouti
            '254'  => '+254 740 801 187',   // Kenya
            '255'  => '+255 614 924 382',   // Tanzania
            '256'  => '+256 755 306 975',   // Uganda
            '257'  => '+257 000 000 000',   // Burundi
            '258'  => '+258 000 000 000',   // Mozambique
            '260'  => '+260 973 302 105',   // Zambia
            '261'  => '+261 000 000 000',   // Madagascar
            '263'  => '+263 000 000 000',   // Zimbabwe
            '264'  => '+264 000 000 000',   // Namibia
            '265'  => '+265 000 000 000',   // Malawi
            '266'  => '+266 000 000 000',   // Lesotho
            '267'  => '+267 000 000 000',   // Botswana
            '268'  => '+268 000 000 000',   // Eswatini
            '269'  => '+269 000 000 000',   // Comoros
            '291'  => '+291 000 000 000',   // Eritrea
            default => '+254 740 801 187',
        };
    }

    // -----------------------------------------------------------------
    //  Public endpoints
    // -----------------------------------------------------------------
    public function index() {}

    public function create() {}

    /**
     * Send a custom chat message via Meta WhatsApp Cloud API.
     */
    public function sendChat(Request $request)
    {
        Log::info('📤 Sending custom WhatsApp chat message', $request->all());

        try {
            $validated = $request->validate([
                'to' => 'required|string',
                'message' => 'required|string|max:4096',
                'country' => 'nullable|string',
            ]);

            $to = $validated['to'];
            $messageText = $validated['message'];

            $country = $validated['country'] ?? null;

            if (! $country) {
                $existingChat = Whatsapp::where('to', $to)->first();
                $storeName = $existingChat->store_name ?? null;

                $country = match (strtolower((string) $storeName)) {
                    'kenya', 'tanzania', 'uganda', 'zambia' => strtolower($storeName),
                    default => null,
                };
            }

            if (! $country) {
                $digits = preg_replace('/\D/', '', $to);
                $country = match (true) {
                    str_starts_with($digits, '260') => 'zambia',
                    str_starts_with($digits, '256') => 'uganda',
                    str_starts_with($digits, '255') => 'tanzania',
                    default => 'kenya',
                };
            }

            $countryCode = $this->getCountryCode($country);

            $formattedPhone = $this->whatsAppService->formatForStorage($to, $countryCode);

            if (! $formattedPhone) {
                Log::error('❌ Invalid phone number format', ['to' => $to]);

                return response()->json([
                    'success' => false,
                    'error' => 'Invalid phone number format',
                ], 400);
            }

            Log::info("📞 Formatted phone: {$formattedPhone}");

            $templateParams = [
                ['type' => 'text', 'text' => $messageText],
            ];

            $result = $this->whatsAppService->sendTemplate($formattedPhone, $this->chatTemplateName, 'en_US', $templateParams, [
                'country_code' => $countryCode,
            ]);

            Log::info('✅ WhatsApp send response', [
                'provider' => $result['provider'],
                'to' => $result['to'],
                'message_id' => $result['message_id'],
            ]);

            $messageId = $result['message_id'];

            $existingChat = Whatsapp::where('to', $to)
                ->orWhere('to', $formattedPhone)
                ->first();

            $clientName = $existingChat->client_name ?? 'Customer';
            $storeName = $existingChat->store_name ?? $country;
            $ccAgents = $existingChat->cc_agents ?? null;

            $whatsapp = Whatsapp::create([
                'to' => $result['to'],
                'client_name' => $clientName,
                'store_name' => $storeName,
                'cc_agents' => $ccAgents,
                'message' => $messageText,
                'status' => 'sent',
                'sid' => $messageId,
            ]);

            Log::info('💾 Message saved to database', [
                'id' => $whatsapp->id,
                'to' => $formattedPhone,
                'sid' => $messageId,
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Message sent successfully',
                'id' => $whatsapp->id,
                'sid' => $messageId,
                'provider' => $result['provider'],
                'data' => $whatsapp,
            ]);

        } catch (\Throwable $e) {
            Log::error('❌ WhatsApp provider error', [
                'error' => $e->getMessage(),
                'to' => $request->to ?? 'unknown',
            ]);

            return response()->json([
                'success' => false,
                'error' => 'Failed to send message: '.$e->getMessage(),
            ], 500);
        }
    }

    /**
     * Send a pending order notification via Meta WhatsApp Cloud API template.
     */
    public function sendMessage($id)
    {
        Log::info("Sending pending order template for Order ID: {$id}");

        try {
            $order = SheetOrder::findOrFail($id);

            $clientName = $order->client_name ?? 'Client';
            $orderNo = $order->order_no;
            $productName = $order->product_name;
            $quantity = (string) $order->quantity;
            $amount = (string) number_format((float) $order->amount);
            $ccEmail = $order->cc_email ?? null;

            $country = $order->country ?? 'kenya';
            $countryCode = $this->getCountryCode($country);

            $phone = $this->getPhoneNumber($order->phone, $order->alt_no, $countryCode);

            if (! $phone) {
                Log::error('Invalid phone numbers', ['phone' => $order->phone, 'alt_no' => $order->alt_no]);

                return back()->with('error', 'Invalid phone number format');
            }

            // Template variables: {{1}}=name {{2}}=order_no {{3}}=product {{4}}=qty {{5}}=amount {{6}}=contact
            $parameters = [
                ['type' => 'text', 'text' => $clientName],
                ['type' => 'text', 'text' => $orderNo],
                ['type' => 'text', 'text' => $productName],
                ['type' => 'text', 'text' => $quantity],
                ['type' => 'text', 'text' => $amount],
                ['type' => 'text', 'text' => $this->getContactForCountry($countryCode)],
            ];

            $result = $this->whatsAppService->sendTemplate($phone, $this->templateName, 'en_US', $parameters);

            Log::info("Template sent for order {$orderNo}", [
                'to' => $result['to'],
                'message_id' => $result['message_id'] ?? 'N/A',
            ]);

            $previewBody = "Hello {$clientName},\n\nWe tried reaching you regarding your pending order *{$orderNo}* for *{$productName}* ({$quantity} pcs), valued at *KSh {$amount}*, but were unable to get through.\n\nPlease contact us at {$this->getContactForCountry($countryCode)} at your earliest convenience so we can assist you and complete your delivery.\n\nThank you for choosing *RealDeal Logistics*! 📦";
            Whatsapp::create([
                'to' => $result['to'],
                'client_name' => $clientName,
                'store_name' => $country,
                'cc_agents' => $ccEmail,
                'message' => $previewBody,
                'status' => 'sent',
                'sid' => $result['message_id'],
            ]);

            return back()->with('success', 'WhatsApp template sent successfully');

        } catch (\Throwable $e) {
            Log::error('WhatsApp template sending failed', [
                'error' => $e->getMessage(),
                'order_id' => $id,
            ]);

            return back()->with('error', 'Failed to send WhatsApp template: '.$e->getMessage());
        }
    }

    /**
     * Webhook handler (receives incoming messages & status updates via Wasender).
     */
    public function webhook(Request $request)
    {
        Log::info('📩 WasenderAPI Webhook received', $request->all());

        $data = $request->all();

        if (empty($data)) {
            Log::warning('⚠️ Empty webhook data received');

            return response()->json(['status' => 'no_data'], 200);
        }

        if (! isset($data['event'])) {
            Log::warning("⚠️ No 'event' field found in webhook data");

            return response()->json(['status' => 'no_event'], 200);
        }

        $event = $data['event'];
        Log::info("📋 Event Type: {$event}");

        if ($event === 'chats.update') {
            Log::info('💬 Processing CHATS.UPDATE event');

            $chats = $data['data']['chats'] ?? null;

            if (! $chats) {
                Log::warning('⚠️ No chats data found');

                return response()->json(['status' => 'no_chats'], 200);
            }

            $messages = $chats['messages'] ?? [];

            if (empty($messages)) {
                Log::warning('⚠️ No messages found in chats');

                return response()->json(['status' => 'no_messages'], 200);
            }

            foreach ($messages as $msgWrapper) {
                try {
                    $messageData = $msgWrapper['message'] ?? null;

                    if (! $messageData) {
                        Log::warning('⚠️ No message data in wrapper');

                        continue;
                    }

                    Log::info('📨 Processing message:', $messageData);

                    $key = $messageData['key'] ?? [];
                    $messageId = $key['id'] ?? null;
                    $fromMe = $key['fromMe'] ?? false;

                    if ($fromMe) {
                        Log::info('⏭️ Skipping outgoing message (fromMe: true)');

                        continue;
                    }

                    $from = $key['remoteJidAlt'] ?? $key['remoteJid'] ?? null;

                    if ($from && strpos($from, '@') !== false) {
                        $from = explode('@', $from)[0];
                    }

                    $pushName = $messageData['pushName'] ?? 'UNKNOWN';
                    $messageBody = '';
                    $message = $messageData['message'] ?? [];

                    if (isset($message['conversation'])) {
                        $messageBody = $message['conversation'];
                    } elseif (isset($message['extendedTextMessage']['text'])) {
                        $messageBody = $message['extendedTextMessage']['text'];
                    } elseif (isset($message['imageMessage'])) {
                        $caption = $message['imageMessage']['caption'] ?? '';
                        $messageBody = '[Image received]'.($caption ? ": {$caption}" : '');
                    } elseif (isset($message['videoMessage'])) {
                        $caption = $message['videoMessage']['caption'] ?? '';
                        $messageBody = '[Video received]'.($caption ? ": {$caption}" : '');
                    } elseif (isset($message['audioMessage'])) {
                        $messageBody = '[Audio received]';
                    } elseif (isset($message['documentMessage'])) {
                        $fileName = $message['documentMessage']['fileName'] ?? 'document';
                        $messageBody = "[Document received: {$fileName}]";
                    } elseif (isset($message['stickerMessage'])) {
                        $messageBody = '[Sticker received]';
                    } else {
                        $messageBody = '[Unknown message type]';
                        Log::info('⚠️ Unknown message type:', array_keys($message));
                    }

                    if (! $from || ! $messageId) {
                        Log::error('❌ Missing required fields', compact('from', 'messageId'));

                        continue;
                    }

                    $whatsapp = Whatsapp::create([
                        'to' => $from,
                        'client_name' => $pushName,
                        'store_name' => $this->resolveStoreName($from),
                        'cc_agents' => null,
                        'message' => $messageBody,
                        'status' => 'received',
                        'sid' => $messageId,
                        'type' => '1',
                    ]);

                    Log::info('✅✅✅ MESSAGE SAVED SUCCESSFULLY!', [
                        'id' => $whatsapp->id,
                        'from' => $from,
                        'message' => $messageBody,
                    ]);

                } catch (\Exception $e) {
                    Log::error('❌❌❌ Failed to process message', [
                        'error' => $e->getMessage(),
                        'trace' => $e->getTraceAsString(),
                    ]);
                }
            }
        } elseif ($event === 'message.status' || $event === 'messages.update') {
            Log::info('📊 Processing STATUS UPDATE event');

            $statusData = $data['data'] ?? [];
            Log::info('📊 Status Data:', $statusData);

            $messageId = $statusData['key']['id'] ?? null;
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
                $updated = Whatsapp::where('sid', $messageId)->update(['status' => $statusText]);

                if ($updated) {
                    Log::info("✅ Status updated for message {$messageId}: {$statusText}");
                } else {
                    Log::warning("⚠️ Message {$messageId} not found in database for status update");
                }
            } else {
                Log::warning('⚠️ Missing messageId or status in update event', compact('messageId', 'statusCode'));
            }
        } else {
            Log::info("ℹ️ Unhandled event type: {$event}", ['data' => $data]);
        }

        return response()->json(['status' => 'success'], 200);
    }

    // --------------------------------------------------------------------------
    //  Phone formatting helpers
    // --------------------------------------------------------------------------
    private function getPhoneNumber($primaryPhone, $altPhone, string $countryCode): ?string
    {
        $phone = $this->formatPhone($primaryPhone, $countryCode);
        if (! $phone) {
            $phone = $this->formatPhone($altPhone, $countryCode);
        }

        return $phone;
    }

    /**
     * Resolve the store name (country) for an inbound sender.
     *
     * Prefers the store name of an existing chat for the same phone so
     * conversations stay consistent, then falls back to the country
     * inferred from the phone number prefix.
     */
    private function resolveStoreName(?string $phone): string
    {
        if ($phone) {
            $existing = Whatsapp::where('to', $phone)
                ->whereNotNull('store_name')
                ->where('store_name', '!=', '')
                ->whereNotIn('store_name', ['META_WEBHOOK', 'WEBHOOK'])
                ->latest()
                ->first();

            if ($existing?->store_name) {
                return $existing->store_name;
            }

            $digits = preg_replace('/\D/', '', $phone);
            $country = match (true) {
                str_starts_with($digits, '260') => 'zambia',
                str_starts_with($digits, '256') => 'uganda',
                str_starts_with($digits, '255') => 'tanzania',
                default => 'kenya',
            };

            return $country;
        }

        return 'kenya';
    }

    private function formatPhone(?string $phoneNumber, string $countryCode = '254'): ?string
    {
        if (! $phoneNumber) {
            return null;
        }

        $phone = preg_replace('/\D/', '', $phoneNumber);
        if (! $phone || strlen($phone) < 9) {
            return null;
        }

        if (! preg_match('/^(254|255|256|260)/', $phone)) {
            if (substr($phone, 0, 1) === '0') {
                $phone = $countryCode.substr($phone, 1);
            } else {
                $phone = $countryCode.$phone;
            }
        }

        return (strlen($phone) >= 12 && strlen($phone) <= 13) ? $phone : null;
    }

    // --------------------------------------------------------------------------
    //  Media decryption helpers (used by webhook)
    // --------------------------------------------------------------------------
    private function handleMediaDecryption(array $mediaInfo, string $mediaType, string $messageId): void
    {
        $url = $mediaInfo['url'] ?? null;
        $mediaKey = $mediaInfo['mediaKey'] ?? null;

        if (! $url || ! $mediaKey) {
            throw new \Exception('Media object is missing url or mediaKey.');
        }

        $encryptedData = file_get_contents($url);
        if ($encryptedData === false) {
            throw new \Exception("Failed to download media from URL: {$url}");
        }

        $keys = $this->getDecryptionKeys($mediaKey, $mediaType);
        $iv = substr($keys, 0, 16);
        $cipherKey = substr($keys, 16, 32);
        $ciphertext = substr($encryptedData, 0, -10);

        $decryptedData = openssl_decrypt($ciphertext, 'aes-256-cbc', $cipherKey, OPENSSL_RAW_DATA, $iv);
        if ($decryptedData === false) {
            throw new \Exception('Failed to decrypt media.');
        }

        $mimeType = $mediaInfo['mimetype'] ?? 'application/octet-stream';
        $extension = explode('/', $mimeType)[1] ?? 'bin';
        $filename = $mediaInfo['fileName'] ?? "{$messageId}.{$extension}";
        $storagePath = "whatsapp-media/{$filename}";

        \Storage::put($storagePath, $decryptedData);

        Log::info('✅ Media decrypted and saved', [
            'path' => $storagePath,
            'type' => $mediaType,
            'size' => strlen($decryptedData),
        ]);
    }

    private function getDecryptionKeys(string $mediaKey, string $mediaType): string
    {
        $info = match ($mediaType) {
            'image', 'sticker' => 'WhatsApp Image Keys',
            'video' => 'WhatsApp Video Keys',
            'audio' => 'WhatsApp Audio Keys',
            'document' => 'WhatsApp Document Keys',
            default => throw new \Exception("Invalid media type: {$mediaType}"),
        };

        return hash_hkdf('sha256', base64_decode($mediaKey), 112, $info, '');
    }
}
