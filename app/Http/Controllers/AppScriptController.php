<?php

namespace App\Http\Controllers;

use App\Models\AppScript;
use App\Models\IncomingSheetOrder;
use App\Jobs\ProcessIncomingSheetOrder;
use Illuminate\Support\Facades\Log;
use Illuminate\Http\Request;

class AppScriptController extends Controller
{
    public function index()
    {
        //
    }

    public function storeOrder(Request $request)
    {
        try {
            $payload = $request->all();
            $sourceHash = $this->sourceHash($payload);

            $incoming = IncomingSheetOrder::firstOrCreate(
                ['source_hash' => $sourceHash],
                [
                    'order_no' => $this->nullIfBlank($payload['order_no'] ?? null),
                    'sheet_id' => $this->nullIfBlank($payload['sheet_id'] ?? null),
                    'sheet_name' => $this->nullIfBlank($payload['sheet_name'] ?? null),
                    'payload' => $payload,
                    'status' => 'pending',
                    'available_at' => now(),
                ]
            );

            $shouldDispatch = $incoming->wasRecentlyCreated;

            if (! $incoming->wasRecentlyCreated) {
                $updates = [
                    'order_no' => $this->nullIfBlank($payload['order_no'] ?? null),
                    'sheet_id' => $this->nullIfBlank($payload['sheet_id'] ?? null),
                    'sheet_name' => $this->nullIfBlank($payload['sheet_name'] ?? null),
                    'payload' => $payload,
                ];

                if ($incoming->status === 'failed') {
                    $updates = [
                        ...$updates,
                        'status' => 'pending',
                        'error_message' => null,
                        'available_at' => now(),
                    ];

                    $shouldDispatch = true;
                }

                if ($incoming->status === 'pending' && (
                    $incoming->available_at === null || $incoming->available_at->lte(now())
                )) {
                    $shouldDispatch = true;
                }

                $incoming->forceFill($updates)->save();
            }

            if ($shouldDispatch) {
                ProcessIncomingSheetOrder::dispatch($incoming->id)->onQueue('imports');
            }

            return response()->json([
                'message' => 'Order queued for processing',
                'queued' => true,
                'incoming_id' => $incoming->id,
                'status' => $incoming->status,
            ], 202);

        } catch (\Exception $e) {
            Log::error('Error queueing incoming sheet order', ['error' => $e->getMessage()]);
            return response()->json([
                'message' => 'Error queueing order',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function updateTimestamp(Request $request)
    {
        $validated = $request->validate([
            'order_no' => 'required|string',
            'updated_at' => 'required|date',
        ]);

        $order = \App\Models\SheetOrder::where('order_no', $validated['order_no'])->first();

        if (!$order) {
            return response()->json(['success' => false, 'message' => 'Order not found'], 404);
        }

        $order->updated_at = $validated['updated_at'];
        $order->save();

        return response()->json(['success' => true]);
    }

    public function create()
    {
        //
    }

    public function store(Request $request)
    {
        //
    }

    public function show(AppScript $appScript)
    {
        //
    }

    public function edit(AppScript $appScript)
    {
        //
    }

    public function update(Request $request, AppScript $appScript)
    {
        //
    }

    public function destroy(AppScript $appScript)
    {
        //
    }

    private function nullIfBlank(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $trimmed = trim((string) $value);

        return $trimmed === '' ? null : $trimmed;
    }

    private function sourceHash(array $payload): string
    {
        $orderNo = $this->nullIfBlank($payload['order_no'] ?? null);

        $identity = [
            'sheet_id' => $this->nullIfBlank($payload['sheet_id'] ?? null),
            'sheet_name' => $this->nullIfBlank($payload['sheet_name'] ?? null),
            'order_no' => $orderNo,
        ];

        if ($orderNo === null) {
            $identity['payload'] = $payload;
        }

        return hash('sha256', json_encode($identity));
    }
}
