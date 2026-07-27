<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class OpenwaService
{
    private const COUNTRY_CODES = [
        'kenya'    => '254',
        'tanzania' => '255',
        'uganda'   => '256',
        'zambia'   => '260',
    ];

    private const GROUP_IDS = [
        '254' => '120363430968913090@g.us',
        '255' => '120363411453438004@g.us',
        '256' => '120363426385787478@g.us',
        '260' => '120363409224310826@g.us',
    ];

    public function sendToGroup(string $countryName, string $message): array
    {
        $countryCode = $this->countryNameToCode($countryName);
        $chatId = $this->resolveGroupChatId($countryCode);

        return $this->send('254', $chatId, $message);
    }

    public function sendToNumber(string $countryName, string $phoneNumber, string $message): array
    {
        $countryCode = $this->countryNameToCode($countryName);
        $cleanPhone = $this->cleanPhoneNumber($phoneNumber);

        if (!$cleanPhone) {
            throw new \InvalidArgumentException("Invalid phone number: {$phoneNumber}");
        }

        $chatId = $cleanPhone . '@c.us';

        return $this->send($countryCode, $chatId, $message);
    }

    public function countryNameToCode(string $countryName): string
    {
        $key = mb_strtolower(trim($countryName));

        return self::COUNTRY_CODES[$key] ?? '254';
    }

    public function cleanPhoneNumber(?string $phoneNumber): ?string
    {
        if (!$phoneNumber) return null;

        $phone = preg_replace('/\D/', '', $phoneNumber);

        return strlen($phone) >= 9 ? $phone : null;
    }

    private function resolveGroupChatId(string $countryCode): string
    {
        return self::GROUP_IDS[$countryCode]
            ?? throw new \InvalidArgumentException("No group chat ID configured for country code {$countryCode}.");
    }

    private function getSessionId(string $countryCode): string
    {
        $configKey = match ($countryCode) {
            '254' => 'services.openwa.sessions.254',
            '255' => 'services.openwa.sessions.255',
            '256' => 'services.openwa.sessions.256',
            '260' => 'services.openwa.sessions.260',
            default => null,
        };

        $sessionId = $configKey ? config($configKey) : null;

        if (empty($sessionId)) {
            throw new \RuntimeException("No OpenWA session configured for country code {$countryCode}.");
        }

        return $sessionId;
    }

    private function send(string $countryCode, string $chatId, string $message): array
    {
        $sessionId = $this->getSessionId($countryCode);
        $baseUrl = config('services.openwa.base_url', env('OPENWA_BASE_URL', 'https://api.sitebase.co.ke'));
        $apiKey = config('services.openwa.api_key', env('OPENWA_API_KEY', ''));

        if (empty($apiKey)) {
            throw new \RuntimeException('OPENWA_API_KEY is not configured.');
        }

        $url = rtrim($baseUrl, '/') . "/api/sessions/{$sessionId}/messages/send-text";

        Log::info('Sending via OpenWA', [
            'chatId' => $chatId,
            'country_code' => $countryCode,
            'url' => $url,
        ]);

        $response = Http::withHeaders($this->headers($apiKey))
            ->timeout(30)
            ->post($url, [
                'chatId' => $chatId,
                'text' => $message,
            ]);

        Log::info('OpenWA response', [
            'status' => $response->status(),
            'body' => $response->body(),
        ]);

        if (!$response->successful()) {
            throw new \RuntimeException(
                'OpenWA request failed (HTTP ' . $response->status() . '): ' . $response->body()
            );
        }

        $data = $response->json();

        if (empty($data['messageId'])) {
            throw new \RuntimeException('OpenWA did not return a valid messageId.');
        }

        return [
            'provider' => 'openwa',
            'to' => $chatId,
            'message_id' => $data['messageId'],
        ];
    }

    private function headers(string $apiKey): array
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
