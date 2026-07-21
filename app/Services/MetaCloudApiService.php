<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class MetaCloudApiService
{
    private string $phoneNumberId;

    private string $accessToken;

    private string $apiVersion;

    public function __construct()
    {
        $this->phoneNumberId = (string) config('services.whatsapp_cloud.phone_number_id', '');
        $this->accessToken = (string) config('services.whatsapp_cloud.access_token', '');
        $this->apiVersion = (string) config('services.whatsapp_cloud.api_version', 'v22.0');
    }

    /**
     * Send a freeform text message (session message — must be within 24h of customer reply).
     */
    public function sendText(string $phoneNumber, string $message): array
    {
        $formatted = $this->formatPhone($phoneNumber);

        if (! $formatted) {
            throw new \InvalidArgumentException("Invalid phone number: {$phoneNumber}");
        }

        $url = $this->baseUrl().'/messages';

        $response = Http::withToken($this->accessToken)->post($url, [
            'messaging_product' => 'whatsapp',
            'to' => $formatted,
            'type' => 'text',
            'text' => ['body' => $message],
        ]);

        return $this->parseResponse($response, $formatted);
    }

    /**
     * Send a pre-approved template message (for business-initiated outreach).
     *
     * @param  string[]  $parameters  Template body parameters [{type: "text", text: "..."}]
     */
    public function sendTemplate(
        string $phoneNumber,
        string $templateName,
        string $languageCode = 'en_US',
        array $parameters = [],
    ): array {
        $formatted = $this->formatPhone($phoneNumber);

        if (! $formatted) {
            throw new \InvalidArgumentException("Invalid phone number: {$phoneNumber}");
        }

        $url = $this->baseUrl().'/messages';

        $template = [
            'name' => $templateName,
            'language' => ['code' => $languageCode],
        ];

        if ($parameters !== []) {
            $template['components'] = [
                [
                    'type' => 'body',
                    'parameters' => $parameters,
                ],
            ];
        }

        $response = Http::withToken($this->accessToken)->post($url, [
            'messaging_product' => 'whatsapp',
            'to' => $formatted,
            'type' => 'template',
            'template' => $template,
        ]);

        return $this->parseResponse($response, $formatted);
    }

    /**
     * Format a phone number for the Meta API (digits only, with country prefix, no +).
     */
    public function formatPhone(?string $phoneNumber, ?string $countryCode = '254'): ?string
    {
        if (! $phoneNumber) {
            return null;
        }

        $phone = preg_replace('/\D/', '', $phoneNumber);

        if (! $phone || strlen($phone) < 9) {
            return null;
        }

        if (! preg_match('/^(254|255|256|260)/', $phone)) {
            if (str_starts_with($phone, '0')) {
                $phone = $countryCode.substr($phone, 1);
            } elseif (strlen($phone) === 9) {
                $phone = $countryCode.$phone;
            } else {
                $phone = $countryCode.substr($phone, -9);
            }
        }

        return strlen($phone) >= 12 && strlen($phone) <= 13 ? $phone : null;
    }

    /**
     * Store-friendly alias for phone formatting.
     */
    public function formatForStorage(string $phoneNumber, ?string $countryCode = '254'): ?string
    {
        return $this->formatPhone($phoneNumber, $countryCode);
    }

    // -----------------------------------------------------------------
    //  Private helpers
    // -----------------------------------------------------------------

    private function baseUrl(): string
    {
        return "https://graph.facebook.com/{$this->apiVersion}/{$this->phoneNumberId}";
    }

    private function parseResponse($response, string $formattedPhone): array
    {
        if ($response->failed()) {
            Log::error('Meta Cloud API request failed', [
                'status' => $response->status(),
                'body' => $response->body(),
            ]);

            throw new \RuntimeException(
                'Meta Cloud API failed: HTTP '.$response->status().' '.$response->body()
            );
        }

        $payload = $response->json();
        $messageId = data_get($payload, 'messages.0.id', '');

        Log::info('Meta Cloud API message sent', [
            'to' => $formattedPhone,
            'message_id' => $messageId,
        ]);

        return [
            'provider' => 'meta_cloud_api',
            'to' => $formattedPhone,
            'message_id' => $messageId,
            'response' => $payload,
        ];
    }
}
