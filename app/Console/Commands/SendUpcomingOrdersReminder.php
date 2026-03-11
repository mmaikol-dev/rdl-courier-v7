<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Carbon\Carbon;

class SendUpcomingOrdersReminder extends Command
{
    protected $signature = 'orders:upcoming-reminder';
    protected $description = 'Send merchant order summary for orders with delivery date 4 days or more from now';

    public function handle()
    {
        $targetDate = Carbon::now()->addDays(4)->toDateString();

        $records = DB::table('sheet_orders')
            ->select('merchant', DB::raw('COUNT(*) as total'))
            ->whereDate('delivery_date', '>=', $targetDate)
            ->whereIn('status', ['scheduled', 'pending'])
            ->groupBy('merchant')
            ->get();

        if ($records->isEmpty()) {
            $this->info("No matching orders found.");
            return;
        }

        // Build template single-line text
        $items = [];
        foreach ($records as $record) {
            $items[] = strtoupper($record->merchant) . " - " . $record->total;
        }

        $templateVariable = implode(' | ', $items);

        // WhatsApp Cloud API config
        $phone = "+254740801187";
        $templateName = "emily";
        $phoneNumberId = "825780310626033";
        $accessToken = "EAAaqkTmPlPQBQF4WKYtr80qPkjrD2uj4zLwqGxTOznoXfwenforoZC3BOX4gJB1cPtgCNUr1bOrYoZAFZC7fNPOAEO7q3eiqz1A5Hm666xZAn2pBubYeMExqjxVorQ7nZAlzY2dOcZA9qm32u2Cc0fk195vNoY9oZABMa3b5xrxyWNJDKKtQays1Tl5d7SSEJWOBWnr6GQ0ZBupO";

        $url = "https://graph.facebook.com/v22.0/{$phoneNumberId}/messages";

        $response = Http::withToken($accessToken)->post($url, [
            'messaging_product' => 'whatsapp',
            'to' => $phone,
            'type' => 'template',
            'template' => [
                'name' => $templateName,
                'language' => ['code' => 'en'],
                'components' => [
                    [
                        'type' => 'body',
                        'parameters' => [
                            [
                                'type' => 'text',
                                'text' => $templateVariable
                            ]
                        ]
                    ]
                ]
            ]
        ]);

        if ($response->successful()) {
            $this->info("WhatsApp summary sent successfully.");
        } else {
            $this->error("Failed to send WhatsApp summary.");
            $this->error($response->body());
        }
    }
}
