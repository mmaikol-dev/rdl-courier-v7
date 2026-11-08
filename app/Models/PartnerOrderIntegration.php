<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PartnerOrderIntegration extends Model
{
    protected $fillable = [
        'sheets_id', 'provider', 'integration_name', 'base_url', 'api_key',
        'country_code', 'since_date', 'is_enabled', 'last_synced_at',
        'orders_synced', 'last_error', 'last_error_at',
    ];

    protected $casts = [
        'api_key' => 'encrypted',
        'is_enabled' => 'boolean',
        'since_date' => 'date',
        'last_synced_at' => 'datetime',
        'last_error_at' => 'datetime',
        'orders_synced' => 'integer',
    ];

    public function sheet(): BelongsTo
    {
        return $this->belongsTo(Sheet::class, 'sheets_id');
    }
}
