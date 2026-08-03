<?php

namespace App\Http\Controllers;

use App\Models\AiChat;
use App\Models\AiConversation;
use App\Models\OrderHistory;
use App\Models\SheetOrder;
use App\Services\ProductAutoMatchService;
use App\Support\CountryAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;

class AiController extends Controller
{
    private string $ollamaUrl;
    private string $model;

    private const STATUS_OPTIONS = [
        'Scheduled',
        'Dispatched',
        'Followup',
        'Duplicate',
        'Cancelled',
        'Pending',
        'OutofStock',
        'Expired',
        'Returned',
        'WrongContact',
        'Delivered',
        'New Orders',
    ];

    public function __construct(
        private readonly ProductAutoMatchService $autoMatch = new ProductAutoMatchService,
    ) {
        $this->ollamaUrl = env('AI_OLLAMA_URL', 'http://127.0.0.1:11434/api/generate');
        $this->model     = env('AI_OLLAMA_MODEL', 'qwen3.5:2b');
    }

    /**
     * Render the AI chat page with per-user conversations and merchant data.
     */
    public function index(Request $request)
    {
        $user = $request->user()->loadMissing('country');

        $conversations = AiConversation::where('user_id', $user->id)
            ->withCount('chats')
            ->latest('updated_at')
            ->get(['id', 'title', 'updated_at']);

        $currentConversation = $conversations->first();
        $history = $currentConversation
            ? AiChat::where('conversation_id', $currentConversation->id)
                ->latest()
                ->limit(50)
                ->get()
                ->reverse()
                ->values()
            : collect();

        $merchants = $this->merchantData($user);

        return Inertia::render('ai/index', [
            'history' => $history,
            'conversations' => $conversations,
            'currentConversationId' => $currentConversation?->id ?? null,
            'merchants' => $merchants,
            'statusOptions' => self::STATUS_OPTIONS,
        ]);
    }

    /**
     * Create a new empty conversation.
     */
    public function createConversation(Request $request)
    {
        $conversation = AiConversation::create([
            'user_id' => $request->user()->id,
            'title' => null,
        ]);

        return response()->json([
            'success' => true,
            'conversation' => $conversation,
        ]);
    }

    /**
     * Load messages for a conversation owned by the user.
     */
    public function showConversation(Request $request, AiConversation $conversation)
    {
        abort_unless($conversation->user_id === $request->user()->id, 403);

        $messages = $conversation->chats()
            ->latest()
            ->limit(100)
            ->get()
            ->reverse()
            ->values();

        return response()->json([
            'success' => true,
            'messages' => $messages,
        ]);
    }

    /**
     * Delete a conversation and all its messages.
     */
    public function deleteConversation(Request $request, AiConversation $conversation)
    {
        abort_unless($conversation->user_id === $request->user()->id, 403);

        $conversation->delete();

        return response()->json(['success' => true]);
    }

