<?php

namespace Tests\Feature;

use App\Support\SidebarRegistry;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

/**
 * The sidebar key registry is the single source of truth shared by the
 * sidebar, the page-access guard and the permissions screen. When it drifts
 * from the frontend definitions a key becomes impossible to enable, so these
 * tests pin the important invariants.
 */
class SidebarAccessTest extends TestCase
{
    use DatabaseTransactions;

    public function test_integrations_is_a_registered_key(): void
    {
        $this->assertContains('integrations', SidebarRegistry::allKeys());
        $this->assertSame('Integrations', SidebarRegistry::titleForKey('integrations'));
    }

    public function test_every_registry_item_has_the_expected_shape(): void
    {
        foreach (SidebarRegistry::items() as $item) {
            $this->assertArrayHasKey('key', $item);
            $this->assertArrayHasKey('title', $item);
            $this->assertStringStartsWith('/', $item['href']);
            $this->assertNotSame('', $item['group']);
        }
    }

    public function test_key_hrefs_are_unique(): void
    {
        $keys = SidebarRegistry::allKeys();

        $this->assertSame($keys, array_values(array_unique($keys)));
    }

    public function test_god_role_always_resolves_to_every_key(): void
    {
        $all = SidebarRegistry::allKeys();

        // Even when a curated subset has been saved for G.O.D, the role sees
        // everything, integrations included.
        $resolved = SidebarRegistry::resolveVisibleKeys('G.O.D', ['dashboard', 'stk']);

        foreach ($all as $key) {
            $this->assertContains($key, $resolved, "G.O.D should see {$key}");
        }

        $this->assertContains('integrations', $resolved);
        $this->assertTrue(SidebarRegistry::canManage('G.O.D'));
        $this->assertTrue(SidebarRegistry::canManage('g.o.d'));
    }

    public function test_non_god_role_honours_its_saved_subset(): void
    {
        $resolved = SidebarRegistry::resolveVisibleKeys('warehouse', ['dashboard', 'integrations']);

        $this->assertSame(['dashboard', 'integrations'], $resolved);
    }

    public function test_saved_subset_arrives_as_raw_json_string(): void
    {
        // Query-builder value() returns the column uncast, so the resolver must
        // handle a JSON string and still apply the curated subset.
        $json = json_encode(['dashboard', 'stk']);

        $this->assertSame(['dashboard', 'stk'], SidebarRegistry::resolveVisibleKeys('warehouse', $json));
    }

    public function test_unknown_saved_keys_are_dropped(): void
    {
        $resolved = SidebarRegistry::resolveVisibleKeys('finance', ['dashboard', 'not-a-real-page']);

        $this->assertSame(['dashboard'], $resolved);
    }

    public function test_role_without_a_saved_subset_falls_back_to_defaults(): void
    {
        $this->assertSame(SidebarRegistry::allKeys(), SidebarRegistry::resolveVisibleKeys('user', null));
        $this->assertSame(['stk'], SidebarRegistry::resolveVisibleKeys('agent', null));
    }
}
