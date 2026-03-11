<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('voice_call_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('voice_call_id')->constrained('voice_calls')->cascadeOnDelete();
            $table->string('event_type')->index();
            $table->timestamp('occurred_at')->nullable();
            $table->json('payload')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('voice_call_events');
    }
};
