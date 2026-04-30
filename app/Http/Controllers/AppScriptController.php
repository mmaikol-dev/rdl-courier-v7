<?php

namespace App\Http\Controllers;

use App\Models\AppScript;
use App\Models\Sheet;
use App\Models\SheetOrder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;



use Illuminate\Http\Request;

class AppScriptController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index()
    {
        //
    }


    public function storeOrder(Request $request)
    {
        try {
            $sheet = null;

            // Clean amount: remove non-digit characters (e.g., KSH)
            $cleanAmount = preg_replace('/[^\d.]/', '', $request->input('amount'));
    
            // Clean quantity: extract number only (e.g., "1 pack" → 1)
            preg_match('/\d+/', $request->input('quantity'), $matches);
            $cleanQuantity = isset($matches[0]) ? (int)$matches[0] : null;
    
            // Merge cleaned data
            $request->merge([
                'order_no' => trim((string) $request->input('order_no')),
                'delivery_date' => $request->input('delivery_date'),
                'amount' => $cleanAmount,
                'client_name' => $this->nullIfBlank($request->input('client_name')),
                'quantity' => $cleanQuantity,
                'phone' => $this->normalizePhone($request->input('phone')),
                'alt_no' => $this->normalizePhone($request->input('alt_no')),
                'address' => $this->nullIfBlank($request->input('address')),
                'product_name' => $this->nullIfBlank($request->input('product_name')),
                'sheet_id' => $this->nullIfBlank($request->input('sheet_id')),
                'sheet_name' => $this->nullIfBlank($request->input('sheet_name')),
                'merchant' => $this->nullIfBlank($request->input('merchant')),
                'city' => $this->nullIfBlank($request->input('city')),
                'country' => $this->nullIfBlank($request->input('country')),
                'status' => $this->nullIfBlank($request->input('status')),
                'agent' => $this->nullIfBlank($request->input('agent')),
            ]);

            if ($request->filled('sheet_id')) {
                $sheet = Sheet::where('sheet_id', $request->input('sheet_id'))->first();

                $request->merge([
                    'store_name' => !empty($sheet?->store_name) ? $sheet->store_name : 'RDL1',
                ]);
            }
    
            // Validate
            $validatedData = $request->validate([
                'order_no' => 'required|string|max:255',
                'amount' => 'required|numeric',
                'quantity' => 'required|integer',
                'client_name' => 'nullable|string|max:255',
                'address' => 'nullable|string',
                'city' => 'nullable|string',
                'store_name' => 'nullable|string',
                'alt_no' => 'nullable|string',
                'country' => 'nullable|string',
                'phone' => 'nullable|string|max:30',
                'product_name' => 'nullable|string|max:255',
                'status' => 'nullable|string',
                'delivery_date' => 'nullable|date',
                'agent' => 'nullable|string',
                'sheet_id' => 'nullable|string',
                'sheet_name' => 'nullable|string',
                'merchant' => 'nullable|string',
            ]);

            $validatedData['store_name'] = $validatedData['store_name'] ?: 'RDL1';
    
            // Default cc_email
            $validatedData['cc_email'] = null;
            
              $validatedData['order_date'] = now()->toDateString();

    
            // ✅ Assign cc_email from sheet's cc_agents JSON (per sheet_name)
            if (!empty($validatedData['sheet_id']) && !empty($validatedData['sheet_name'])) {
                Log::info("Assigning cc_email", [
                    'sheet_id' => $validatedData['sheet_id'],
                    'sheet_name' => $validatedData['sheet_name']
                ]);
    
                if ($sheet && !empty($sheet->cc_agents)) {
                    $agentsConfig = json_decode($sheet->cc_agents, true);
                    Log::info("Decoded cc_agents JSON", ['agentsConfig' => $agentsConfig]);
    
                    if (isset($agentsConfig[$validatedData['sheet_name']])) {
                        $agents = $agentsConfig[$validatedData['sheet_name']];
                        Log::info("Agents for this sheet_name", ['agents' => $agents]);
    
                        if (!empty($agents)) {
                            $orderCount = SheetOrder::where('sheet_id', $validatedData['sheet_id'])
                                                    ->where('sheet_name', $validatedData['sheet_name'])
                                                    ->count();
                            Log::info("Order count for this sheet_id + sheet_name", ['orderCount' => $orderCount]);
    
                            $agentIndex = $orderCount % count($agents);
                            $validatedData['cc_email'] = $agents[$agentIndex];
    
                            Log::info("Assigned cc_email", ['cc_email' => $validatedData['cc_email']]);
                        } else {
                            Log::warning("No agents found for sheet_name", ['sheet_name' => $validatedData['sheet_name']]);
                        }
                    } else {
                        Log::warning("No agent config found for sheet_name", [
                            'sheet_name' => $validatedData['sheet_name'],
                            'availableKeys' => array_keys($agentsConfig)
                        ]);
                    }
                } else {
                    Log::warning("No sheet or empty cc_agents found", ['sheet' => $sheet]);
                }
            }
    
            $result = DB::transaction(function () use ($validatedData) {
                $existingOrder = $this->findExistingOrderForAppScript($validatedData);

                if ($existingOrder) {
                    foreach ($validatedData as $key => $value) {
                        if ($this->shouldBackfillValue($existingOrder->$key ?? null, $value)) {
                            $existingOrder->$key = $value;
                        }
                    }

                    $existingOrder->updated_at = null;

                    SheetOrder::withoutTimestamps(function () use ($existingOrder): void {
                        $existingOrder->save();
                    });

                    return [
                        'created' => false,
                        'order' => $existingOrder,
                    ];
                }

                $sheetOrder = SheetOrder::withoutTimestamps(function () use ($validatedData) {
                    return SheetOrder::create([
                        ...$validatedData,
                        'created_at' => now(),
                        'updated_at' => null,
                    ]);
                });

                return [
                    'created' => true,
                    'order' => $sheetOrder,
                ];
            });

            if (! $result['created']) {
                Log::info("Existing order updated", ['order_no' => $validatedData['order_no']]);

                return response()->json([
                    'message' => 'Order already exists and was updated',
                    'order_no' => $validatedData['order_no'],
                    'data' => $result['order'],
                ], 200);
            }

            Log::info("New order created", ['order_no' => $validatedData['order_no'], 'cc_email' => $validatedData['cc_email']]);

            return response()->json([
                'message' => 'Order successfully created',
                'data' => $result['order']
            ], 201);
    
        } catch (\Exception $e) {
            Log::error("Error creating order", ['error' => $e->getMessage()]);
            return response()->json([
                'message' => 'Error creating order',
                'error' => $e->getMessage()
            ], 500);
        }
    }
    
    
    
    
