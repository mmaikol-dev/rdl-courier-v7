<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

// Example command (default)
Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Schedule your custom command. Keep this conservative in production because
// each run can touch the database and the Google Sheets API.
Schedule::command('orders:update-sheets')
    ->everyFiveMinutes()
    ->withoutOverlapping(10);
