<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SheetOrder extends Model
{
    use HasFactory;

    /**
     * Pseudo-status meaning "an order that has not been triaged yet". It covers
     * both the literal 'New Orders' status and orders with no status at all,
     * since every order board renders a blank status as "New Orders".
     */
    public const NEW_ORDERS_STATUS = 'New Orders';
 

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
        'clearance_status',
        'created_at',
        'updated_at',
            

        
        
        
        // Add more fields as needed
    ];

 
   protected $casts = [
        'order_date' => 'datetime', // Cast to datetime to preserve time
        'delivery_date' => 'datetime', // Cast to datetime to preserve time
        'inventory_deducted_at' => 'datetime',
    ];

    /**
     * Filter by a list of statuses, honouring the 'New Orders' pseudo-status.
     *
     * An empty list means "no status restriction" and leaves the query untouched.
     */
    public function scopeWhereStatuses(Builder $query, array $statuses): Builder
    {
        $statuses = array_values(array_filter(
            $statuses,
            static fn ($status) => is_string($status) && trim($status) !== ''
        ));

        if ($statuses === []) {
            return $query;
        }

        $includeNewOrders = in_array(self::NEW_ORDERS_STATUS, $statuses, true);
        $others = array_values(array_diff($statuses, [self::NEW_ORDERS_STATUS]));

        return $query->where(function (Builder $q) use ($includeNewOrders, $others) {
            if ($includeNewOrders) {
                // The literal status, plus orders whose status was never set.
                // TRIM is explicit so whitespace-only values are caught regardless
                // of the column collation.
                $q->whereNull('status')
                    ->orWhereRaw("TRIM(status) = ''")
                    ->orWhere('status', self::NEW_ORDERS_STATUS);
            }

            if ($others !== []) {
                $q->orWhereIn('status', $others);
            }
        });
    }

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
