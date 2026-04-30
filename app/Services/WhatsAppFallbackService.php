<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class WhatsAppFallbackService
{
    public function sendText(string $phoneNumber, string $message, array $options = []): array
    {
        $countryCode = $options['country_code'] ?? '254';

        try {
            $result = $this->sendViaWasender($phoneNumber, $message, $countryCode);

            Log::info('WhatsApp send completed via primary provider.', [
                'provider' => $result['provider'],
                'to' => $result['to'],
                'message_id' => $result['message_id'],
            ]);

            return $result;
        } catch (\Throwable $primaryException) {
            Log::warning('Primary WhatsApp provider failed, attempting WAWP fallback.', [
                'provider' => 'wasender',
                'error' => $primaryException->getMessage(),
            ]);

            $result = $this->sendViaWawp($phoneNumber, $message, $countryCode, $primaryException);

            Log::warning('WhatsApp send completed via WAWP fallback.', [
                'provider' => $result['provider'],
                'to' => $result['to'],
                'message_id' => $result['message_id'],
                'fallback_from' => 'wasender',
            ]);

            return $result;
        }
    }

    public function formatForStorage(string $phoneNumber, ?string $countryCode = '254'): ?string
    {
        return $this->normalizeDigits($phoneNumber, $countryCode);
    }

    private function sendViaWasender(string $phoneNumber, string $message, string $countryCode): array
    {
        $formattedPhone = $this->normalizeDigits($phoneNumber, $countryCode);

        if (! $formattedPhone) {
            throw new \RuntimeException('Invalid phone number format for Wasender.');
        }

        $client = new \WasenderApi\WasenderClient((string) config('services.wasender.api_key', ''));
        $response = $client->sendText($formattedPhone, $message);

        return [
            'provider' => 'wasender',
            'to' => $formattedPhone,
            'message_id' => data_get($response, 'data.key.id'),
            'response' => $response,
        ];
    }

    private function sendViaWawp(string $phoneNumber, string $message, string $countryCode, \Throwable $primaryException): array
    {
        $instanceId = (string) config('services.wawp.instance_id', '');
        $accessToken = (string) config('services.wawp.access_token', '');

        if ($instanceId === '' || $accessToken === '') {
            throw new \RuntimeException(
                'WAWP fallback is not configured. Set WAWP_INSTANCE_ID and WAWP_ACCESS_TOKEN.',
                previous: $primaryException
            );
        }

        $formattedPhone = $this->normalizeDigits($phoneNumber, $countryCode);

        if (! $formattedPhone) {
            throw new \RuntimeException('Invalid phone number format for WAWP.', previous: $primaryException);
        }

        $chatId = "{$formattedPhone}@c.us";

        $response = Http::asJson()
            ->timeout((int) config('services.wawp.timeout', 20))
            ->post((string) config('services.wawp.base_url', 'https://api.wawp.net') . '/v2/send/text?' . http_build_query([
                'instance_id' => $instanceId,
                'access_token' => $accessToken,
            ]), [
                'chatId' => $chatId,
                'message' => $message,
            ]);

        if ($response->failed()) {
            Log::error('WAWP fallback send failed.', [
                'status' => $response->status(),
                'body' => $response->body(),
                'chat_id' => $chatId,
            ]);

            throw new \RuntimeException(
                'WAWP fallback failed: HTTP ' . $response->status() . ' ' . $response->body(),
                previous: $primaryException
            );
        }

        $payload = $response->json();

        return [
            'provider' => 'wawp',
            'to' => $formattedPhone,
            'message_id' => data_get($payload, '_data.id.id')
                ?? data_get($payload, '_data.id._serialized')
                ?? data_get($payload, 'data.key.id'),
            'response' => $payload,
        ];
    }

    private function normalizeDigits(?string $phoneNumber, ?string $countryCode = '254'): ?string
    {
        if (! $phoneNumber) {
            return null;
        }

        $phone = preg_replace('/\D/', '', $phoneNumber);

        if (! $phone || strlen($phone) < 9) {
            return null;
        }

        $countryCode = in_array($countryCode, ['254', '255'], true) ? $countryCode : '254';

        if (! preg_match('/^(254|255)/', $phone)) {
            if (str_starts_with($phone, '0')) {
                $phone = $countryCode . substr($phone, 1);
            } elseif (strlen($phone) === 9) {
                $phone = $countryCode . $phone;
            } else {
                $phone = $countryCode . substr($phone, -9);
            }
        }

        return strlen($phone) >= 12 && strlen($phone) <= 13 ? $phone : null;
    }
}
