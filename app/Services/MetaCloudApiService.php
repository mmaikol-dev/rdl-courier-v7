<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

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
    //  Media helpers
    // -----------------------------------------------------------------

    /**
     * Retrieve the download URL and metadata for a media ID.
     *
     * @return array{url: string, mime_type: string, file_size: int, id: string}
     */
    public function getMediaUrl(string $mediaId): array
    {
        $url = "https://graph.facebook.com/{$this->apiVersion}/{$mediaId}";

        $response = Http::withToken($this->accessToken)->get($url);

        if ($response->failed()) {
            Log::error('Meta Cloud API: failed to get media URL', [
                'media_id' => $mediaId,
                'status' => $response->status(),
                'body' => $response->body(),
            ]);

            throw new \RuntimeException("Failed to get media URL for media ID: {$mediaId}");
        }

        $payload = $response->json();

        Log::info('Meta Cloud API: media URL retrieved', [
            'media_id' => $mediaId,
            'mime_type' => $payload['mime_type'] ?? 'unknown',
            'file_size' => $payload['file_size'] ?? 0,
        ]);

        return [
            'url' => $payload['url'] ?? '',
            'mime_type' => $payload['mime_type'] ?? 'application/octet-stream',
            'file_size' => $payload['file_size'] ?? 0,
            'id' => $payload['id'] ?? $mediaId,
        ];
    }

    /**
     * Download media binary from a URL and save to local storage.
     *
     * @return array{media_path: string, mime_type: string}
     */
    public function downloadMedia(string $mediaUrl, string $mimeType = 'application/octet-stream'): array
    {
        $response = Http::withToken($this->accessToken)->get($mediaUrl);

        if ($response->failed()) {
            Log::error('Meta Cloud API: failed to download media', [
                'url' => $mediaUrl,
                'status' => $response->status(),
            ]);

            throw new \RuntimeException("Failed to download media from URL: {$mediaUrl}");
        }

        $extension = $this->getExtensionForMime($mimeType);
        $filename = Str::uuid().'.'.$extension;
        $storagePath = "whatsapp-media/{$filename}";

        \Storage::put($storagePath, $response->body());

        Log::info('Meta Cloud API: media downloaded and saved', [
            'path' => $storagePath,
            'mime_type' => $mimeType,
            'size' => strlen($response->body()),
        ]);

        return [
            'media_path' => $storagePath,
            'mime_type' => $mimeType,
        ];
    }

    /**
     * Map a MIME type to a file extension.
     */
    public function getExtensionForMime(string $mimeType): string
    {
        $map = [
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            'video/mp4' => 'mp4',
            'video/3gpp' => '3gp',
            'audio/mpeg' => 'mp3',
            'audio/ogg' => 'ogg',
            'audio/amr' => 'amr',
            'audio/aac' => 'aac',
            'audio/mp4' => 'm4a',
            'application/pdf' => 'pdf',
            'application/msword' => 'doc',
            'application/vnd.ms-excel' => 'xls',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
            'application/vnd.ms-powerpoint' => 'ppt',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation' => 'pptx',
            'text/plain' => 'txt',
        ];

        $base = explode(';', $mimeType)[0] ?? $mimeType;

        return $map[$base] ?? $map[$mimeType] ?? 'bin';
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
