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
            '260'  => '+260 740 801 187',   // Zambia
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
                    $this->error("Skipping order {$orderNo} â€“ no phone.");
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
                $previewBody = "Hello {$clientName},\n\nYour order *{$orderNo}* for *{$productName}* ({$quantity} pcs), valued at *{$amount}*, is scheduled for delivery *today*.\n\nOur delivery team will be in touch shortly. Please ensure your phone is available and someone is present to receive the package.\n\nIf you have any questions or need to make changes, contact us at *{$this->getContactForCountry($countryCode)}*.\n\nThank you for choosing *RealDeal Logistics*! ðŸ“¦";
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
                $this->error("Failed: {$order->order_no} â€“ ".$e->getMessage());
                $failed++;

                Whatsapp::create([
                    'to' => $order->phone,
                    'client_name' => $order->client_name ?? 'Client',
                    'store_name' => $order->country ?? 'unknown',
                    'cc_agents' => $order->cc_email ?? null,
                    'message' => "Order {$order->order_no} â€” template send failed.",
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
