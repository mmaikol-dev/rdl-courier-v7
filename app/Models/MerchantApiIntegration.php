<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MerchantApiIntegration extends Model
{
    protected $fillable = [
        'merchant_user_id', 'name', 'token_hash', 'token_prefix', 'scopes',
        'webhook_url', 'webhook_secret', 'webhook_events', 'transfer_fields', 'is_active', 'last_used_at',
    ];

    protected $hidden = ['token_hash', 'webhook_secret'];

    protected $casts = [
        'scopes' => 'array',
        'webhook_events' => 'array',
        'transfer_fields' => 'array',
        'webhook_secret' => 'encrypted',
        'is_active' => 'boolean',
        'last_used_at' => 'datetime',
    ];

    public function merchantUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'merchant_user_id');
    }

    public function requestLogs(): HasMany
    {
        return $this->hasMany(MerchantApiRequestLog::class);
    }
}
