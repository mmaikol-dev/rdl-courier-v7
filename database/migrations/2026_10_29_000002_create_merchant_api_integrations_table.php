<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('merchant_api_integrations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('merchant_user_id')->constrained('users')->cascadeOnDelete();
            $table->string('name');
            $table->string('token_hash', 64)->unique();
            $table->string('token_prefix', 16);
            $table->json('scopes');
            $table->text('webhook_url')->nullable();
            $table->text('webhook_secret')->nullable();
            $table->json('webhook_events')->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();

            $table->index(['merchant_user_id', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('merchant_api_integrations');
    }
};
