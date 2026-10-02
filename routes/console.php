<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

// Example command (default)
Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Keep scheduled work conservative in production: these commands touch the
// database and external APIs, so the command itself should hold the overlap lock.
Schedule::command('orders:update-sheets', ['--limit' => 250])
    ->everyFiveMinutes()
    ->withoutOverlapping(30);


Schedule::command('whatsapp:send-meta')
    ->dailyAt('06:00')
    ->withoutOverlapping(60);


Schedule::command('whatsapp:notify-overdue')
        ->dailyAt('07:00')
        ->withoutOverlapping(60);


// Storeep reconciliation. Webhooks (when configured) give low latency; this
// walk is the safety net that makes missed deliveries a non-event. Storeep
// rate limits at 60 requests/minute per token, so every few minutes is plenty.
Schedule::command('storeep:sync-orders')
    ->everyFiveMinutes()
    ->withoutOverlapping(30);
