<?php

namespace App\Http\Middleware;

use Illuminate\Foundation\Http\Middleware\VerifyCsrfToken as Middleware;

class VerifyCsrfToken extends Middleware
{
    protected $except = [
        '/api/sheet-orders',
        'c2b/confirmation',
        'c2b/validation',
        'stk/stk-push',
        'locations/heartbeat',
        'locations/login',
        'dispatch/bulk-download-waybills',
        'dispatch/bulk-assign',
    ];
    
}
