<?php

namespace Tests\Feature;

use App\Models\AiChat;
use App\Models\OrderHistory;
use App\Models\SheetOrder;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class AiControllerTest extends TestCase
{
    use DatabaseTransactions;

    private function makeUser(): User
    {
        $user = User::factory()->create();
        $user->forceFill(['roles' => 'G.O.D', 'store_address' => 'Kenya'])->save();

        return $user;
    }

    public function test_index_requires_auth(): void
    {
        $this->get('/ai')->assertRedirect('/login');
    }

    public function test_ask_requires_auth(): void
    {
        $this->post('/ai/ask', ['message' => 'hello'])->assertRedirect('/login');
    }

    public function test_create_orders_requires_auth(): void
    {
        $this->post('/ai/create-orders', ['orders' => [], 'merchant' => 'X'])->assertRedirect('/login');
    }

    public function test_create_orders_rejects_unknown_merchant(): void
    {
        $user = $this->makeUser();

        $response = $this->actingAs($user)->postJson('/ai/create-orders', [
            'groups' => [[
                'sheet_name' => 'TestShop',
                'orders' => [[
                    'order_date' => '2026-08-01',
                    'amount' => 100,
                    'quantity' => 1,
                    'client_name' => 'Jane Doe',
                ]],
            ]],
            'merchant' => 'No Such Merchant',
        ]);

        $response->assertStatus(422)
            ->assertJson(['success' => false])
            ->assertJsonStructure(['merchants']);
    }

    public function test_create_orders_rejects_unknown_sheet(): void
    {
        $user = $this->makeUser();

        SheetOrder::create([
            'merchant' => 'TestShop',
            'sheet_name' => 'TestShop',
            'sheet_id' => 'TEST',
            'order_no' => 'TS001',
            'client_name' => 'Old Client',
            'amount' => 1,
            'quantity' => 1,
            'order_date' => '2026-08-01',
        ]);

        $response = $this->actingAs($user)->postJson('/ai/create-orders', [
            'groups' => [[
                'sheet_name' => 'NOT-A-SHEET',
                'orders' => [[
                    'order_date' => '2026-08-01',
                    'amount' => 100,
                    'quantity' => 1,
                    'client_name' => 'Jane Doe',
                ]],
            ]],
            'merchant' => 'TestShop',
        ]);

        $response->assertStatus(422)
            ->assertJson(['success' => false])
            ->assertJsonStructure(['sheets']);
    }

    public function test_create_orders_creates_bulk_orders_in_groups_with_history(): void
    {
        $user = $this->makeUser();

        SheetOrder::create([
            'merchant' => 'TestShop',
            'sheet_name' => 'TestShop',
            'sheet_id' => 'TEST',
            'order_no' => 'TS001',
            'client_name' => 'Old Client',
            'amount' => 1,
            'quantity' => 1,
            'order_date' => '2026-08-01',
        ]);
        SheetOrder::create([
            'merchant' => 'TestShop',
            'sheet_name' => 'WINTER',
            'sheet_id' => 'TEST',
            'order_no' => 'WTR001',
            'client_name' => 'Old Client',
            'amount' => 1,
            'quantity' => 1,
            'order_date' => '2026-08-01',
        ]);

        $response = $this->actingAs($user)->postJson('/ai/create-orders', [
            'merchant' => 'TestShop',
            'status' => 'Scheduled',
            'groups' => [
                [
                    'sheet_name' => 'TestShop',
                    'sheet_id' => 'TEST',
                    'orders' => [
                        [
                            'order_date' => '2026-08-01',
                            'amount' => 5600,
                            'quantity' => 2,
                            'client_name' => 'John Kamau',
                            'phone' => '0711222333',
                            'city' => 'Nairobi',
                            'product_name' => 'loafers',
                        ],
                        [
                            'order_date' => '2026-08-01',
                            'amount' => 2100,
                            'quantity' => 3,
                            'client_name' => 'Peter Njoroge',
                            'city' => 'Thika',
                            'product_name' => 't-shirts',
                        ],
                    ],
                ],
                [
                    'sheet_name' => 'WINTER',
                    'sheet_id' => 'TEST',
                    'orders' => [
                        [
                            'order_date' => '2026-08-01',
                            'amount' => 900,
                            'quantity' => 1,
                            'client_name' => 'Grace Wambui',
                            'city' => 'Nakuru',
                            'product_name' => 'jacket',
                        ],
                    ],
                ],
            ],
        ]);

        $response->assertOk()
            ->assertJson(['success' => true])
            ->assertJsonCount(3, 'orders');

        // Order numbers follow the per-sheet prefix sequences
        $testShopOrders = SheetOrder::where('merchant', 'TestShop')
            ->where('order_type', 'ai-created')
            ->where('sheet_name', 'TestShop')
            ->orderBy('order_no')
            ->get();
        $this->assertCount(2, $testShopOrders);
        $this->assertSame('TS2', $testShopOrders[0]->order_no);
        $this->assertSame('TS3', $testShopOrders[1]->order_no);

        $winterOrders = SheetOrder::where('merchant', 'TestShop')
            ->where('order_type', 'ai-created')
            ->where('sheet_name', 'WINTER')
            ->get();
        $this->assertCount(1, $winterOrders);
        $this->assertSame('WTR2', $winterOrders[0]->order_no);

        // Country forced from the user account
        $this->assertNotNull($testShopOrders[0]->country);

        foreach (SheetOrder::where('merchant', 'TestShop')->where('order_type', 'ai-created')->get() as $order) {
            $this->assertTrue(
                OrderHistory::where('order_id', $order->id)->where('new_value', 'Created via AI')->exists()
            );
        }
    }

    public function test_suggest_sheets_uses_history_frequency(): void
    {
        $user = $this->makeUser();

        foreach ([
            ['merchant' => 'TestShop', 'sheet_name' => 'GINSENG', 'product_name' => 'GINSENG'],
            ['merchant' => 'TestShop', 'sheet_name' => 'GINSENG', 'product_name' => 'GINSENG'],
            ['merchant' => 'TestShop', 'sheet_name' => 'GINSENG2026', 'product_name' => 'GINSENG'],
            ['merchant' => 'TestShop', 'sheet_name' => 'MARCIN2026', 'product_name' => 'Marcin'],
        ] as $i => $seed) {
            SheetOrder::create([
                'merchant' => $seed['merchant'],
                'sheet_name' => $seed['sheet_name'],
                'sheet_id' => 'TEST',
                'order_no' => "SEED{$i}",
                'client_name' => 'Old Client',
                'amount' => 1,
                'quantity' => 1,
                'product_name' => $seed['product_name'],
                'order_date' => '2026-08-01',
            ]);
        }

        $response = $this->actingAs($user)->postJson('/ai/suggest-sheets', [
            'merchant' => 'TestShop',
            'product_names' => ['GINSENG', 'Marcin', 'UnknownProduct', ''],
        ]);

        $response->assertOk()
            ->assertJson(['success' => true]);

        $suggestions = $response->json('suggestions');
        $this->assertSame('GINSENG', $suggestions['GINSENG']);
        $this->assertSame('MARCIN2026', $suggestions['Marcin']);
        $this->assertSame('GINSENG', $suggestions['UnknownProduct']); // fallback to first known sheet
    }

    public function test_chat_history_is_saved_per_user(): void
    {
        $user = $this->makeUser();

        AiChat::create(['user_id' => $user->id, 'role' => 'user', 'content' => 'hello']);
        AiChat::create(['user_id' => $user->id, 'role' => 'assistant', 'content' => 'hi there']);

        $other = $this->makeUser();
        $this->assertCount(0, AiChat::where('user_id', $other->id)->get());
        $this->assertCount(2, AiChat::where('user_id', $user->id)->get());
    }

    public function test_ask_saves_chat_and_returns_extracted_orders(): void
    {
        Http::fake([
            '*/api/generate' => Http::response([
                'response' => "Found 2 orders:\n```json\n[{\"client_name\":\"Jane Doe\",\"amount\":100,\"quantity\":1},{\"client_name\":\"John Kamau\",\"amount\":200,\"quantity\":2}]\n```",
            ]),
        ]);

        $user = $this->makeUser();
        $response = $this->actingAs($user)->postJson('/ai/ask', ['message' => 'Create orders for Jane and John']);

        $response->assertOk()
            ->assertJson(['success' => true])
            ->assertJsonCount(2, 'orders');

        // User message + assistant reply persisted per user
        $this->assertCount(2, AiChat::where('user_id', $user->id)->get());
        $this->assertSame('user', AiChat::where('user_id', $user->id)->first()->role);
    }

    public function test_index_passes_merchants_and_history(): void
    {
        $user = $this->makeUser();
        $this->actingAs($user)->get('/ai')->assertInertia(fn (Assert $page) => $page
            ->component('ai/index')
            ->has('merchants')
            ->has('statusOptions')
            ->has('history')
            ->has('conversations')
            ->has('currentConversationId'));
    }

    public function test_ask_creates_conversation_and_scopes_messages(): void
    {
        Http::fake([
            '*/api/generate' => Http::response(['response' => "Found 1 order:\n[{\"client_name\":\"Jane\",\"amount\":100,\"quantity\":1}]"]),
        ]);

        $user = $this->makeUser();
        $this->actingAs($user)->postJson('/ai/ask', ['message' => 'First chat message'])
            ->assertOk()
            ->assertJsonStructure(['conversation_id']);

        $conversation = \App\Models\AiConversation::where('user_id', $user->id)->first();
        $this->assertNotNull($conversation);
        $this->assertSame('First chat message', $conversation->title);
        $this->assertSame(2, $conversation->chats()->count());

        // A second message continues the same conversation
        $this->actingAs($user)->postJson('/ai/ask', [
            'message' => 'Another message',
            'conversation_id' => $conversation->id,
        ])->assertOk()->assertJson(['conversation_id' => $conversation->id]);

        $this->assertSame(4, $conversation->chats()->count());
        $this->assertSame(1, \App\Models\AiConversation::where('user_id', $user->id)->count());
    }

    public function test_cannot_access_another_users_conversation(): void
    {
        $owner = $this->makeUser();
        $conversation = \App\Models\AiConversation::create(['user_id' => $owner->id]);

        $intruder = $this->makeUser();
        $this->actingAs($intruder)->get("/ai/conversations/{$conversation->id}")->assertForbidden();
        $this->actingAs($intruder)->delete("/ai/conversations/{$conversation->id}")->assertForbidden();
    }

    public function test_conversation_crud(): void
    {
        $user = $this->makeUser();

        // Create
        $this->actingAs($user)->postJson('/ai/conversations')
            ->assertOk()
            ->assertJsonStructure(['conversation' => ['id']]);

        $conversation = \App\Models\AiConversation::where('user_id', $user->id)->first();

        // Show (empty)
        $this->actingAs($user)->getJson("/ai/conversations/{$conversation->id}")
            ->assertOk()
            ->assertJson(['success' => true, 'messages' => []]);

        // Delete
        $this->actingAs($user)->deleteJson("/ai/conversations/{$conversation->id}")->assertOk();
        $this->assertCount(0, \App\Models\AiConversation::where('user_id', $user->id)->get());
    }
}
