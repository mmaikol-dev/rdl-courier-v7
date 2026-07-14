<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrderScan extends Model
{
    use HasFactory;

    protected $fillable = [
        'order_id',
        'order_no',
        'product_name',
        'quantity',
        'scan_type',
        'reason',
        'scanned_by',
        'user_id',
        'scanned_at',
    ];

    protected $casts = [
        'scanned_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(SheetOrder::class, 'order_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function scopeType($query, string $type)
    {
        return $query->where('scan_type', $type);
    }
}
