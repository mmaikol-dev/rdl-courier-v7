<?php

namespace App\Console\Commands;

use App\Http\Controllers\MetaWebhookController;
use App\Services\MetaCloudApiService;
use Illuminate\Console\Command;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class SimulateWhatsAppMediaWebhook extends Command
{
    protected $signature = 'whatsapp:simulate-media
                            {--count=1 : Number of messages to send per type}
                            {--phone=254712345678 : Sender phone number}';

    protected $description = 'Simulate incoming WhatsApp webhook for all media formats (image, video, audio, document, sticker)';

    private string $senderPhone;
    private int $count;
    private array $results = [];

    public function handle(): int
    {
        $this->senderPhone = $this->option('phone');
        $this->count = (int) $this->option('count');

        $this->info('');
        $this->info('=======================================================');
        $this->info('  WhatsApp Media Webhook Simulator');
        $this->info('=======================================================');
        $this->info("  Sender: {$this->senderPhone}");
        $this->info("  Messages per type: {$this->count}");
        $this->info('=======================================================');
        $this->info('');

        // Create real test media files in storage
        $testFiles = $this->createTestMediaFiles();

        // Mock MetaCloudApiService to serve local files instead of hitting Meta API
        $this->mockMetaService($testFiles);

        $mediaTypes = [
            'image' => [
                'mime' => 'image/jpeg',
                'caption' => 'Test image caption',
            ],
            'video' => [
                'mime' => 'video/mp4',
                'caption' => 'Test video caption',
            ],
            'audio' => [
                'mime' => 'audio/ogg',
                'caption' => null,
            ],
            'document' => [
                'mime' => 'application/pdf',
                'filename' => 'test-document.pdf',
            ],
            'sticker' => [
                'mime' => 'image/webp',
                'caption' => null,
            ],
        ];

        foreach ($mediaTypes as $type => $config) {
            for ($i = 1; $i <= $this->count; $i++) {
                $this->sendMediaWebhook($type, $config, $i);
            }
        }

        // Summary
        $this->info('');
        $this->info('=======================================================');
        $this->info('  Results Summary');
        $this->info('=======================================================');

        $table = [];
        foreach ($this->results as $r) {
            $table[] = [
                $r['type'],
                $r['iteration'],
                $r['saved'] ? '<info>YES</info>' : '<error>NO</error>',
                $r['media_saved'] ? '<info>YES</info>' : '<comment>NO</comment>',
                $r['media_path'] ?? 'N/A',
                $r['error'] ?? '-',
            ];
        }

        $this->table(['Type', '#', 'Saved', 'Media', 'Path', 'Notes'], $table);

        $this->info('');
        $this->info('=======================================================');
        $this->info('  Check the WhatsApp Chats page to see the messages.');
        $this->info('  Check storage/app/private/whatsapp-media/ for files.');
        $this->info('=======================================================');

        return self::SUCCESS;
    }

    private function createTestMediaFiles(): array
    {
        $this->line('Creating test media files in storage...');

        $files = [];

        // Tiny valid JPEG (1x1 pixel red)
        $jpegData = base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAyACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAFRABAQAAAAAAAAAAAAAAAAAAAAf/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AasBpLmqe4RU+lLBMpJZ3mZV+Nn5eLjxY+PHk+XPw8fHj5/8QAFhEBAQEAAAAAAAAAAAAAAAAAAQAR/9oADAMBAAIRAxEAPwDsgABa1N2CbmZVN7Mqm9mVTenJpf/9k=');
        $files['image/jpeg'] = ['path' => 'whatsapp-media/test-image.jpg', 'data' => $jpegData];
        Storage::put($files['image/jpeg']['path'], $jpegData);

        // Tiny valid MP4 (minimal container)
        $mp4Data = base64_decode('AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=');
        $files['video/mp4'] = ['path' => 'whatsapp-media/test-video.mp4', 'data' => $mp4Data];
        Storage::put($files['video/mp4']['path'], $mp4Data);

        // Tiny valid OGG audio
        $oggData = base64_decode('T2dnUwACAAAAAAAAAAAAAgAAAA==');
        $files['audio/ogg'] = ['path' => 'whatsapp-media/test-audio.ogg', 'data' => $oggData];
        Storage::put($files['audio/ogg']['path'], $oggData);

        // Minimal PDF
        $pdfData = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 3 3]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF";
        $files['application/pdf'] = ['path' => 'whatsapp-media/test-document.pdf', 'data' => $pdfData];
        Storage::put($files['application/pdf']['path'], $pdfData);

        // Tiny WebP sticker
        $webpData = base64_decode('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA');
        $files['image/webp'] = ['path' => 'whatsapp-media/test-sticker.webp', 'data' => $webpData];
        Storage::put($files['image/webp']['path'], $webpData);

        $this->info('  Created 5 test files in storage/app/private/whatsapp-media/');

        return $files;
    }

    private function mockMetaService(array $testFiles): void
    {
        // Build a map of media_id => test file info
        $mediaMap = [];
        foreach ($testFiles as $mimeType => $fileInfo) {
            $mediaId = 'TEST_MEDIA_' . strtoupper(Str::random(8));
            $mediaMap[$mediaId] = [
                'url' => 'https://fake-meta.example.com/media/' . $mediaId,
                'mime_type' => $mimeType,
                'file_size' => strlen($fileInfo['data']),
                'id' => $mediaId,
                'local_path' => $fileInfo['path'],
            ];
        }

        $this->mediaMap = $mediaMap;

        // Swap the real MetaCloudApiService with a mock in the container
        app()->bind(MetaCloudApiService::class, function () use ($mediaMap) {
            return new class($mediaMap) extends MetaCloudApiService
            {
                private array $mediaMap;

                public function __construct(array $mediaMap)
                {
                    // Skip parent constructor (it reads env config)
                    $this->mediaMap = $mediaMap;
                }

                public function getMediaUrl(string $mediaId): array
                {
                    if (isset($this->mediaMap[$mediaId])) {
                        $entry = $this->mediaMap[$mediaId];

                        return [
                            'url' => $entry['url'],
                            'mime_type' => $entry['mime_type'],
                            'file_size' => $entry['file_size'],
                            'id' => $entry['id'],
                        ];
                    }

                    throw new \RuntimeException("Mock: unknown media ID: {$mediaId}");
                }

                public function downloadMedia(string $mediaUrl, string $mimeType = 'application/octet-stream'): array
                {
                    // Find the matching entry by URL
                    foreach ($this->mediaMap as $entry) {
                        if ($entry['url'] === $mediaUrl) {
                            $extension = $this->getExtensionForMime($entry['mime_type']);
                            $filename = Str::uuid() . '.' . $extension;
                            $storagePath = "whatsapp-media/{$filename}";

                            \Storage::put($storagePath, \Storage::get($entry['local_path']));

                            return [
                                'media_path' => $storagePath,
                                'mime_type' => $entry['mime_type'],
                            ];
                        }
                    }

                    throw new \RuntimeException("Mock: no local file for URL: {$mediaUrl}");
                }
            };
        });
    }

    private array $mediaMap = [];

    private function sendMediaWebhook(string $type, array $config, int $iteration): void
    {
        $messageId = 'wamid.' . Str::random(32);
        $timestamp = time();
        $mediaEntry = reset($this->mediaMap);

        // Find the matching media entry for this type
        foreach ($this->mediaMap as $entry) {
            if ($entry['mime_type'] === $config['mime']) {
                $mediaEntry = $entry;
                break;
            }
        }

        $mediaPayload = match ($type) {
            'image' => ['image' => ['id' => $mediaEntry['id'], 'caption' => $config['caption'] ?? '']],
            'video' => ['video' => ['id' => $mediaEntry['id'], 'caption' => $config['caption'] ?? '']],
            'audio' => ['audio' => ['id' => $mediaEntry['id']]],
            'document' => ['document' => ['id' => $mediaEntry['id'], 'filename' => $config['filename'] ?? 'document.pdf', 'caption' => '']],
            'sticker' => ['sticker' => ['id' => $mediaEntry['id']]],
        };

        $payload = [
            'object' => 'whatsapp_business_account',
            'entry' => [
                [
                    'id' => 'WHATSAPP_BUSINESS_ACCOUNT_ID',
                    'changes' => [
                        [
                            'value' => [
                                'messaging_product' => 'whatsapp',
                                'metadata' => [
                                    'display_phone_number' => '254700000000',
                                    'phone_number_id' => '123456789',
                                ],
                                'contacts' => [
                                    [
                                        'profile' => ['name' => "Test User {$iteration}"],
                                        'wa_id' => $this->senderPhone,
                                    ],
                                ],
                                'messages' => [
                                    array_merge([
                                        'from' => $this->senderPhone,
                                        'id' => $messageId,
                                        'timestamp' => (string) $timestamp,
                                        'type' => $type,
                                    ], $mediaPayload),
                                ],
                            ],
                            'field' => 'messages',
                        ],
                    ],
                ],
            ],
        ];

        $this->line("  Sending {$type} message #{$iteration}...");

        $controller = app(MetaWebhookController::class);
        $json = json_encode($payload);
        $request = Request::create('/api/whatsapp/meta/webhook', 'POST', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
        ], $json);

        try {
            $response = $controller->handleWebhook($request);
            $status = $response->getStatusCode();
            $body = $response->getContent();
            $decoded = json_decode($body, true);

            // Check if media was saved
            $savedMessage = \App\Models\Whatsapp::where('sid', $messageId)->first();

            $this->results[] = [
                'type' => $type,
                'iteration' => $iteration,
                'saved' => $savedMessage !== null,
                'media_saved' => $savedMessage?->media_path !== null,
                'media_path' => $savedMessage?->media_path,
                'error' => null,
            ];

            $mediaStatus = $savedMessage?->media_path ? '<info>YES</info>' : '<comment>NO (placeholder saved)</comment>';
            $this->line("    -> {$type} #{$iteration}: <info>OK</info> | Media saved: {$mediaStatus}");

        } catch (\Throwable $e) {
            $this->results[] = [
                'type' => $type,
                'iteration' => $iteration,
                'saved' => false,
                'media_saved' => false,
                'media_path' => null,
                'error' => $e->getMessage(),
            ];

            $this->error("    -> {$type} #{$iteration}: FAILED - {$e->getMessage()}");
        }
    }
}
