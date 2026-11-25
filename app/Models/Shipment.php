<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

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

    public static function forInbound(array $attributes, int $userId, string $warehouseCode, int $quantity): self
    {
        $shipment = new self($attributes);

        if (Schema::hasColumn('shipments', 'date')) {
            $shipment->setAttribute('date', today()->toDateString());
        }
        if (Schema::hasColumn('shipments', 'shipment_no')) {
            $shipment->setAttribute('shipment_no', 'IN-'.$warehouseCode.'-'.Str::upper(Str::random(10)));
        }
        if (Schema::hasColumn('shipments', 'quantity')) {
            $shipment->setAttribute('quantity', $quantity);
        }
        if (Schema::hasColumn('shipments', 'type')) {
            $shipment->setAttribute('type', 'Received');
        }
        if (Schema::hasColumn('shipments', 'user_id')) {
            $shipment->setAttribute('user_id', $userId);
        }

        return $shipment;
    }

    public function assignInboundNumber(string $number): void
    {
        $attributes = ['shipment_number' => $number];

        if (Schema::hasColumn('shipments', 'shipment_no')) {
            $attributes['shipment_no'] = $number;
        }

        $this->forceFill($attributes)->save();
    }

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
