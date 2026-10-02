<?php

namespace App\Console\Commands;

use App\Services\MetaCloudApiService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class SendUpcomingOrdersReminder extends Command
{
    protected $signature = 'orders:upcoming-reminder';

    protected $description = 'Send merchant order summary for orders with delivery date 4 days or more from now';

    private string $templateName = 'emily';

    private string $templateLanguage = 'en';

    public function handle(MetaCloudApiService $sender)
    {
        $targetDate = Carbon::now()->addDays(4)->toDateString();

        $records = DB::table('sheet_orders')
            ->select('merchant', DB::raw('COUNT(*) as total'))
            ->whereDate('delivery_date', '>=', $targetDate)
            ->whereIn('status', ['scheduled', 'pending'])
            ->groupBy('merchant')
            ->get();

        if ($records->isEmpty()) {
            $this->info('No matching orders found.');

            return;
        }

        // Build template single-line text
        $items = [];
        foreach ($records as $record) {
            $items[] = strtoupper($record->merchant).' - '.$record->total;
        }

        $templateVariable = implode(' | ', $items);

        $recipient = trim((string) config('services.orders_reminder.recipient_phone', ''));

        $missing = array_keys(array_filter([
            'ORDERS_REMINDER_RECIPIENT_PHONE' => $recipient,
            'WHATSAPP_CLOUD_ACCESS_TOKEN' => (string) config('services.whatsapp_cloud.access_token', ''),
            'WHATSAPP_CLOUD_PHONE_ID' => (string) config('services.whatsapp_cloud.phone_number_id', ''),
        ], fn ($value) => $value === ''));

        if ($missing !== []) {
            $this->error('Missing configuration: '.implode(', ', $missing).'. Set these in .env.');

            return self::FAILURE;
        }

        try {
            $sender->sendTemplate($recipient, $this->templateName, $this->templateLanguage, [
                ['type' => 'text', 'text' => $templateVariable],
            ]);

            $this->info('WhatsApp summary sent successfully.');
        } catch (\Throwable $e) {
            $this->error('Failed to send WhatsApp summary.');
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
