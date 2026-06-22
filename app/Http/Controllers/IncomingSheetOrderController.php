<?php

namespace App\Http\Controllers;

use App\Models\IncomingSheetOrder;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class IncomingSheetOrderController extends Controller
{
    public function index(Request $request): Response
    {
        $status = $request->string('status')->toString();
        $search = trim($request->string('search')->toString());

        $query = IncomingSheetOrder::query()
            ->select([
                'id',
                'order_no',
                'sheet_id',
                'sheet_name',
                'status',
                'attempts',
                'error_message',
                'processed_at',
                'available_at',
                'created_at',
                'updated_at',
                'payload',
            ])
            ->latest('created_at');

        if ($status !== '' && $status !== 'all') {
            $query->where('status', $status);
        }

        if ($search !== '') {
            $query->where(function ($builder) use ($search): void {
                $builder->where('order_no', 'like', "%{$search}%")
                    ->orWhere('sheet_id', 'like', "%{$search}%")
                    ->orWhere('sheet_name', 'like', "%{$search}%");
            });
        }

        $statusCounts = IncomingSheetOrder::query()
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        return Inertia::render('incoming-sheet-orders/index', [
            'incomingOrders' => $query->paginate(50)->withQueryString(),
            'filters' => [
                'search' => $search,
                'status' => $status ?: 'all',
            ],
            'statusCounts' => [
                'all' => (int) $statusCounts->sum(),
                'pending' => (int) ($statusCounts['pending'] ?? 0),
                'processing' => (int) ($statusCounts['processing'] ?? 0),
                'processed' => (int) ($statusCounts['processed'] ?? 0),
                'failed' => (int) ($statusCounts['failed'] ?? 0),
            ],
        ]);
    }
}
