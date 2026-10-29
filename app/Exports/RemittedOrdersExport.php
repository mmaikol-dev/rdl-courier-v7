<?php

namespace App\Exports;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Maatwebsite\Excel\Concerns\FromQuery;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithMapping;

class RemittedOrdersExport implements FromQuery, WithHeadings, WithMapping
{
    public function __construct(private Builder $orders)
    {
    }

    public function query(): Builder
    {
        return $this->orders;
    }

    public function headings(): array
    {
        return [
            'ID',
            'Order No',
            'Order Date',
            'Delivery Date',
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
            'Order Type',
            'Call Center',
            'Instructions',
            'Merchant',
            'Report Generated At',
            'Merchant Confirmed At',
            'Remitted At',
        ];
    }

    public function map($order): array
    {
        return [
            $order->id,
            $order->order_no,
            $order->order_date?->format('Y-m-d'),
            $order->delivery_date,
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
            $order->order_type,
            $order->cc_email,
            $order->instructions,
            $order->merchant,
            $this->formatTimestamp($order->report_generated_at),
            $this->formatTimestamp($order->merchant_confirmed_at),
            $this->formatTimestamp($order->remitted_at),
        ];
    }

    private function formatTimestamp(mixed $value): ?string
    {
        return $value ? Carbon::parse($value)->format('Y-m-d H:i:s') : null;
    }
}
