<?php

namespace App\Http\Controllers;

use App\Models\Whatsapp;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class MetaWebhookController extends Controller
{
    /**
     * Handle the verification challenge from Meta.
     *
     * GET /api/whatsapp/meta/webhook?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=CHALLENGE
     */
    public function verify(Request $request): mixed
    {
        // PHP converts dots to underscores in query params (hub.mode → hub_mode)
        $mode = $request->query('hub_mode') ?? $request->query('hub.mode');
        $token = $request->query('hub_verify_token') ?? $request->query('hub.verify_token');
        $challenge = $request->query('hub_challenge') ?? $request->query('hub.challenge');

        Log::info('📩 Meta webhook verification request', [
            'mode' => $mode,
            'token' => $token ? '***'.substr($token, -4) : null,
            'challenge' => $challenge,
        ]);

        if ($mode === 'subscribe' && $token === config('services.whatsapp_cloud.verify_token')) {
            Log::info('✅ Meta webhook verified successfully');

            return response($challenge, 200)->header('Content-Type', 'text/plain');
        }

        Log::warning('❌ Meta webhook verification failed', ['mode' => $mode, 'token' => $token]);

        return response('Forbidden', 403);
    }

    /**
     * Handle incoming messages and status updates from Meta Cloud API.
     *
     * POST /api/whatsapp/meta/webhook
     */
    public function handleWebhook(Request $request): JsonResponse
    {
        $payload = $request->all();

        if (empty($payload)) {
            Log::warning('⚠️ Meta webhook: empty payload');

            return response()->json(['status' => 'no_data'], 200);
        }

        Log::info('📩 Meta webhook received', [
            'object' => $payload['object'] ?? 'unknown',
            'entry_count' => count($payload['entry'] ?? []),
        ]);

        $entries = $payload['entry'] ?? [];

        foreach ($entries as $entry) {
            $changes = $entry['changes'] ?? [];

            foreach ($changes as $change) {
                $value = $change['value'] ?? [];
                $field = $change['field'] ?? '';

                if ($field !== 'messages') {
                    Log::info("ℹ️ Ignoring non-messages field: {$field}");

                    continue;
                }

                // Handle incoming messages
                $messages = $value['messages'] ?? [];
                foreach ($messages as $message) {
                    $this->processIncomingMessage($message, $value);
                }

                // Handle status updates
                $statuses = $value['statuses'] ?? [];
                foreach ($statuses as $status) {
                    $this->processStatusUpdate($status);
                }
            }
        }

        return response()->json(['status' => 'success'], 200);
    }

    /**
     * Process a single incoming message from Meta.
     */
    private function processIncomingMessage(array $message, array $value): void
    {
        try {
            $messageId = $message['id'] ?? null;
            $from = $message['from'] ?? null;
            $type = $message['type'] ?? 'unknown';
            $timestamp = $message['timestamp'] ?? null;

            // Get sender profile from contacts
            $contacts = $value['contacts'] ?? [];
            $clientName = $contacts[0]['profile']['name'] ?? 'UNKNOWN';
            $waId = $contacts[0]['wa_id'] ?? $from;

            // Extract message body based on type
            $messageBody = match ($type) {
                'text' => $message['text']['body'] ?? '',
                'image' => '[Image received]'.($message['image']['caption'] ?? '' ? ': '.$message['image']['caption'] : ''),
                'video' => '[Video received]'.($message['video']['caption'] ?? '' ? ': '.$message['video']['caption'] : ''),
                'audio' => '[Audio received]',
                'document' => '[Document received: '.($message['document']['filename'] ?? 'document').']',
                'sticker' => '[Sticker received]',
                'interactive' => $this->extractInteractiveBody($message),
                'button' => $message['button']['text'] ?? '[Button pressed]',
                default => "[Unknown message type: {$type}]",
            };

            if (! $from || ! $messageId) {
                Log::error('❌ Meta webhook: missing required fields', compact('from', 'messageId'));

                return;
            }

            $whatsapp = Whatsapp::create([
                'to' => $from,
                'client_name' => $clientName,
                'store_name' => 'META_WEBHOOK',
                'cc_agents' => null,
                'message' => $messageBody,
                'status' => 'received',
                'sid' => $messageId,
                'type' => '1',
            ]);

            Log::info('✅ Meta incoming message saved', [
                'id' => $whatsapp->id,
                'from' => $from,
                'client_name' => $clientName,
                'type' => $type,
                'message' => mb_substr($messageBody, 0, 100),
            ]);

        } catch (\Throwable $e) {
            Log::error('❌ Meta webhook: failed to process incoming message', [
                'error' => $e->getMessage(),
                'message' => $message,
            ]);
        }
    }

    /**
     * Extract body text from interactive messages (list replies, button replies).
     */
    private function extractInteractiveBody(array $message): string
    {
        $interactive = $message['interactive'] ?? [];
        $type = $interactive['type'] ?? '';

        return match ($type) {
            'button_reply' => $interactive['button_reply']['title'] ?? '[Button reply]',
            'list_reply' => $interactive['list_reply']['title'] ?? '[List reply]',
            default => '[Interactive message]',
        };
    }

    /**
     * Process a status update from Meta.
     *
     * Status values: sent, delivered, read, played, failed, deleted
     */
    private function processStatusUpdate(array $status): void
    {
        try {
            $messageId = $status['id'] ?? null;
            $statusText = $status['status'] ?? null;
            $timestamp = $status['timestamp'] ?? null;
            $recipientId = $status['recipient_id'] ?? null;
            $errors = $status['errors'] ?? [];

            if (! $messageId || ! $statusText) {
                Log::warning('⚠️ Meta webhook: missing fields in status update', compact('messageId', 'statusText'));

                return;
            }

            $mappedStatus = $this->mapMetaStatus($statusText, $errors);

            $updated = Whatsapp::where('sid', $messageId)->update(['status' => $mappedStatus]);

            if ($updated) {
                Log::info("✅ Meta status updated", [
                    'message_id' => $messageId,
                    'status' => $mappedStatus,
                    'original_status' => $statusText,
                ]);
            } else {
                Log::warning("⚠️ Meta webhook: message {$messageId} not found for status update", [
                    'status' => $statusText,
                ]);
            }

        } catch (\Throwable $e) {
            Log::error('❌ Meta webhook: failed to process status update', [
                'error' => $e->getMessage(),
                'status' => $status,
            ]);
        }
    }

    /**
     * Map Meta status strings to our database status values.
     *
     * Meta statuses: sent, delivered, read, played, failed, deleted
     * Our statuses:  sent, delivered, read, played, failed, pending, error
     */
    private function mapMetaStatus(string $metaStatus, array $errors = []): string
    {
        $mapped = match ($metaStatus) {
            'sent' => 'sent',
            'delivered' => 'delivered',
            'read' => 'read',
            'played' => 'played',
            'failed' => 'failed',
            'deleted' => 'deleted',
            default => 'pending',
        };

        // If failed, append error code if available
        if ($mapped === 'failed' && ! empty($errors[0]['code'])) {
            Log::warning('❌ Meta message failed', [
                'error_code' => $errors[0]['code'],
                'error_message' => $errors[0]['message'] ?? '',
            ]);
        }

        return $mapped;
    }
}
