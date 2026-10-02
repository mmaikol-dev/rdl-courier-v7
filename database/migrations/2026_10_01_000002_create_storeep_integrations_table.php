<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One row per Storeep store bound to one of our merchants in one country.
 *
 * Credentials live here rather than in `.env` because there will be many
 * stores, one per merchant (and per country, for merchants that trade in more
 * than one market). This follows the existing `sheets.shopify_name` /
 * `sheets.access_token` precedent rather than inventing a new table.
 *
 * `country` is stored by name to match how the rest of the app scopes
 * visibility (`sheet_orders.country`, `CountryAccess::scopeByCountryName`).
 * A merchant opening a new market is a new row here, not a code change.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('storeep_integrations', function (Blueprint $table): void {
            $table->id();

            // The merchant this store's orders belong to. `sheets.sheet_name` is the
            // merchant name (see AiController:494-500), and order visibility compares
            // `sheet_orders.merchant` against `users.name` byte-for-byte, so the two
            // must agree exactly on casing.
            $table->foreignId('sheets_id')->constrained('sheets')->cascadeOnDelete();

            $table->string('store_name')->unique();

            // Encrypted at rest via the model's 'encrypted' cast.
            $table->text('access_token');

            // Resolved from Storeep's ISO market code via countries.iso_code, but
            // persisted so an operator can correct or override it per integration.
            $table->string('country');

            // Locked at creation. Order numbers are `<prefix><number>` with no
            // separator, so the prefix must stay stable once orders exist.
            $table->string('order_no_prefix', 8)->unique();

            $table->boolean('is_enabled')->default(true);

            // Reconciliation cursor: the newest Storeep `updated_at` we have seen.
            // Walk `sort_field=updated_at&sort_order=DESC` from here so a missed
            // page is picked up on the next run instead of being lost.
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamp('last_synced_at_remote')->nullable();

            $table->unsignedInteger('orders_synced')->default(0);

            $table->text('last_error')->nullable();
            $table->timestamp('last_error_at')->nullable();

            $table->timestamps();

            $table->index(['is_enabled', 'last_synced_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('storeep_integrations');
    }
};