    /**
     * Handle a chat message from the user.
     */
    public function ask(Request $request)
    {
        $user = $request->user();

        $request->validate([
            'message' => 'required|string|max:20000',
            'conversation_id' => 'nullable|integer',
        ]);

        $message = trim($request->input('message'));

        // Resolve conversation: use the given one (owned by user) or create a new one
        $conversationId = $request->integer('conversation_id');
        if ($conversationId) {
            $conversation = AiConversation::where('user_id', $user->id)->findOrFail($conversationId);
        } else {
            $conversation = AiConversation::create([
                'user_id' => $user->id,
                'title' => mb_substr($message, 0, 60),
            ]);
            $conversationId = $conversation->id;
        }

        if (blank($conversation->title)) {
            $conversation->forceFill(['title' => mb_substr($message, 0, 60)])->save();
        }

        AiChat::create([
            'user_id' => $user->id,
            'conversation_id' => $conversationId,
            'role' => 'user',
            'content' => $message,
        ]);

        // Recent conversation context (last 10 turns) for recall
        $recent = AiChat::where('conversation_id', $conversationId)
            ->latest()
            ->limit(20)
            ->get()
            ->reverse();

        $context = '';
        foreach ($recent as $chat) {
            if ($chat->id && $chat->role === 'assistant' && $chat->content === $message) {
                continue;
            }
            $context .= ($chat->role === 'user' ? 'User: ' : 'Assistant: ') . $chat->content . "\n\n";
        }

        $fullPrompt = $this->buildSystemPrompt() . "\n\n" . $context . "User: " . $message . "\n\nAssistant:";

        try {
            Log::info('AI ASK: User message', ['user' => $user->name, 'message' => $message]);

            $response = Http::timeout(120)->post($this->ollamaUrl, [
                'model'   => $this->model,
                'prompt'  => $fullPrompt,
                'stream'  => false,
                'options' => [
                    'num_predict' => 6000,
                    'temperature' => 0.3,
                    'top_p'       => 0.9,
                    'stop'        => ['User:', '\nUser:'],
                ],
            ]);

            if (! $response->successful()) {
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

            $reply = preg_replace('/<think>.*?<\/think>/s', '', $reply);
            $reply = trim($reply);

            $orders = $this->extractOrdersJson($reply);

            // Drop false positives (greetings, small talk) that carry no order data
            if (is_array($orders)) {
                $orders = array_values(array_filter($orders, function ($order) {
                    $hasAmount   = ! blank($order['amount'] ?? null);
                    $hasQty      = ! blank($order['quantity'] ?? null);
                    $hasPhone    = ! blank($order['phone'] ?? null);
                    $hasCity     = ! blank($order['city'] ?? null);
                    $hasAddress  = ! blank($order['address'] ?? null);
                    $hasProduct  = ! blank($order['product_name'] ?? null);

                    return $hasAmount || $hasQty || $hasPhone || $hasCity || $hasAddress || $hasProduct;
                }));
            }

            AiChat::create([
                'user_id' => $user->id,
                'conversation_id' => $conversationId,
                'role' => 'assistant',
                'content' => $reply,
                'order_data' => $orders,
            ]);

            $conversation->touch();

            Log::info('AI ASK: Response received', [
                'user'        => $user->name,
                'conversation' => $conversationId,
                'has_orders'  => ! is_null($orders),
                'order_count' => is_array($orders) ? count($orders) : 0,
            ]);

            return response()->json([
                'success' => true,
                'reply'   => $reply,
                'orders'  => $orders,
                'conversation_id' => $conversationId,
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
     * Suggest the best sheet for each product of a merchant, from order history.
     */
    public function suggestSheets(Request $request)
    {
        $user = $request->user()->loadMissing('country');

        $validated = $request->validate([
            'merchant' => 'required|string|max:255',
            'product_names' => 'required|array|max:200',
            'product_names.*' => 'nullable|string|max:255',
        ]);

        $merchantData = $this->merchantData($user);
        $merchants = collect($merchantData)->keys()->all();

        if (! in_array($validated['merchant'], $merchants, true)) {
            return response()->json([
                'success' => false,
                'message' => "Merchant \"{$validated['merchant']}\" was not found.",
                'merchants' => $merchantData,
            ], 422);
        }

        // Sheet frequency per product, from existing orders (country-scoped)
        $rows = CountryAccess::scopeByCountryName(
            SheetOrder::query()->where('merchant', $validated['merchant'])
                ->whereNotNull('product_name')
                ->where('product_name', '!=', '')
                ->whereNotNull('sheet_name')
                ->where('sheet_name', '!=', '')
                ->selectRaw('product_name, sheet_name, COUNT(*) as cnt')
                ->groupBy('product_name', 'sheet_name')
                ->orderByDesc('cnt'),
            $user
        )->get();

        $suggestions = [];

        foreach ($validated['product_names'] as $product) {
            $name = trim((string) $product);
            $key = strtolower($name);
            $suggestion = null;

            if ($key !== '') {
                // 1. Exact normalized match
                $exact = $rows->first(fn ($r) => strtolower(trim($r->product_name)) === $key);
                $suggestion = $exact?->sheet_name;

                // 2. Fuzzy contains match
                if (! $suggestion) {
                    $fuzzy = $rows->first(fn ($r) => str_contains(strtolower($r->product_name), $key));
                    $suggestion = $fuzzy?->sheet_name;
                }
            }

            if (! $suggestion) {
                $suggestion = $merchantData[$validated['merchant']]['sheet_names'][0] ?? null;
            }

            $suggestions[$name] = $suggestion;
        }

        return response()->json([
            'success' => true,
            'suggestions' => $suggestions,
        ]);
    }

    /**
     * Create one or more orders from AI-extracted data, grouped per sheet.
     * Merchant / sheet / country always come from the user, never the LLM.
     */
    public function createOrders(Request $request)
    {
        $user = $request->user()->loadMissing('country');

        $validated = $request->validate([
            'groups' => 'required|array|min:1|max:50',
            'groups.*.sheet_name' => 'required|string|max:255',
            'groups.*.sheet_id' => 'nullable|string|max:255',
            'groups.*.orders' => 'required|array|min:1|max:100',
            'groups.*.orders.*.order_date' => 'required|date',
            'groups.*.orders.*.amount' => 'required|numeric',
            'groups.*.orders.*.quantity' => 'required|integer',
            'groups.*.orders.*.client_name' => 'required|string|max:255',
            'groups.*.orders.*.delivery_date' => 'nullable|date',
            'groups.*.orders.*.item' => 'nullable|string|max:255',
            'groups.*.orders.*.client_city' => 'nullable|string|max:255',
            'groups.*.orders.*.address' => 'nullable|string|max:255',
            'groups.*.orders.*.product_name' => 'nullable|string|max:255',
            'groups.*.orders.*.city' => 'nullable|string|max:255',
            'groups.*.orders.*.phone' => 'nullable|string|max:50',
            'groups.*.orders.*.agent' => 'nullable|string|max:255',
            'groups.*.orders.*.store_name' => 'nullable|string|max:255',
            'groups.*.orders.*.code' => 'nullable|string|max:255',
            'groups.*.orders.*.alt_no' => 'nullable|string|max:255',
            'groups.*.orders.*.cc_email' => 'nullable|string|max:255',
            'groups.*.orders.*.instructions' => 'nullable|string',
            'groups.*.orders.*.invoice_code' => 'nullable|string|max:255',
            'merchant' => 'required|string|max:255',
            'status' => 'nullable|string|max:50',
        ]);

        // Merchant must exist within the user's country scope
        $merchantData = $this->merchantData($user);
        $merchants = collect($merchantData)->keys()->all();

        if (! in_array($validated['merchant'], $merchants, true)) {
            return response()->json([
                'success' => false,
                'message' => "Merchant \"{$validated['merchant']}\" was not found. Please select a merchant from the list.",
                'merchants' => $merchantData,
            ], 422);
        }

        // Each group's sheet must be one of the merchant's known sheets
        $knownSheetNames = collect($merchantData[$validated['merchant']]['sheet_names'])
            ->map(fn ($s) => strtolower(trim((string) $s)))
            ->all();

        foreach ($validated['groups'] as $group) {
            $normalized = strtolower(trim((string) $group['sheet_name']));
            if (! in_array($normalized, $knownSheetNames, true)) {
                return response()->json([
                    'success' => false,
                    'message' => "Sheet \"{$group['sheet_name']}\" is not a known sheet for {$validated['merchant']}.",
                    'sheets' => $merchantData[$validated['merchant']]['sheet_names'],
                ], 422);
            }
        }

        $country = CountryAccess::resolveCountryNameForWrite($user, null);
        $status = $validated['status'] ?? 'Scheduled';

        $created = [];

        foreach ($validated['groups'] as $group) {
            $sheetName = $group['sheet_name'];
            $sheetId = $group['sheet_id'] ?? '';

            foreach ($group['orders'] as $orderData) {
                $orderData['country'] = $country;
                $orderData['merchant'] = $validated['merchant'];
                $orderData['sheet_name'] = $sheetName;
                $orderData['sheet_id'] = $sheetId;
                $orderData['status'] = $orderData['status'] ?? $status;
                $orderData['order_no'] = $this->getNextOrderNumber($sheetName, $sheetId);
                $orderData['order_type'] = 'ai-created';
                $orderData['updated_at'] = now();

                $order = SheetOrder::create($orderData);

                $this->autoMatch->applyMatches($order, $this->autoMatch->match($order));

                OrderHistory::create([
                    'order_id' => $order->id,
                    'user_id' => $user->id,
                    'attribute' => 'status',
                    'old_value' => null,
                    'new_value' => 'Created via AI',
                ]);

                $created[] = [
                    'id' => $order->id,
                    'order_no' => $order->order_no,
                    'client_name' => $order->client_name,
                    'sheet_name' => $sheetName,
                ];
            }
        }

        Log::info('AI ORDERS: Created', [
            'user' => $user->name,
            'count' => count($created),
            'order_nos' => array_column($created, 'order_no'),
        ]);

        return response()->json([
            'success' => true,
            'message' => count($created) . ' order(s) created successfully.',
            'orders' => $created,
        ]);
    }

    /**
     * Country-scoped merchant data: merchant => sheet_id, sheet_names, countries, store_name.
     */
    private function merchantData(\App\Models\User $user): array
    {
        return CountryAccess::scopeByCountryName(
            SheetOrder::select('merchant', 'sheet_id', 'sheet_name', 'country', 'store_name'),
            $user
        )
            ->whereNotNull('merchant')
            ->where('merchant', '!=', '')
            ->groupBy('merchant', 'sheet_id', 'sheet_name', 'country', 'store_name')
            ->get()
            ->groupBy('merchant')
            ->map(function ($items) {
                return [
                    'sheet_id' => $items->first()->sheet_id,
                    'sheet_names' => $items->pluck('sheet_name')->filter()->unique()->sort()->values(),
                    'countries' => $items->pluck('country')->filter()->unique()->values(),
                    'store_name' => $items->pluck('store_name')->filter()->first(),
                ];
            })
            ->toArray();
    }

    private function buildSystemPrompt(): string
    {
        $today = now()->format('Y-m-d');

        return <<<PROMPT
You are Elly, an AI assistant for RealDeal Courier, a logistics and courier management platform operating in Kenya, Tanzania, Uganda, and Zambia.

Today's date is {$today}. Use this for "order_date" when the user does not provide a date.

Your primary role is to help office staff create courier orders from pasted order information. Users will often paste multiple orders at once (from WhatsApp, email, spreadsheets, or notes).

When the user pastes or describes orders, extract EVERY order they mention and return them as a single JSON array, e.g.:
[
  {
    "order_date": "2026-08-01",
    "amount": 2800,
    "quantity": 1,
    "client_name": "Jane Doe",
    "phone": "+254712345678",
    "alt_no": "",
    "city": "Nairobi",
    "address": "",
    "product_name": "Shoes",
    "status": "Scheduled"
  }
]

CRITICAL RULES:
- Extract ALL orders mentioned. If the user gives 20 orders, return 20 objects in the array.
- Do NOT include "merchant", "sheet_name", "sheet_id", "country", or "order_no" in the JSON. The user selects the merchant in the app, the country comes from the user's account, and order numbers are auto-generated.
- "client_name" is the CUSTOMER receiving the order. "amount" is the total order amount (number). "quantity" is a number (default 1).
- If a field is missing, set it to null. If order_date is missing, use today's date.
- "status" defaults to "Scheduled".
- If nothing in the message looks like an order, do not return JSON - just reply helpfully.
- Keep your reply concise: first a one-line summary of how many orders you found, then the JSON array.
- Always respond in clear, professional English.

WHATSAPP EXPORT FORMAT:
Users often paste WhatsApp chat exports with headers like:
[08:44, 7/31/2026] businessdevelopment timebound: David
0968388196
Ndola
1 pack
450 kwacha

For these headers:
- Ignore the "[time/date]" timestamp and the sender name before the colon (e.g. "businessdevelopment timebound").
- The text AFTER the colon is the order. The first line is the client_name.
- "450 kwacha" or "450" is the amount (450). "1 pack" is quantity 1; "2 packs" is quantity 2.
- A phone number (9 digits, with or without +260/0 prefix) is "phone". The next line is usually "city" or "address".
- Each header marks a separate order. Extract them all.
- If the message after the colon is not an order (e.g. "Good morning", "Thank you", "Please call me"), skip it and do NOT create an order object for it.
- NEVER create an order with an empty client_name or with no amount, quantity, phone, city, or address at all.
PROMPT;
    }

    /**
     * Extract a JSON array (or single object) of orders from the AI response.
     */
    private function extractOrdersJson(string $reply): ?array
    {
        // Array form: [{...}, {...}]
        if (preg_match('/\[\s*\{[\s\S]*\}\s*\]/m', $reply, $matches)) {
            $decoded = json_decode($matches[0], true);
            if (is_array($decoded) && json_last_error() === JSON_ERROR_NONE) {
                return array_values($decoded);
            }
        }

        // Single object form: {...} containing client_name
        if (preg_match('/\{[\s\S]*"client_name"[\s\S]*\}/m', $reply, $matches)) {
            $decoded = json_decode($matches[0], true);
            if (is_array($decoded) && json_last_error() === JSON_ERROR_NONE) {
                return [$decoded];
            }
        }

        return null;
    }

    /**
     * Generate next order number for a given sheet name, same logic as SheetOrderController.
     */
    private function getNextOrderNumber(string $sheetName, ?string $sheetId = null): string
    {
        $query = SheetOrder::where('sheet_name', $sheetName);

        if ($sheetId) {
            $query->where('sheet_id', $sheetId);
        }

        $lastNumber = $query
            ->whereRaw('order_no REGEXP "^[A-Z]+[0-9]+$"')
            ->selectRaw('MAX(CAST(SUBSTRING(order_no, LENGTH(REGEXP_SUBSTR(order_no, "^[A-Z]+")) + 1) AS UNSIGNED)) as max_number,
                         REGEXP_SUBSTR(order_no, "^[A-Z]+") as prefix')
            ->groupBy('prefix')
            ->orderByDesc('max_number')
            ->first();

        $nextNumber = 1;
        $prefix = 'ORD';

        if ($lastNumber) {
            $prefix = $lastNumber->prefix;
            $nextNumber = $lastNumber->max_number + 1;
        }

        return $prefix . $nextNumber;
    }
}
