<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AppScriptController;
use App\Http\Controllers\C2BTransactionController;
use App\Http\Controllers\StkController;
use App\Http\Controllers\VoiceController;
use App\Http\Controllers\CallcenterController;
use App\Http\Controllers\WhatsappController;
use App\Http\Controllers\MetaWebhookController;
use App\Http\Controllers\ChatController;


Route::post('/c2b/confirmation', [C2BTransactionController::class, 'confirmTransaction']);
Route::post('/c2b/validation', [C2BTransactionController::class, 'validateTransaction']); // optional if you handle validation
Route::get('/transactions/{order_no}', [StkController::class, 'checkStatus'])->name('transactions.check');
Route::post('/stk/stk-push', [StkController::class, 'stkPush'])->name('stk.push');
Route::post('/mpesa/callback', [StkController::class, 'handleCallback'])->name('stk.callback');
Route::post('/sheet-orders', [AppScriptController::class, 'storeOrder']);
Route::post('/end-call', [CallcenterController::class, 'endCall']);

Route::post('/callcenter/make-call', [CallcenterController::class, 'makeCall']);
Route::post('/whatsapp/send-chat', [WhatsappController::class, 'sendChat'])->name('whatsapp.sendChat');
Route::get('/whatsapp/media/{filename}', [ChatController::class, 'serveMedia'])->name('whatsapp.media');
// ============================================
// WasenderAPI Webhook Routes
// ============================================

// WasenderAPI only uses POST for webhooks
Route::post('/whatsapp/webhook', [WhatsappController::class, 'webhook']);

// Optional: Add a GET route for testing/verification if needed
Route::get('/whatsapp/webhook', function() {
    return response()->json([
        'status' => 'Webhook endpoint active',
        'provider' => 'WasenderAPI',
        'timestamp' => now()
    ]);
});

// ============================================
// Meta WhatsApp Cloud API Webhook Routes
// ============================================

Route::get('/whatsapp/meta/webhook', [MetaWebhookController::class, 'verify']);
Route::post('/whatsapp/meta/webhook', [MetaWebhookController::class, 'handleWebhook']);


Route::post('/capability-token', [VoiceController::class, 'getCapabilityToken']);
    Route::post('/make-call', [VoiceController::class, 'makeCall']);
    Route::post('/set-default-agent', [VoiceController::class, 'setDefaultAgent']);
    Route::get('/test-connection', [VoiceController::class, 'testConnection']);
    Route::get('/active-sessions', [VoiceController::class, 'listActiveSessions']);

// API routes for voice functionality
Route::prefix('voice')->group(function () {
    Route::post('/capability-token', [VoiceController::class, 'getCapabilityToken']);
    Route::post('/make-call', [VoiceController::class, 'makeCall']);
    Route::post('/agent-presence', [VoiceController::class, 'updateAgentPresence']);
    Route::get('/queue-status', [VoiceController::class, 'queueStatus']);
    Route::get('/calls', [VoiceController::class, 'recentCalls']);
});

// Africa's Talking callback routes
Route::prefix('webhooks')->group(function () {
    Route::post('/voice/callback', [VoiceController::class, 'callCallback']);
    Route::post('/voice/status', [VoiceController::class, 'callStatus']);
    Route::post('/voice/incoming', [VoiceController::class, 'incomingCall']);



  
});


// routes/api.php
Route::post('/update-order-timestamp', [AppScriptController::class, 'updateTimestamp']);
