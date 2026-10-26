<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Sheet extends Model
{
    use HasFactory;

    // Define the table name associated with the model
    protected $table = 'sheets';

    // Define fillable fields to allow mass assignment
    protected $fillable = [
        'sheet_id',
        'sheet_name',
        'store_name',
        'shopify_name',
        'access_token',
        'country',
        'cc_agents',
        'sku',
        'auto_pickup_enabled',
        'auto_pickup_tabs',
    ];

    protected $casts = [
        'auto_pickup_enabled' => 'boolean',
        'auto_pickup_tabs' => 'array',
    ];
}
