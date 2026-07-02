<?php

namespace App\Console\Commands;

use App\Models\SheetOrder;
use App\Models\Whatsapp;
use App\Models\User;
use App\Services\WhatsAppFallbackService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Exception;

class NotifyOverdueOrders extends Command
{
    protected $signature = 'whatsapp:notify-overdue';
    protected $description = 'Send overdue order alerts to each assigned call center agent';

public function handle()
{
    Log::info('📢 Starting NotifyOverdueOrders (agent‑based) – daily reminder mode');

    // 1. Fetch overdue orders without a code
    $cutoffDate = Carbon::now()->subDays(2)->startOfDay();
    $orders = SheetOrder::whereIn('status', ['Scheduled', 'Dispatched'])
        ->whereDate('delivery_date', '<', $cutoffDate)
        ->where(function ($q) {
            $q->whereNull('code')->orWhere('code', '');
        })
        ->get();

    if ($orders->isEmpty()) {
        Log::info('✅ No overdue orders without a code found.');
        $this->info('No orders to notify.');
        return;
    }

    $this->info("📦 Found {$orders->count()} overdue orders.");

    // 2. Group orders by agent (cc_email)
    $agentGroups = $orders->groupBy('cc_email')->filter(function ($group, $agentName) {
        return !empty($agentName);
    });

    if ($agentGroups->isEmpty()) {
        Log::warning('⚠️ All orders have empty cc_email – nothing to send.');
        $this->warn('No agent names found in cc_email. Exiting.');
        return;
    }

    $this->info("👥 Found " . $agentGroups->count() . " agent(s) to notify.");

    // 3. Process each agent group
    foreach ($agentGroups as $agentName => $ordersForAgent) {
        try {
            // Look up the user by name (case‑insensitive)
            $user = User::whereRaw('LOWER(name) = ?', [strtolower(trim($agentName))])->first();

            if (!$user) {
                Log::warning("⏭️ Agent '{$agentName}' not found in users table – skipping " . $ordersForAgent->count() . " orders.");
                $this->warn("⏭️ Skipping agent '{$agentName}' – no user record.");
                continue;
            }

            $phone = $user->store_phone ?? null;
            if (empty($phone)) {
                Log::warning("⏭️ Agent '{$agentName}' has no store_phone – skipping " . $ordersForAgent->count() . " orders.");
                $this->warn("⏭️ Skipping agent '{$agentName}' – no phone number.");
                continue;
            }

            // Clean phone (digits only)
            $phone = preg_replace('/\D/', '', $phone);
            if (strlen($phone) < 10) {
                Log::warning("⏭️ Agent '{$agentName}' phone '{$phone}' is invalid – skipping.");
                $this->warn("⏭️ Skipping agent '{$agentName}' – invalid phone.");
                continue;
            }

            // Determine country code from the phone number (first 1‑3 digits)
            $countryCode = $this->getCountryCodeFromPhone($phone);

            // Build the message for this agent's orders
            $message = $this->buildAgentMessage($ordersForAgent, $agentName);

            // Send the message
            $sender = app(WhatsAppFallbackService::class);
            $result = $this->sendMessage($sender, $phone, $message, $countryCode);

            Log::info("✅ Alert sent to agent '{$agentName}'", [
                'to'         => $result['to'],
                'message_id' => $result['message_id'] ?? 'N/A',
                'order_count'=> $ordersForAgent->count(),
            ]);

            // Log the sent message (optional audit)
            Whatsapp::create([
                'to'          => $result['to'],
                'client_name' => $agentName,
                'store_name'  => 'System',
                'cc_agents'   => $agentName,
                'message'     => $message,
                'status'      => 'sent',
                'sid'         => $result['message_id'] ?? null,
            ]);

            $this->info("✅ Sent to agent '{$agentName}' – {$ordersForAgent->count()} orders.");

        } catch (Exception $e) {
            Log::error("❌ Failed to send to agent '{$agentName}': " . $e->getMessage());
            $this->error("❌ Failed for agent '{$agentName}': " . $e->getMessage());
            // Continue with other agents
        }
    }

    // 💡 UPDATE REMOVED – code column is NOT changed.
    // Orders will remain without a code and will be picked up again on next run.

    Log::info('🏁 Command finished (reminder mode).');
    $this->info('🏁 Done – no code columns were updated.');
}

    /**
     * Build a WhatsApp message for a specific agent, grouping their orders by merchant.
     */
    private function buildAgentMessage($orders, string $agentName): string
    {
        $lines = [];
        $lines[] = "👋 Hello *{$agentName}*,";
        $lines[] = "The following orders assigned to you are still *Scheduled* or *Dispatched* but their delivery date passed more than 2 days ago, and no code has been assigned:";
        $lines[] = "";

        // Group by merchant (merchant column, fallback client_name)
        $grouped = $orders->groupBy(function ($order) {
            return $order->merchant ?? $order->client_name ?? 'Unknown Merchant';
        });

        foreach ($grouped as $merchant => $ordersGroup) {
            $orderNumbers = $ordersGroup->pluck('order_no')->filter()->implode(', ');
            if (empty($orderNumbers)) {
                continue;
            }
            $lines[] = "🏢 *{$merchant}*";
            $lines[] = "   Orders: {$orderNumbers}";
            $lines[] = "";
        }

        $lines[] = "Please follow up with these merchants to resolve the status and assign codes.";
        $lines[] = "_This is an automated alert – do not reply._";

        return implode("\n", $lines);
    }

    /**
     * Extract the country code from a phone number (first 1‑3 digits).
     * Defaults to 254 if not recognised.
     */
    private function getCountryCodeFromPhone(string $phone): string
    {
        // Check known prefixes
        $prefixes = ['254', '255', '256', '260'];
        foreach ($prefixes as $code) {
            if (strpos($phone, $code) === 0) {
                return $code;
            }
        }
        // Fallback
        return '254';
    }

    // -----------------------------------------------------------------
    //  Sending logic (slightly modified to accept country code)
    // -----------------------------------------------------------------
    private function sendMessage(WhatsAppFallbackService $sender, string $to, string $message, string $countryCode = '254'): array
    {
        $options = ['country_code' => $countryCode];

        try {
            $result = $sender->sendText($to, $message, $options);
            if (($result['response']['success'] ?? null) === false) {
                Log::warning('Primary provider error: ' . ($result['response']['message'] ?? ''));
                throw new Exception('Primary error');
            }
            return $result;
        } catch (\Throwable $e) {
            Log::warning('Primary failed: ' . $e->getMessage());
            if (env('OPENWA_FALLBACK_ENABLED', true)) {
                return $this->sendViaOpenWA($to, $message, $options);
            }
            throw new Exception('Primary failed and OpenWA fallback disabled.');
        }
    }

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

        $response = \Illuminate\Support\Facades\Http::withHeaders($this->openwaHeaders($apiKey))
            ->post($url, [
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

    private function getSessionForCountry(string $countryCode): ?string
    {
        return match($countryCode) {
            '254' => env('OPENWA_SESSION_KENYA',    null),
            '255' => env('OPENWA_SESSION_TANZANIA', null),
            '256' => env('OPENWA_SESSION_UGANDA',   null),
            '260' => env('OPENWA_SESSION_ZAMBIA',   null),
            default => null,
        };
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
}