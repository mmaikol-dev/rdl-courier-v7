<?php

namespace App\Console\Commands;

use App\Models\SheetOrder;
use App\Models\Whatsapp;
use App\Services\WhatsAppFallbackService;
use Carbon\Carbon;
use Exception;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class SendWhatsAppMessage extends Command
{
    protected $signature = 'whatsapp:send-meta';

    protected $description = 'Send WhatsApp template notifications for scheduled/rescheduled orders due today';

    private string $templateName = 'scheduled_order_notification';

    // -----------------------------------------------------------------
    //  Country helpers
    // -----------------------------------------------------------------
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
            '254' => '+254 740 801 187',
            '255' => '+255 614 924 382',
            '256' => '+256 701 600 293',
            '260' => '+260 740 801 187',
            default => '+254 740 801 187',
        };
    }

    // -----------------------------------------------------------------
    //  Command entry point
    // -----------------------------------------------------------------
    public function handle()
    {
        Log::info('Starting SendWhatsAppMessage command');

        $today = Carbon::today();
        $orders = SheetOrder::whereIn('status', ['Scheduled', 'scheduled', 'Rescheduled', 'rescheduled'])
            ->whereDate('delivery_date', $today)
            ->get();

        if ($orders->isEmpty()) {
            Log::info('No scheduled orders for today.');
            $this->info('No scheduled orders for today.');

            return;
        }

        // Group by country, take 15 per country
        $limited = $orders->groupBy(fn ($o) => strtolower(trim($o->country ?? 'kenya')))
            ->flatMap(fn ($group) => $group->take(15))
            ->values();

        $this->info("Found {$orders->count()} orders, limiting to {$limited->count()} (15 per country).");
        $sender = app(WhatsAppFallbackService::class);

        $sent = 0;
        $failed = 0;

        foreach ($limited as $order) {
            try {
                $clientName = $order->client_name ?? 'Client';
                $orderNo = $order->order_no;
                $productName = $order->product_name;
                $quantity = (string) $order->quantity;
                $amount = (string) number_format((float) $order->amount);
                $ccEmail = $order->cc_email ?? null;

                $country = $order->country ?? 'kenya';
                $countryCode = $this->getCountryCode($country);

                $phone = $this->formatPhone($order->phone, $countryCode);
                if (! $phone) {
                    $phone = $this->formatPhone($order->alt_no ?? null, $countryCode);
                }
                if (! $phone) {
                    Log::error("No valid phone for order {$orderNo}. Skipping.");
                    $this->error("Skipping order {$orderNo} – no phone.");
                    $failed++;
                    continue;
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

                Log::info("Sending to {$phone} for order {$orderNo}", ['country' => $country]);

                $result = $sender->sendTemplate($phone, $this->templateName, 'en_US', $parameters);

                Log::info("Sent for order {$orderNo}", [
                    'to' => $result['to'],
                    'message_id' => $result['message_id'] ?? 'N/A',
                ]);

                // Log to whatsapp table
                $previewBody = "Hello {$clientName},\n\nYour order *{$orderNo}* for *{$productName}* ({$quantity} pcs), valued at *{$amount}*, is scheduled for delivery *today*.\n\nOur delivery team will be in touch shortly. Please ensure your phone is available and someone is present to receive the package.\n\nIf you have any questions or need to make changes, contact us at *{$this->getContactForCountry($countryCode)}*.\n\nThank you for choosing *RealDeal Logistics*! 📦";
                Whatsapp::create([
                    'to' => $result['to'],
                    'client_name' => $clientName,
                    'store_name' => $country,
                    'cc_agents' => $ccEmail,
                    'message' => $previewBody,
                    'status' => 'sent',
                    'sid' => $result['message_id'],
                ]);

                $sent++;

                $this->info("Order {$orderNo} sent to {$phone}");

                if ($sent < $limited->count()) {
                    Log::info("Waiting 3s before next message...");
                    $this->info("Waiting 3s...");
                    sleep(3);
                }

            } catch (Exception $e) {
                Log::error("Failed for order {$order->order_no}: ".$e->getMessage());
                $this->error("Failed: {$order->order_no} – ".$e->getMessage());
                $failed++;

                Whatsapp::create([
                    'to' => $order->phone,
                    'client_name' => $order->client_name ?? 'Client',
                    'store_name' => $order->country ?? 'unknown',
                    'cc_agents' => $order->cc_email ?? null,
                    'message' => "Order {$order->order_no} — template send failed.",
                    'status' => 'failed',
                    'sid' => null,
                ]);
            }
        }

        $this->info("Done. Sent: {$sent}, Failed: {$failed}");
        Log::info('Command finished', ['sent' => $sent, 'failed' => $failed]);
    }

    // -----------------------------------------------------------------
    //  Phone formatting
    // -----------------------------------------------------------------
    private function formatPhone(?string $phoneNumber, string $countryCode): ?string
    {
        if (! $phoneNumber) {
            return null;
        }

        $phone = preg_replace('/\D/', '', $phoneNumber);
        if (! $phone || strlen($phone) < 9) {
            return null;
        }

        if (! preg_match('/^(254|255|256|260)/', $phone)) {
            $phone = (substr($phone, 0, 1) === '0')
                ? $countryCode.substr($phone, 1)
                : $countryCode.$phone;
        }

        return (strlen($phone) >= 12 && strlen($phone) <= 13) ? $phone : null;
    }
}
