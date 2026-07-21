<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;

class WhatsAppFallbackService
{
    private MetaCloudApiService $meta;

    public function __construct(MetaCloudApiService $meta)
    {
        $this->meta = $meta;
    }

    /**
     * Send a text message via Meta WhatsApp Cloud API.
     */
    public function sendText(string $phoneNumber, string $message, array $options = []): array
    {
        $countryCode = $options['country_code'] ?? '254';

        $result = $this->meta->sendText($phoneNumber, $message);

        Log::info('WhatsApp message sent via Meta Cloud API.', [
            'provider' => $result['provider'],
            'to' => $result['to'],
            'message_id' => $result['message_id'],
        ]);

        return $result;
    }

    /**
     * Send a pre-approved template message.
     */
    public function sendTemplate(
        string $phoneNumber,
        string $templateName,
        string $languageCode = 'en_US',
        array $parameters = [],
        array $options = [],
    ): array {
        $result = $this->meta->sendTemplate($phoneNumber, $templateName, $languageCode, $parameters);

        Log::info('WhatsApp template sent via Meta Cloud API.', [
            'provider' => $result['provider'],
            'to' => $result['to'],
            'message_id' => $result['message_id'],
            'template' => $templateName,
        ]);

        return $result;
    }

    /**
     * Format a phone number for storage.
     */
    public function formatForStorage(string $phoneNumber, ?string $countryCode = '254'): ?string
    {
        return $this->meta->formatForStorage($phoneNumber, $countryCode);
    }
}
