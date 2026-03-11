<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use App\Models\Whatsapp;
use App\Models\SheetOrder;
use Carbon\Carbon;
use Exception;

class SendWhatsAppMessage extends Command
{
    protected $signature = 'whatsapp:send-meta';
    protected $description = 'Send WhatsApp messages via WasenderAPI for scheduled orders today';

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

        // Initialize WasenderAPI client once (reuse across all orders)
        $apiKey = 'e7f29a701c81288d561f882c1bdb3720bd1cd39e33751c68d88b9eeaeb139e76';
        $client = new \WasenderApi\WasenderClient($apiKey);

        foreach ($orders as $order) {
            try {
                $client_name = $order->client_name ?? 'Client';
                $store_name  = strtoupper($order->store_name ?? 'STORE');
                $order_no    = $order->order_no;
                $product_name = $order->product_name;
                $quantity    = $order->quantity;
                $amount      = $order->amount;
                $cc_email    = $order->cc_email ?? null;

                // Format phone number for WasenderAPI (no + prefix)
                $phone = $this->formatPhoneForWasender($order->phone, $store_name);

                if (!$phone) {
                    Log::warning("⚠️ Invalid phone number for order {$order_no}, trying alt number.");
                    $phone = $this->formatPhoneForWasender($order->alt_no ?? null, $store_name);
                }

                if (!$phone) {
                    Log::error("❌ No valid phone number for order {$order_no}. Skipping.");
                    $this->error("❌ Skipping order {$order_no} — no valid phone number.");
                    continue;
                }

                // Build the message using the same template as the controller
                $message = $this->createOrderMessage(
                    $client_name,
                    $order_no,
                    $product_name,
                    $quantity,
                    $amount,
                    $store_name
                );

                Log::info("📤 Sending message to {$phone} for order {$order_no}");

                // Send via WasenderAPI
                $response = $client->sendText($phone, $message);

                Log::info("✅ WasenderAPI Response for order {$order_no}:", $response);

                $messageId = $response['data']['key']['id'] ?? null;

                Whatsapp::create([
                    'to'          => $phone,
                    'client_name' => $client_name,
                    'store_name'  => $store_name,
                    'cc_agents'   => $cc_email,
                    'message'     => $message,
                    'status'      => 'sent',
                    'sid'         => $messageId,
                ]);

                $this->info("✅ Message sent to {$phone} for order {$order_no}");

                // Rate limiting: randomized delay to mimic human behavior
                // WasenderAPI recommends no more than 2 messages/minute
                $delay = rand(30, 45);
                Log::info("⏳ Waiting {$delay}s before next message...");
                $this->info("⏳ Waiting {$delay}s...");
                sleep($delay);

            } catch (\WasenderApi\Exceptions\WasenderApiException $e) {
                Log::error("❌ WasenderAPI error for order {$order->order_no}", [
                    'error' => $e->getMessage(),
                    'phone' => $order->phone,
                ]);

                // Save failed record so it's visible in the dashboard
                Whatsapp::create([
                    'to'          => $order->phone,
                    'client_name' => $order->client_name ?? 'Client',
                    'store_name'  => strtoupper($order->store_name ?? 'STORE'),
                    'cc_agents'   => $order->cc_email ?? null,
                    'message'     => "Order {$order->order_no} — message failed to send.",
                    'status'      => 'failed',
                    'sid'         => null,
                ]);

                $this->error("❌ WasenderAPI error: " . $e->getMessage());

            } catch (Exception $e) {
                Log::error("❌ Unexpected error for order {$order->order_no}", [
                    'error' => $e->getMessage(),
                    'phone' => $order->phone,
                ]);

                Whatsapp::create([
                    'to'          => $order->phone,
                    'client_name' => $order->client_name ?? 'Client',
                    'store_name'  => strtoupper($order->store_name ?? 'STORE'),
                    'cc_agents'   => $order->cc_email ?? null,
                    'message'     => "Order {$order->order_no} — message failed to send.",
                    'status'      => 'failed',
                    'sid'         => null,
                ]);

                $this->error("❌ Unexpected error: " . $e->getMessage());
            }
        }

        Log::info('🏁 SendWhatsAppMessage command completed.');
        $this->info('🏁 Done!');
    }

    /**
     * Format phone number for WasenderAPI (digits only, no + prefix)
     */
    private function formatPhoneForWasender(?string $phoneNumber, string $storeName): ?string
    {
        if (!$phoneNumber) return null;

        $phone = preg_replace('/\D/', '', $phoneNumber);

        if (!$phone || strlen($phone) < 9) {
            return null;
        }

        $countryCode = strtoupper($storeName) === 'RDL3' ? '255' : '254';

        if (!preg_match('/^(254|255)/', $phone)) {
            if (substr($phone, 0, 1) === '0') {
                $phone = $countryCode . substr($phone, 1);
            } else {
                $phone = $countryCode . $phone;
            }
        }

        // Final length validation (12 for Kenya/Tanzania with country code)
        if (strlen($phone) >= 12 && strlen($phone) <= 13) {
            return $phone;
        }

        return null;
    }

    /**
     * Build the order notification message
     * Mirrors WhatsappController::createOrderMessage()
     */
    private function createOrderMessage(
        string $clientName,
        string $orderNo,
        string $productName,
        $quantity,
        $amount,
        string $storeName
    ): string {
        $currency        = strtoupper($storeName) === 'RDL3' ? 'TZS' : 'KES';
        $formattedAmount = number_format($amount);
        $contactNumber   = '0740801187';

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