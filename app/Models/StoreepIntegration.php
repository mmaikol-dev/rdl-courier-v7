<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A Storeep store connected to one of our merchants in one country.
 *
 * Credentials are encrypted at rest by the 'encrypted' cast, so the token is
 * never readable in the database or in logs. Access it through
 * `$integration->access_token` and never echo it.
 */
class StoreepIntegration extends Model
{
    use HasFactory;

    protected $fillable = [
        'sheets_id',
        'store_name',
        'access_token',
        'country',
        'order_no_prefix',
        'is_enabled',
        'last_synced_at',
        'last_synced_at_remote',
        'orders_synced',
        'last_error',
        'last_error_at',
    ];

    protected $casts = [
        'access_token' => 'encrypted',
        'is_enabled' => 'boolean',
        'last_synced_at' => 'datetime',
        'last_synced_at_remote' => 'datetime',
        'last_error_at' => 'datetime',
        'orders_synced' => 'integer',
    ];

    /**
     * `sheets.sheet_name` is the merchant name. Order visibility compares
     * `sheet_orders.merchant` against `users.name` byte-for-byte
     * (SheetOrderController:38), so this must match exactly, casing included.
     */
    public function sheet(): BelongsTo
    {
        return $this->belongsTo(Sheet::class, 'sheets_id');
    }

    public function merchantName(): string
    {
        return (string) ($this->sheet?->sheet_name ?? '');
    }
}
