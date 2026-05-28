<?php

use Illuminate\Foundation\Inspiring;
use App\Jobs\RunArtisanCommandJob;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

// Example command (default)
Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Schedule your custom command. Keep this conservative in production because
// each run can touch the database and the Google Sheets API.
Schedule::job(new RunArtisanCommandJob('orders:update-sheets', ['--limit' => 1000]))
    ->everyFiveMinutes()
    ->withoutOverlapping(10);

Schedule::job(new RunArtisanCommandJob('orders:process-synced'))
    ->everyTenMinutes()
    ->withoutOverlapping(10);

Schedule::job(new RunArtisanCommandJob('c2b:process-transactions'))
    ->everyMinute()
    ->withoutOverlapping(10);

Schedule::job(new RunArtisanCommandJob('whatsapp:send-meta'))
    ->dailyAt('08:00')
    ->withoutOverlapping(10);
