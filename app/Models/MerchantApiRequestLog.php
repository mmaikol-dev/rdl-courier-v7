<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MerchantApiRequestLog extends Model
{
    protected $fillable = [
        'merchant_api_integration_id', 'method', 'path', 'status_code', 'duration_ms', 'requested_at',
    ];

    protected $casts = [
        'requested_at' => 'datetime',
    ];

    public function integration(): BelongsTo
    {
        return $this->belongsTo(MerchantApiIntegration::class, 'merchant_api_integration_id');
    }
}
