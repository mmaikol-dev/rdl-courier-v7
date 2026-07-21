<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SheetOrder extends Model
{
    use HasFactory;
 

    protected $fillable = [
        'order_no',
        'order_date',
        'amount',
        'quantity',
        'item',
        'delivery_date',
        'client_name',
        'client_city',
        'date',
        'address',
        'product_name',
        'city',
        'country',
        'phone',
        'confirmed',
        'comments',
        'agent',
        'store_name',
        'status',
        'code',
        'order_type',
        'alt_no',
        'merchant',
        'cc_email',
        'instructions',
        'invoice_code',
        'inventory_deducted_at',
        'inventory_deducted_by',
        'inventory_product_id',
        'sheet_id',
        'sheet_name',
        'created_at',
        'updated_at',
            

        
        
        
        // Add more fields as needed
    ];

 
   protected $casts = [
        'order_date' => 'datetime', // Cast to datetime to preserve time
        'delivery_date' => 'datetime', // Cast to datetime to preserve time
        'inventory_deducted_at' => 'datetime',
    ];

    // In SheetOrder.php
    public function histories()
    {
        return $this->hasMany(OrderHistory::class, 'order_id');
    }

    public function linkedProduct()
    {
        return $this->belongsTo(Product::class, 'inventory_product_id');
    }
    

  

}
