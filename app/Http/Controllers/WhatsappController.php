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
    public function __construct(private readonly WhatsAppFallbackService $whatsAppService) {}

    /**
     * Display a listing of the resource.
     */
    public function index()
    {
        //
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create()
    {
        //
    }
    
    
      
public function sendChat(Request $request)
{
    // This method now only handles custom chat messages via WasenderAPI
    Log::info("📤 Sending custom WhatsApp chat message", $request->all());

    try {
        $validated = $request->validate([
            'to' => 'required|string',
            'message' => 'required|string|max:4096',
        ]);

        $to = $validated['to'];
        $messageText = $validated['message'];

        $formattedPhone = $this->whatsAppService->formatForStorage($to, '254');

        if (!$formattedPhone) {
            Log::error("❌ Invalid phone number format", ['to' => $to]);
            return response()->json([
                'success' => false,
                'error' => 'Invalid phone number format'
            ], 400);
        }

        Log::info("📞 Formatted phone: {$formattedPhone}");
        $result = $this->whatsAppService->sendText($formattedPhone, $messageText, [
            'country_code' => '254',
        ]);

        Log::info('✅ WhatsApp send response', [
            'provider' => $result['provider'],
            'to' => $result['to'],
            'message_id' => $result['message_id'],
        ]);

        $messageId = $result['message_id'];

        // Get conversation details from database
        $existingChat = Whatsapp::where('to', $to)
            ->orWhere('to', $formattedPhone)
            ->first();

        $clientName = $existingChat->client_name ?? 'Customer';
        $storeName = $existingChat->store_name ?? 'CHAT';
        $ccAgents = $existingChat->cc_agents ?? null;

        // Save message to database
        $whatsapp = Whatsapp::create([
            'to' => $result['to'],
            'client_name' => $clientName,
            'store_name' => $storeName,
            'cc_agents' => $ccAgents,
            'message' => $messageText,
            'status' => 'sent',
            'sid' => $messageId,
        ]);

        Log::info("💾 Message saved to database", [
            'id' => $whatsapp->id,
            'to' => $formattedPhone,
            'sid' => $messageId
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Message sent successfully',
            'sid' => $messageId,
            'provider' => $result['provider'],
            'data' => $whatsapp
        ]);

    } catch (\Throwable $e) {
        Log::error("❌ WhatsApp provider error", [
            'error' => $e->getMessage(),
            'to' => $request->to ?? 'unknown'
        ]);

        return response()->json([
            'success' => false,
            'error' => 'Failed to send message: ' . $e->getMessage()
        ], 500);
    }
}

private function formatPhoneNumber($phoneNumber, $storeName)
{
    if (!$phoneNumber) return null;

    // Remove anything not a digit
    $phone = preg_replace('/\D/', '', $phoneNumber);

    $countryCode = strtoupper($storeName) === 'RDL3' ? '255' : '254';

    // If number starts with country code already
    if (substr($phone, 0, strlen($countryCode)) === $countryCode) {
        return '+' . $phone;
    }

    // If number starts with 0 → convert 07xx → +2547xx
    if (substr($phone, 0, 1) === '0') {
        return '+' . $countryCode . substr($phone, 1);
    }

    // If number is 9 digits only → assume local without 0
    if (strlen($phone) === 9) {
        return '+' . $countryCode . $phone;
    }

    // If number is 10 digits without country code e.g. 743xxxxxxx
    if (strlen($phone) === 10) {
        return '+' . $countryCode . substr($phone, -9);
    }

    // Default fallback
    return null;
}



// Inside WhatsappController.php

public function webhook(Request $request)
{
    // Log everything that comes from WasenderAPI
    Log::info("📩 WasenderAPI Webhook received", $request->all());

    // ✅ Get the webhook data
    $data = $request->all();

    if (empty($data)) {
        Log::warning("⚠️ Empty webhook data received");
        return response()->json(['status' => 'no_data'], 200);
    }

    // ✅ Check event type
    if (!isset($data['event'])) {
        Log::warning("⚠️ No 'event' field found in webhook data");
        return response()->json(['status' => 'no_event'], 200);
    }

    $event = $data['event'];
    Log::info("📋 Event Type: {$event}");

    // ============================================
    // Handle chats.update event (incoming messages)
    // ============================================
    if ($event === 'chats.update') {
        Log::info("💬 Processing CHATS.UPDATE event");

        // Navigate to messages array
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

        // Process each message
        foreach ($messages as $msgWrapper) {
            try {
                $messageData = $msgWrapper['message'] ?? null;
                
                if (!$messageData) {
                    Log::warning("⚠️ No message data in wrapper");
                    continue;
                }

                Log::info("📨 Processing message:", $messageData);

                // Extract key information
                $key = $messageData['key'] ?? [];
                $messageId = $key['id'] ?? null;
                $fromMe = $key['fromMe'] ?? false;
                
                // Skip messages sent by us (fromMe: true)
                if ($fromMe) {
                    Log::info("⏭️ Skipping outgoing message (fromMe: true)");
                    continue;
                }

                // Get sender - use remoteJidAlt for clean phone number
                $from = $key['remoteJidAlt'] ?? $key['remoteJid'] ?? null;
                
                // Clean phone number (remove @s.whatsapp.net suffix)
                if ($from && strpos($from, '@') !== false) {
                    $from = explode('@', $from)[0];
                }

                $pushName = $messageData['pushName'] ?? 'UNKNOWN';
                
                // Extract message text
                $messageBody = '';
                $message = $messageData['message'] ?? [];
                
                // Check for different message types
                if (isset($message['conversation'])) {
                    $messageBody = $message['conversation'];
                    Log::info("✅ Text from conversation: {$messageBody}");
                }
                elseif (isset($message['extendedTextMessage']['text'])) {
                    $messageBody = $message['extendedTextMessage']['text'];
                    Log::info("✅ Text from extendedTextMessage: {$messageBody}");
                }
                elseif (isset($message['imageMessage'])) {
                    $caption = $message['imageMessage']['caption'] ?? '';
                    $messageBody = '[Image received]' . ($caption ? ": {$caption}" : '');
                    Log::info("✅ Image message: {$messageBody}");
                }
                elseif (isset($message['videoMessage'])) {
                    $caption = $message['videoMessage']['caption'] ?? '';
                    $messageBody = '[Video received]' . ($caption ? ": {$caption}" : '');
                    Log::info("✅ Video message: {$messageBody}");
                }
                elseif (isset($message['audioMessage'])) {
                    $messageBody = '[Audio received]';
                    Log::info("✅ Audio message");
                }
                elseif (isset($message['documentMessage'])) {
                    $fileName = $message['documentMessage']['fileName'] ?? 'document';
                    $messageBody = "[Document received: {$fileName}]";
                    Log::info("✅ Document message: {$messageBody}");
                }
                elseif (isset($message['stickerMessage'])) {
                    $messageBody = '[Sticker received]';
                    Log::info("✅ Sticker message");
                }
                else {
                    $messageBody = '[Unknown message type]';
                    Log::info("⚠️ Unknown message type:", array_keys($message));
                }

                // Validate before saving
                if (!$from || !$messageId) {
                    Log::error("❌ Missing required fields", [
                        'from' => $from,
                        'messageId' => $messageId
                    ]);
                    continue;
                }

                // Save to database
                Log::info("💾 Saving message to database", [
                    'to' => $from,
                    'client_name' => $pushName,
                    'message' => $messageBody,
                    'sid' => $messageId,
                ]);

                $whatsapp = Whatsapp::create([
                    'to' => $from,
                    'client_name' => $pushName,
                    'store_name' => 'WEBHOOK',
                    'cc_agents' => null,
                    'message' => $messageBody,
                    'status' => 'received',
                    'sid' => $messageId,
                ]);

                Log::info("✅✅✅ MESSAGE SAVED SUCCESSFULLY!", [
                    'id' => $whatsapp->id,
                    'from' => $from,
                    'message' => $messageBody
                ]);

            } catch (\Exception $e) {
                Log::error("❌❌❌ Failed to process message", [
                    'error' => $e->getMessage(),
                    'trace' => $e->getTraceAsString()
                ]);
            }
        }
    }

    // ============================================
    // Handle message status updates
    // ============================================
    elseif ($event === 'message.status' || $event === 'messages.update') {
        Log::info("📊 Processing STATUS UPDATE event");
        
        $statusData = $data['data'] ?? [];
        
        Log::info("📊 Status Data:", $statusData);

        // ✅ CORRECT: Get ID from key object
        $messageId = $statusData['key']['id'] ?? null;
        
        // ✅ CORRECT: Get numeric status
        $statusCode = $statusData['status'] ?? null;

        if ($messageId && $statusCode !== null) {
            
            // Map numeric status codes to readable names
            $statusMap = [
                0 => 'error',
                1 => 'pending',
                2 => 'sent',       // Message sent to server
                3 => 'delivered',  // Message delivered to recipient
                4 => 'read',       // Message read by recipient
                5 => 'played',     // Audio/Video message played
            ];
            
            $statusText = $statusMap[$statusCode] ?? "unknown_{$statusCode}";
            
            Log::info("🔄 Updating message status", [
                'message_id' => $messageId,
                'status_code' => $statusCode,
                'status_text' => $statusText
            ]);

            $updated = Whatsapp::where('sid', $messageId)->update([
                'status' => $statusText
            ]);

            if ($updated) {
                Log::info("✅ Status updated for message {$messageId}: {$statusText}");
            } else {
                Log::warning("⚠️ Message {$messageId} not found in database for status update");
            }
        } else {
            Log::warning("⚠️ Missing messageId or status in update event", [
                'messageId' => $messageId,
                'statusCode' => $statusCode
            ]);
        }
    }

    // ============================================
    // Handle other events
    // ============================================
    else {
        Log::info("ℹ️ Unhandled event type: {$event}", [
            'data' => $data
        ]);
    }

    return response()->json(['status' => 'success'], 200);
}
/**
 * Handle media decryption and save to storage
 */
private function handleMediaDecryption(array $mediaInfo, string $mediaType, string $messageId): void
{
    $url = $mediaInfo['url'] ?? null;
    $mediaKey = $mediaInfo['mediaKey'] ?? null;
    
    if (!$url || !$mediaKey) {
        throw new \Exception("Media object is missing url or mediaKey.");
    }

    // Download encrypted media
    $encryptedData = file_get_contents($url);
    if ($encryptedData === false) {
        throw new \Exception("Failed to download media from URL: {$url}");
    }

    // Derive decryption keys using HKDF
    $keys = $this->getDecryptionKeys($mediaKey, $mediaType);
    $iv = substr($keys, 0, 16);
    $cipherKey = substr($keys, 16, 32);
    $ciphertext = substr($encryptedData, 0, -10);

    // Decrypt the media
    $decryptedData = openssl_decrypt($ciphertext, 'aes-256-cbc', $cipherKey, OPENSSL_RAW_DATA, $iv);
    if ($decryptedData === false) {
        throw new \Exception('Failed to decrypt media.');
    }

    // Prepare storage path
    $mimeType = $mediaInfo['mimetype'] ?? 'application/octet-stream';
    $extension = explode('/', $mimeType)[1] ?? 'bin';
    $filename = $mediaInfo['fileName'] ?? "{$messageId}.{$extension}";
    
    // Save to storage/app/whatsapp-media/
    $storagePath = "whatsapp-media/{$filename}";
    \Storage::put($storagePath, $decryptedData);
    
    Log::info("✅ Media decrypted and saved", [
        'path' => $storagePath,
        'type' => $mediaType,
        'size' => strlen($decryptedData)
    ]);
}

/**
 * Derives the decryption keys using HKDF
 */
private function getDecryptionKeys(string $mediaKey, string $mediaType): string
{
    $info = match ($mediaType) {
        'image', 'sticker' => 'WhatsApp Image Keys',
        'video'           => 'WhatsApp Video Keys',
        'audio'           => 'WhatsApp Audio Keys',
        'document'        => 'WhatsApp Document Keys',
        default           => throw new \Exception("Invalid media type: {$mediaType}"),
    };
    
    return hash_hkdf('sha256', base64_decode($mediaKey), 112, $info, '');
}


public function sendMessage($id)
{
    Log::info("📤 Sending WhatsApp template for Order ID: $id via WasenderAPI");

    try {
        $order = SheetOrder::findOrFail($id);

        $client_name = $order->client_name ?? 'Client';
        $store_name = strtoupper($order->store_name ?? 'STORE');
        $order_no = $order->order_no;
        $product_name = $order->product_name;
        $quantity = $order->quantity;
        $amount = $order->amount;
        $cc_email = $order->cc_email ?? null;
        
        Log::info("🔍 Order details", [
            'client_name' => $client_name,
            'store_name' => $store_name,
            'order_no' => $order_no,
            'product_name' => $product_name,
            'quantity' => $quantity,
            'amount' => $amount,
            'cc_email' => $cc_email
        ]);

        // Get phone number
        $phone = $this->getPhoneNumberForWasenderAPI($order->phone, $order->alt_no, $store_name);
        
        if (!$phone) {
            Log::error("❌ Invalid phone numbers", [
                'phone' => $order->phone,
                'alt_no' => $order->alt_no
            ]);
            return back()->with('error', 'Invalid phone number format ❌');
        }

        Log::info("📞 Phone formatted for WasenderAPI: {$phone}");

        // Create custom message based on store
        $message = $this->createOrderMessage($client_name, $order_no, $product_name, $quantity, $amount, $store_name);
        
        Log::info("📝 Message content:", ['message' => $message]);

        $result = $this->whatsAppService->sendText($phone, $message, [
            'country_code' => strtoupper($store_name) === 'RDL3' ? '255' : '254',
        ]);

        Log::info('✅ WhatsApp send response for order message', [
            'provider' => $result['provider'],
            'to' => $result['to'],
            'message_id' => $result['message_id'],
        ]);

        $messageId = $result['message_id'];

        // Save to database
        $whatsappData = [
            'to' => $result['to'],
            'client_name' => $client_name,
            'store_name' => $store_name,
            'cc_agents' => $cc_email,
            'message' => $message,
            'status' => 'sent',
            'sid' => $messageId,
        ];

        Log::info("💾 Saving WhatsApp data:", $whatsappData);

        $whatsapp = Whatsapp::create($whatsappData);

        Log::info("✅ Saved WhatsApp record:", $whatsapp->toArray());

        return back()->with('success', 'WhatsApp message sent successfully ✅');

    } catch (\Throwable $e) {
        Log::error("❌ WhatsApp sending failed", [
            'error' => $e->getMessage(),
            'order_id' => $id
        ]);

        return back()->with('error', 'Failed to send WhatsApp message: ' . $e->getMessage() . ' ❌');
    }
}

/**
 * Format phone number for WasenderAPI
 */
private function getPhoneNumberForWasenderAPI($primaryPhone, $altPhone, $storeName)
{
    // Try primary phone first
    $phone = $this->formatPhoneForWasender($primaryPhone);
    
    if (!$phone) {
        // Try alt phone
        $phone = $this->formatPhoneForWasender($altPhone);
    }
    
    return $phone;
}

/**
 * Format single phone number for WasenderAPI
 */
private function formatPhoneForWasender($phoneNumber)
{
    if (!$phoneNumber) return null;

    // Remove anything not a digit
    $phone = preg_replace('/\D/', '', $phoneNumber);
    
    if (!$phone || strlen($phone) < 9) {
        return null;
    }

    // Ensure proper country code format (no + for WasenderAPI)
    if (!preg_match('/^(254|255)/', $phone)) {
        if (substr($phone, 0, 1) === '0') {
            $phone = '254' . substr($phone, 1);
        } else {
            $phone = '254' . $phone;
        }
    }

    // Final validation
    if (strlen($phone) >= 12 && strlen($phone) <= 13) {
        return $phone;
    }
    
    return null;
}

/**
 * Create custom order message template
 */
private function createOrderMessage($clientName, $orderNo, $productName, $quantity, $amount, $storeName)
{
    $currency = strtoupper($storeName) === 'RDL3' ? 'TZS' : 'KES';
    $formattedAmount = number_format($amount);
    $contactNumber = '0740801187';
    
    return <<<MESSAGE
*REALDEAL LOGISTICS - ORDER NOTIFICATION*

Hello {$clientName},

We tried contacting you regarding your order *{$orderNo}* but your phone was unreachable.

*Order Details:*
📦 Product: {$productName}
🔢 Quantity: {$quantity} pcs
💰 Amount: {$currency} {$formattedAmount}

*Please call us back on {$contactNumber}* to confirm your availability for delivery.

Thank you for choosing Realdeal Logistics!

_Delivering Excellence, Every Time._
MESSAGE;
}
    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        //
    }

    /**
     * Display the specified resource.
     */
    public function show(Whatsapp $whatsapp)
    {
        //
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(Whatsapp $whatsapp)
    {
        //
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Whatsapp $whatsapp)
    {
        //
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Whatsapp $whatsapp)
    {
        //
    }
}
