<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('voice_agents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('client_name')->unique();
            $table->string('display_name')->nullable();
            $table->string('status')->default('offline');
            $table->boolean('is_available')->default(true);
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamp('last_assigned_at')->nullable();
            $table->string('current_call_session_id')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['status', 'is_available']);
            $table->index('last_seen_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('voice_agents');
    }
};