//sync
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


    /**
     * Show the form for creating a new resource.
     */
    public function create()
    {
        //
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        //
    }

    /**
     * Display the specified resource.
     */
    public function show(AppScript $appScript)
    {
        //
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(AppScript $appScript)
    {
        //
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, AppScript $appScript)
    {
        //
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(AppScript $appScript)
    {
        //
    }

    private function findExistingOrderForAppScript(array $validatedData): ?SheetOrder
    {
        $orderNo = $this->normalizeIdentityValue($validatedData['order_no'] ?? null);
        $sheetId = $this->normalizeIdentityValue($validatedData['sheet_id'] ?? null);
        $sheetName = $this->normalizeIdentityValue($validatedData['sheet_name'] ?? null);
        $clientName = $this->normalizeIdentityValue($validatedData['client_name'] ?? null);
        $phone = $this->normalizeIdentityValue($validatedData['phone'] ?? null);
        $productName = $this->normalizeIdentityValue($validatedData['product_name'] ?? null);

        $orderNoMatches = SheetOrder::query()
            ->lockForUpdate()
            ->whereRaw('LOWER(TRIM(order_no)) = ?', [$orderNo])
            ->orderBy('id')
            ->get();

        if ($orderNoMatches->count() > 1) {
            Log::warning('Multiple existing rows found for AppScript order number.', [
                'order_no' => $validatedData['order_no'],
                'matched_ids' => $orderNoMatches->pluck('id')->all(),
            ]);
        }

        $scopedOrderNoMatch = $orderNoMatches->first(function (SheetOrder $order) use ($sheetId, $sheetName) {
            $existingSheetId = $this->normalizeIdentityValue($order->sheet_id);
            $existingSheetName = $this->normalizeIdentityValue($order->sheet_name);

            if ($sheetId !== null && $existingSheetId !== null && $sheetId !== $existingSheetId) {
                return false;
            }

            if ($sheetName !== null && $existingSheetName !== null && $sheetName !== $existingSheetName) {
                return false;
            }

            return true;
        });

        if ($scopedOrderNoMatch) {
            return $scopedOrderNoMatch;
        }

        return SheetOrder::query()
            ->lockForUpdate()
            ->when($sheetId !== null, fn ($query) => $query->whereRaw('LOWER(TRIM(sheet_id)) = ?', [$sheetId]))
            ->when($sheetName !== null, fn ($query) => $query->whereRaw('LOWER(TRIM(sheet_name)) = ?', [$sheetName]))
            ->when($clientName !== null, fn ($query) => $query->whereRaw('LOWER(TRIM(client_name)) = ?', [$clientName]))
            ->when($phone !== null, fn ($query) => $query->whereRaw('LOWER(TRIM(phone)) = ?', [$phone]))
            ->when($productName !== null, fn ($query) => $query->whereRaw('LOWER(TRIM(product_name)) = ?', [$productName]))
            ->where('quantity', $validatedData['quantity'])
            ->where('amount', $validatedData['amount'])
            ->when(
                ! empty($validatedData['delivery_date']),
                fn ($query) => $query->whereDate('delivery_date', $validatedData['delivery_date'])
            )
            ->orderBy('id')
            ->first();
    }

    private function shouldBackfillValue(mixed $existingValue, mixed $incomingValue): bool
    {
        return $incomingValue !== null
            && (is_string($existingValue) ? trim($existingValue) === '' : empty($existingValue));
    }

    private function nullIfBlank(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $trimmed = trim((string) $value);

        return $trimmed === '' ? null : $trimmed;
    }

    private function normalizePhone(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $digits = preg_replace('/\D+/', '', (string) $value);

        return $digits !== '' ? $digits : null;
    }

    private function normalizeIdentityValue(mixed $value): ?string
    {
        $normalized = $this->nullIfBlank($value);

        return $normalized !== null ? strtolower($normalized) : null;
    }
}
