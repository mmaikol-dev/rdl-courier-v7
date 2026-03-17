<?php

namespace App\Exports;

use App\Models\SheetOrder;
use Illuminate\Contracts\View\View;
use Maatwebsite\Excel\Concerns\FromQuery;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithMapping;

class OrdersExport implements FromQuery, WithHeadings, WithMapping
{
    protected $filters;

    public function __construct($filters)
    {
        $this->filters = $filters;
    }

   public function query()
{
    $query = SheetOrder::query()
        ->when(!empty($this->filters['country']), function ($q) {
            $q->where('country', $this->filters['country']);
        })
        ->when(!empty($this->filters['merchant']), function ($q) {
            $q->where('merchant', $this->filters['merchant']);
        })
        ->when(!empty($this->filters['statuses']), function ($q) {
            $q->whereIn('status', $this->filters['statuses']);
        })
        ->when(!empty($this->filters['from']) && !empty($this->filters['to']), function ($q) {
            $q->whereBetween('delivery_date', [
                $this->filters['from'], $this->filters['to']
            ]);
        });

    // Ensure product grouping
     $query->orderBy('product_name')
          ->orderBy('status');// optional, but cleaner

    return $query;
}


    public function headings(): array
    {
        return [
            'ID',
            'Order Date',
            'Order No',
            'Amount',
            'Client Name',
            'Address',
            'Phone',
            'Alt No',
            'Country',
            'City',
            'Product Name',
            'Quantity',
            'Status',
            'Agent',
            'Delivery Date',
            'Instructions',
            'Merchant'
        ];
    }

    public function map($order): array
    {
        return [
            $order->id,
            $order->created_at?->format('Y-m-d'),
            $order->order_no,
            $order->amount,
            $order->client_name,
            $order->address,
            $order->phone,
            $order->alt_no,
            $order->country,
            $order->city,
            $order->product_name,
            $order->quantity,
            $order->status,
            $order->agent,
            $order->delivery_date,
            $order->instructions,
            $order->merchant,
        ];
    }
}
