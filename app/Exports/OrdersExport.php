<?php

namespace App\Exports;

use App\Models\SheetOrder;
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
        $workflowOrderIds = array_values(array_filter($this->filters['workflow_order_ids'] ?? []));
        $extraStatuses = array_values(array_filter($this->filters['extra_statuses'] ?? []));
        $from = $this->filters['from'] ?? null;
        $to = $this->filters['to'] ?? null;

        $query = SheetOrder::query()
            ->when(!empty($this->filters['country']), function ($q) {
                $q->where('country', $this->filters['country']);
            })
            ->when(!empty($this->filters['merchant']), function ($q) {
                $q->where('merchant', $this->filters['merchant']);
            })
            ->where(function ($query) use ($workflowOrderIds, $extraStatuses, $from, $to): void {
                if ($workflowOrderIds !== []) {
                    $query->whereIn('id', $workflowOrderIds);
                }

                if ($extraStatuses !== []) {
                    $query->orWhere(function ($extraQuery) use ($extraStatuses, $from, $to): void {
                        $extraQuery
                            ->whereIn('status', $extraStatuses)
                            ->where(function ($statusQuery): void {
                                $statusQuery->whereNull('agent')->orWhere('agent', '!=', 'Remitted');
                            })
                            ->whereBetween('delivery_date', [$from, $to]);
                    });
                }
            });

        return $query
            ->orderBy('status')
            ->orderBy('product_name')
            ->orderBy('delivery_date');
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
            'callcenter',
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
            $order->cc_email,
            $order->delivery_date,
            $order->instructions,
            $order->merchant,
        ];
    }
}
