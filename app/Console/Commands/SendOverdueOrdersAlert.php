<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use App\Models\Whatsapp;
use App\Models\SheetOrder;
use Carbon\Carbon;
use WasenderApi\WasenderClient;
use WasenderApi\Exceptions\WasenderApiException;
use Exception;

class SendOverdueOrdersAlert extends Command
{
    protected $signature = 'whatsapp:send-overdue-alert';
    protected $description = 'Send WhatsApp alerts to call center agents for overdue scheduled orders via WasenderAPI';

    /**
     * Get WasenderAPI client instance
     */
    private function getClient(): WasenderClient
    {
        return new WasenderClient((string) config('services.wasender.overdue_alert_api_key', ''));
    }

    private function callCenterAgents(): array
    {
        return config('services.wasender.call_center_agents', []);
    }

    public function handle()
    {
        Log::info('Starting SendOverdueOrdersAlert command with WasenderAPI');

        // Get all orders with status 'Scheduled' and delivery_date in the past
        $today = Carbon::today();
        
        $allOverdueOrders = SheetOrder::where('status', 'Scheduled')
            ->whereDate('delivery_date', '<', $today)
            ->orderBy('delivery_date', 'asc')
            ->get();

        if ($allOverdueOrders->isEmpty()) {
            Log::info('No overdue scheduled orders found.');
            $this->info('✅ No overdue orders to report.');
            return;
        }

        $totalCount = $allOverdueOrders->count();
        $this->info("Found {$totalCount} overdue order(s).");

        // Limit to first 10 orders
        $overdueOrders = $allOverdueOrders->take(10);

        // Group orders by store for better organization
        $ordersByStore = $overdueOrders->groupBy('store_name');

        // Build the alert message
        $alertMessage = "⚠️ *OVERDUE ORDERS ALERT* ⚠️\n\n";
        $alertMessage .= "Total Overdue Orders: *{$totalCount}*\n";
        $alertMessage .= "Showing: *" . $overdueOrders->count() . "* most urgent\n\n";
        $alertMessage .= "─────────────────────\n\n";

        foreach ($ordersByStore as $storeName => $orders) {
            $alertMessage .= "*{$storeName}:*\n";
            
            foreach ($orders as $order) {
                $deliveryDate = Carbon::parse($order->delivery_date)->format('d M Y');
                $daysOverdue = Carbon::parse($order->delivery_date)->diffInDays($today);
                
                $alertMessage .= "• Order #{$order->order_no}\n";
                $alertMessage .= "  Client: {$order->client_name}\n";
                $alertMessage .= "  Product: {$order->product_name} ({$order->quantity} pcs)\n";
                $alertMessage .= "  Due Date: {$deliveryDate} ({$daysOverdue} day" . ($daysOverdue > 1 ? 's' : '') . " overdue)\n";
                $alertMessage .= "  Phone: {$order->phone}\n\n";
            }
        }

        if ($totalCount > 10) {
            $remaining = $totalCount - 10;
            $alertMessage .= "─────────────────────\n";
            $alertMessage .= "⚠️ +{$remaining} more overdue order" . ($remaining > 1 ? 's' : '') . " not shown\n\n";
        }

        $alertMessage .= "Please follow up on these orders urgently.";

        // Send to each call center agent via WasenderAPI
        foreach ($this->callCenterAgents() as $agentPhone) {
            try {
                $client = $this->getClient();
                $response = $client->sendText($agentPhone, $alertMessage);

                // Extract message ID from response
                $messageId = $response['data']['key']['id'] ?? null;

                Whatsapp::create([
                    'to' => $agentPhone,
                    'client_name' => 'Call Center Agent',
                    'store_name' => 'ADMIN',
                    'cc_agents' => null,
                    'message' => $alertMessage,
                    'status' => 'sent',
                    'sid' => $messageId,
                ]);

                $this->info("✅ Alert sent to {$agentPhone}");
                Log::info("Overdue orders alert sent to {$agentPhone}");

            } catch (WasenderApiException $e) {
                Log::error('❌ Failed to send overdue orders alert via WasenderAPI', [
                    'error' => $e->getMessage(),
                    'phone' => $agentPhone,
                ]);

                Whatsapp::create([
                    'to' => $agentPhone,
                    'client_name' => 'Call Center Agent',
                    'store_name' => 'ADMIN',
                    'cc_agents' => null,
                    'message' => $alertMessage,
                    'status' => 'failed',
                    'sid' => null,
                ]);

                $this->error("❌ Failed to send to {$agentPhone}: " . $e->getMessage());

            } catch (Exception $e) {
                Log::error('❌ Failed to send overdue orders alert', [
                    'error' => $e->getMessage(),
                    'phone' => $agentPhone,
                ]);

                Whatsapp::create([
                    'to' => $agentPhone,
                    'client_name' => 'Call Center Agent',
                    'store_name' => 'ADMIN',
                    'cc_agents' => null,
                    'message' => $alertMessage,
                    'status' => 'failed',
                    'sid' => null,
                ]);

                $this->error("❌ Error: " . $e->getMessage());
            }
        }

        Log::info('SendOverdueOrdersAlert command completed.');
    }
}
