<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_conversations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('title', 255)->nullable();
            $table->timestamps();

            $table->index(['user_id', 'updated_at']);
        });

        Schema::table('ai_chats', function (Blueprint $table) {
            $table->foreignId('conversation_id')
                ->nullable()
                ->after('user_id')
                ->constrained('ai_conversations')
                ->cascadeOnDelete();
        });

        // Backfill: group existing orphaned chats into one conversation per user
        $userIds = DB::table('ai_chats')
            ->select('user_id')
            ->whereNull('conversation_id')
            ->distinct()
            ->pluck('user_id');

        foreach ($userIds as $userId) {
            $conversationId = DB::table('ai_conversations')->insertGetId([
                'user_id' => $userId,
                'title' => 'Chat 1',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            DB::table('ai_chats')
                ->where('user_id', $userId)
                ->whereNull('conversation_id')
                ->update(['conversation_id' => $conversationId]);
        }
    }

    public function down(): void
    {
        Schema::table('ai_chats', function (Blueprint $table) {
            $table->dropConstrainedForeignId('conversation_id');
        });

        Schema::dropIfExists('ai_conversations');
    }
};
