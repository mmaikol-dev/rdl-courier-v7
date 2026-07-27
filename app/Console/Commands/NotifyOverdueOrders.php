<?php

namespace App\Console\Commands;

use App\Models\SheetOrder;
use App\Models\User;
use App\Models\Whatsapp;
use App\Services\OpenwaService;
use Carbon\Carbon;
use Exception;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class NotifyOverdueOrders extends Command
{
    protected $signature = 'whatsapp:notify-overdue';

    protected $description = 'Send overdue order alerts to each assigned call center agent';

    public function handle()
    {
        Log::info('📢 Starting NotifyOverdueOrders (agent‑based) – daily reminder mode');

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

        $agentGroups = $orders->groupBy('cc_email')->filter(function ($group, $agentName) {
            return ! empty($agentName);
        });

        if ($agentGroups->isEmpty()) {
            Log::warning('⚠️ All orders have empty cc_email – nothing to send.');
            $this->warn('No agent names found in cc_email. Exiting.');

            return;
        }

        $this->info('👥 Found '.$agentGroups->count().' agent(s) to notify.');

        $sender = app(OpenwaService::class);

        foreach ($agentGroups as $agentName => $ordersForAgent) {
            try {
                $user = User::whereRaw('LOWER(name) = ?', [strtolower(trim($agentName))])->first();

                if (! $user) {
                    Log::warning("⏭️ Agent '{$agentName}' not found in users table – skipping ".$ordersForAgent->count().' orders.');
                    $this->warn("⏭️ Skipping agent '{$agentName}' – no user record.");

                    continue;
                }

                $phone = $user->store_phone ?? null;
                if (empty($phone)) {
                    Log::warning("⏭️ Agent '{$agentName}' has no store_phone – skipping ".$ordersForAgent->count().' orders.');
                    $this->warn("⏭️ Skipping agent '{$agentName}' – no phone number.");

                    continue;
                }

                $phone = preg_replace('/\D/', '', $phone);
                if (strlen($phone) < 10) {
                    Log::warning("⏭️ Agent '{$agentName}' phone '{$phone}' is invalid – skipping.");
                    $this->warn("⏭️ Skipping agent '{$agentName}' – invalid phone.");

                    continue;
                }

                $country = 'kenya';

                $message = $this->buildAgentMessage($ordersForAgent, $agentName);

                $result = $sender->sendToNumber($country, $phone, $message);

                Log::info("✅ Alert sent to agent '{$agentName}'", [
                    'to' => $phone,
                    'message_id' => $result['message_id'] ?? 'N/A',
                    'order_count' => $ordersForAgent->count(),
                ]);

                Whatsapp::create([
                    'to' => $phone,
                    'client_name' => $agentName,
                    'store_name' => 'System',
                    'cc_agents' => $agentName,
                    'message' => $message,
                    'status' => 'sent',
                    'sid' => $result['message_id'] ?? null,
                ]);

                $this->info("✅ Sent to agent '{$agentName}' – {$ordersForAgent->count()} orders.");

            } catch (Exception $e) {
                Log::error("❌ Failed to send to agent '{$agentName}': ".$e->getMessage());
                $this->error("❌ Failed for agent '{$agentName}': ".$e->getMessage());
            }
        }

        Log::info('🏁 Command finished (reminder mode).');
        $this->info('🏁 Done – no code columns were updated.');
    }

    private function buildAgentMessage($orders, string $agentName): string
    {
        $lines = [];
        $lines[] = "👋 Hello *{$agentName}*,";
        $lines[] = 'The following orders assigned to you are still *Scheduled* or *Dispatched* but their delivery date passed more than 2 days ago, and no code has been assigned:';
        $lines[] = '';

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
            $lines[] = '';
        }

        $lines[] = 'Please follow up with these merchants to resolve the status and assign codes.';
        $lines[] = '_This is an automated alert – do not reply._';

        return implode("\n", $lines);
    }


}
