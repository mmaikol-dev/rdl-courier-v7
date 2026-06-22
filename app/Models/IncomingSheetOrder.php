<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class IncomingSheetOrder extends Model
{
    use HasFactory;

    protected $fillable = [
        'source_hash',
        'order_no',
        'sheet_id',
        'sheet_name',
        'payload',
        'status',
        'attempts',
        'error_message',
        'processed_at',
        'available_at',
    ];

    protected $casts = [
        'payload' => 'array',
        'processed_at' => 'datetime',
        'available_at' => 'datetime',
    ];
}
