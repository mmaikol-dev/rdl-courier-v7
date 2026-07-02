<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;
use Inertia\Inertia;
use Illuminate\Http\Request;

class AiController extends Controller
{
    private string $ollamaUrl;
    private string $model;
    private string $systemPrompt;

    public function __construct()
    {
        $this->ollamaUrl = env('AI_OLLAMA_URL', 'http://127.0.0.1:11434/api/generate');
        $this->model     = env('AI_OLLAMA_MODEL', 'qwen3.5:2b');

        $this->systemPrompt = <<<PROMPT
You are an AI assistant for RealDeal Courier, a logistics and courier management platform operating in Kenya, Tanzania, Uganda, and Zambia.

Your primary role is to help office staff with tasks such as:
- Creating and managing courier orders
- Looking up order status
- Summarizing delivery information
- Answering questions about shipments

When creating an order, always extract and return the following fields in JSON format:
{
  "sender_name": "",
  "sender_phone": "",
  "sender_location": "",
  "recipient_name": "",
  "recipient_phone": "",
  "recipient_location": "",
  "package_description": "",
  "weight_kg": null,
  "delivery_date": "",
  "notes": ""
}

If any field is missing, set it to null and mention it to the user.
Always respond in clear, professional English.
Keep responses concise and actionable.
PROMPT;
    }

    /**
     * Render the AI chat page.
     */
    public function index()
    {
        return Inertia::render('ai/index');
    }

    /**
     * Handle a chat message from the user.
     */
    public function ask(Request $request)
    {
        $request->validate([
            'message' => 'required|string|max:2000',
        ]);

        $message = trim($request->input('message'));

        // Build the full prompt with system context
        $fullPrompt = $this->systemPrompt . "\n\nUser: " . $message . "\n\nAssistant:";

        try {
            Log::info('AI ASK: User message', ['message' => $message]);

            $response = Http::timeout(120)->post($this->ollamaUrl, [
                'model'  => $this->model,
                'prompt' => $fullPrompt,
                'stream' => false,
                'options' => [
                    'num_predict' => 500,    // Enough for a JSON order + explanation
                    'temperature' => 0.3,    // Low = deterministic, great for structured data
                    'top_p'       => 0.9,
                    'stop'        => ['User:', '\nUser:'], // Prevent hallucinated multi-turn
                ],
            ]);

            if (!$response->successful()) {
                Log::error('AI ASK: Ollama API error', [
                    'status' => $response->status(),
                    'body'   => $response->body(),
                ]);
                return response()->json([
                    'success' => false,
                    'reply'   => 'AI service error. Please try again.',
                ], 500);
            }

            $reply = trim($response->json('response') ?? '');

            if (empty($reply)) {
                return response()->json([
                    'success' => false,
                    'reply'   => 'No response from AI. Please try again.',
                ], 500);
            }

            // Strip DeepSeek-R1 <think>...</think> reasoning blocks (not for users)
            $reply = preg_replace('/<think>.*?<\/think>/s', '', $reply);
            $reply = trim($reply);

            // Detect if response contains a JSON order object
            $orderData = $this->extractOrderJson($reply);

            Log::info('AI ASK: Response received', [
                'reply'      => $reply,
                'has_order'  => !is_null($orderData),
            ]);

            return response()->json([
                'success'    => true,
                'reply'      => $reply,
                'order_data' => $orderData, // null if no order detected
            ]);

        } catch (\Illuminate\Http\Client\ConnectionException $e) {
            Log::error('AI ASK: Ollama connection failed', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'reply'   => 'Could not connect to AI service. Please ensure Ollama is running.',
            ], 503);

        } catch (\Exception $e) {
            Log::error('AI ASK: Fatal error', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'reply'   => 'Service temporarily unavailable. Please try again.',
            ], 500);
        }
    }

    /**
     * Check Ollama service health.
     */
    public function health()
    {
        try {
            $baseUrl = str_replace('/api/generate', '', $this->ollamaUrl);
            $response = Http::timeout(5)->get($baseUrl);

            return response()->json([
                'status'  => 'online',
                'model'   => $this->model,
                'message' => 'Ollama is running.',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'status'  => 'offline',
                'model'   => $this->model,
                'message' => 'Ollama is not reachable.',
            ], 503);
        }
    }

    /**
     * List all locally available Ollama models.
     */
    public function models()
    {
        try {
            $baseUrl  = str_replace('/api/generate', '', $this->ollamaUrl);
            $response = Http::timeout(10)->get($baseUrl . '/api/tags');

            if (!$response->successful()) {
                return response()->json(['models' => []]);
            }

            $models = collect($response->json('models') ?? [])
                ->map(fn($m) => [
                    'name' => $m['name'],
                    'size' => $this->formatBytes($m['size'] ?? 0),
                ])
                ->values();

            return response()->json(['models' => $models]);

        } catch (\Exception $e) {
            Log::error('AI MODELS: Failed to fetch models', ['error' => $e->getMessage()]);
            return response()->json(['models' => []]);
        }
    }

    /**
     * Extract JSON order data from AI response if present.
     */
    private function extractOrderJson(string $reply): ?array
    {
        // Look for a JSON block in the response
        if (preg_match('/\{[\s\S]*"sender_name"[\s\S]*\}/m', $reply, $matches)) {
            $decoded = json_decode($matches[0], true);
            if (json_last_error() === JSON_ERROR_NONE) {
                return $decoded;
            }
        }
        return null;
    }

    /**
     * Format bytes to human-readable size.
     */
    private function formatBytes(int $bytes): string
    {
        if ($bytes >= 1073741824) return round($bytes / 1073741824, 1) . ' GB';
        if ($bytes >= 1048576)    return round($bytes / 1048576, 1) . ' MB';
        return $bytes . ' B';
    }
}
