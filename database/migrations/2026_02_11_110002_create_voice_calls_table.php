<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('voice_calls', function (Blueprint $table) {
            $table->id();
            $table->string('at_session_id')->nullable()->index();
            $table->string('direction')->nullable()->index();
            $table->string('status')->default('new')->index();
            $table->string('call_session_state')->nullable();
            $table->boolean('is_active')->nullable();
            $table->string('caller_number')->nullable()->index();
            $table->string('destination_number')->nullable();
            $table->string('customer_number')->nullable()->index();
            $table->string('assigned_agent_client')->nullable()->index();
            $table->foreignId('assigned_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('queue_name')->nullable();
            $table->timestamp('queue_wait_started_at')->nullable();
            $table->unsignedInteger('queue_wait_seconds')->default(0);
            $table->timestamp('started_at')->nullable();
            $table->timestamp('answered_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->string('hangup_cause')->nullable();
            $table->text('error_message')->nullable();
            $table->json('payload')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('voice_calls');
    }
};
