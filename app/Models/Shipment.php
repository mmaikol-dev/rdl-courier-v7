<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Shipment extends Model
{
    public const EXPECTED = 'EXPECTED';
    public const ARRIVED = 'ARRIVED';
    public const RECEIVING = 'RECEIVING';
    public const RECEIVED = 'RECEIVED';
    public const DISCREPANCY = 'DISCREPANCY';

    protected $fillable = [
        'shipment_number',
        'supplier',
        'supplier_reference',
        'carrier',
        'tracking_number',
        'expected_on',
        'cartons',
        'warehouse_code',
        'warehouse_name',
        'country',
        'status',
        'note',
        'created_by',
        'received_by',
        'arrived_at',
        'received_at',
    ];

    protected $casts = [
        'expected_on' => 'date',
        'arrived_at' => 'datetime',
        'received_at' => 'datetime',
    ];

    public function items(): HasMany
    {
        return $this->hasMany(ShipmentItem::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function receiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }
}
