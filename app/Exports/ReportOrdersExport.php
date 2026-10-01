<?php

namespace App\Exports;

use Illuminate\Database\Eloquent\Builder;

/**
 * Report-page export.
 *
 * The report screen builds its own query (country/merchant scoped, selectable
 * date basis) and hands it over ready-made, so the workbook always contains
 * exactly the rows the preview table showed. Headings and the base mapping are
 * inherited from OrdersExport so both exports stay column-aligned.
 */
class ReportOrdersExport extends OrdersExport
{
    private Builder $exportQuery;

    public function __construct(Builder $query)
    {
        parent::__construct([]);

        $this->exportQuery = $query;
    }

    public function query(): Builder
    {
        return $this->exportQuery;
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
            'callcenter',
            'Instructions',
            'Merchant',
        ];
    }

    public function map($order): array
    {
        return [
            $order->id,
            $order->order_no,
            $order->order_date instanceof \DateTimeInterface
                ? \Illuminate\Support\Carbon::instance($order->order_date)->format('Y-m-d')
                : $order->order_date,
            $order->delivery_date instanceof \DateTimeInterface
                ? \Illuminate\Support\Carbon::instance($order->delivery_date)->format('Y-m-d')
                : $order->delivery_date,
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
        ];
    }
}