<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MerchantApiAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_merchants_can_create_and_revoke_api_keys_with_json_responses(): void
    {
        $merchant = User::factory()->create([
            'roles' => 'merchant',
            'merchant_api_enabled' => true,
            'merchant_api_scopes' => ['orders:read'],
        ]);

        $created = $this->actingAs($merchant)->postJson('/merchant-api-access', [
            'name' => 'Production server',
            'scopes' => ['orders:read'],
            'webhook_url' => null,
            'webhook_events' => [],
        ])->assertOk()
            ->assertJsonPath('key.name', 'Production server')
            ->assertJsonPath('key.scopes', ['orders:read'])
            ->assertJsonPath('key.lastUsedAt', null);

        $secret = $created->json('secret');
        $this->assertIsString($secret);
        $this->assertStringStartsWith('rdl_live_', $secret);

        $integrationId = $created->json('key.id');
        $this->assertDatabaseHas('merchant_api_integrations', [
            'id' => $integrationId,
            'merchant_user_id' => $merchant->id,
            'token_hash' => hash('sha256', $secret),
            'token_prefix' => substr($secret, 0, 16),
        ]);

        $this->deleteJson("/merchant-api-access/{$integrationId}")
            ->assertOk()
            ->assertJsonPath('message', 'Merchant API access revoked.');

        $this->assertDatabaseHas('merchant_api_integrations', [
            'id' => $integrationId,
            'is_active' => false,
        ]);
    }
}
