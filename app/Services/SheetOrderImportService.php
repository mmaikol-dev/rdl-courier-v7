<?php

namespace App\Services;

use App\Models\Sheet;
use App\Models\SheetOrder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class SheetOrderImportService
{
    public function __construct(
        private readonly ProductAutoMatchService $autoMatch = new ProductAutoMatchService,
    ) {}

    /**
     * Normalize, validate, and upsert one order payload from Google Apps Script.
     *
     * @return array{created: bool, order: SheetOrder}
     */
    public function import(array $payload): array
    {
        $data = $this->normalizePayload($payload);
        $sheet = null;

        if (! empty($data['sheet_id'])) {
            $sheet = Sheet::where('sheet_id', $data['sheet_id'])->first();
            $data['store_name'] = ! empty($sheet?->store_name) ? $sheet->store_name : 'RDL1';
        }

        $validatedData = Validator::make($data, [
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
        ])->validate();

        $validatedData['store_name'] = $validatedData['store_name'] ?: 'RDL1';
        $validatedData['cc_email'] = null;
        $validatedData['order_date'] = now()->toDateString();

        if (! empty($validatedData['sheet_id']) && ! empty($validatedData['sheet_name'])) {
            $validatedData['cc_email'] = $this->resolveCcEmail($sheet, $validatedData);
        }

        return DB::transaction(function () use ($validatedData) {
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

                $this->autoMatch->applyMatches($existingOrder, $this->autoMatch->match($existingOrder));

                Log::info('Existing order updated from queued sheet import', [
                    'order_no' => $validatedData['order_no'],
                ]);

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

            $this->autoMatch->applyMatches($sheetOrder, $this->autoMatch->match($sheetOrder));

            Log::info('New order created from queued sheet import', [
                'order_no' => $validatedData['order_no'],
                'cc_email' => $validatedData['cc_email'],
            ]);

            return [
                'created' => true,
                'order' => $sheetOrder,
            ];
        });
    }

    private function normalizePayload(array $payload): array
    {
        $cleanAmount = preg_replace('/[^\d.]/', '', (string) ($payload['amount'] ?? ''));

        preg_match('/\d+/', (string) ($payload['quantity'] ?? ''), $matches);
        $cleanQuantity = isset($matches[0]) ? (int) $matches[0] : null;

        return [
            ...$payload,
            'order_no' => trim((string) ($payload['order_no'] ?? '')),
            'delivery_date' => $payload['delivery_date'] ?? null,
            'amount' => $cleanAmount,
            'client_name' => $this->nullIfBlank($payload['client_name'] ?? null),
            'quantity' => $cleanQuantity,
            'phone' => $this->normalizePhone($payload['phone'] ?? null),
            'alt_no' => $this->normalizePhone($payload['alt_no'] ?? null),
            'address' => $this->nullIfBlank($payload['address'] ?? null),
            'product_name' => $this->nullIfBlank($payload['product_name'] ?? null),
            'sheet_id' => $this->nullIfBlank($payload['sheet_id'] ?? null),
            'sheet_name' => $this->nullIfBlank($payload['sheet_name'] ?? null),
            'merchant' => $this->nullIfBlank($payload['merchant'] ?? null),
            'city' => $this->nullIfBlank($payload['city'] ?? null),
            'country' => $this->nullIfBlank($payload['country'] ?? null),
            'status' => $this->nullIfBlank($payload['status'] ?? null),
            'agent' => $this->nullIfBlank($payload['agent'] ?? null),
        ];
    }

    private function resolveCcEmail(?Sheet $sheet, array $validatedData): ?string
    {
        if (! $sheet || empty($sheet->cc_agents)) {
            return null;
        }

        $agentsConfig = json_decode($sheet->cc_agents, true);

        if (! is_array($agentsConfig)) {
            return null;
        }

        $agents = $agentsConfig[$validatedData['sheet_name']] ?? null;

        if (empty($agents) || ! is_array($agents)) {
            return null;
        }

        $agents = array_values(array_filter(array_map('trim', $agents)));

        if (empty($agents)) {
            return null;
        }

        $lastAssigned = SheetOrder::whereNotNull('cc_email')
            ->whereIn('cc_email', $agents)
            ->where('sheet_id', $validatedData['sheet_id'] ?? $sheet->sheet_id)
            ->where('sheet_name', $validatedData['sheet_name'])
            ->latest('id')
            ->value('cc_email');

        if ($lastAssigned && in_array($lastAssigned, $agents, true)) {
            $lastIndex = array_search($lastAssigned, $agents, true);
            $nextIndex = ($lastIndex + 1 < count($agents)) ? $lastIndex + 1 : 0;

            return $agents[$nextIndex];
        }

        return $agents[0];
    }

    private function findExistingOrderForAppScript(array $validatedData): ?SheetOrder
    {
        $orderNo = $this->normalizeIdentityValue($validatedData['order_no'] ?? null);
        $sheetId = $this->normalizeIdentityValue($validatedData['sheet_id'] ?? null);
        $sheetName = $this->normalizeIdentityValue($validatedData['sheet_name'] ?? null);

        if ($orderNo === null) {
            Log::warning('AppScript order received with no order_no - skipping dedup.', [
                'data' => $validatedData,
            ]);

            return null;
        }

        $orderNoMatches = SheetOrder::query()
            ->where('order_no', $orderNo)
            ->orderBy('id')
            ->get();

        if ($orderNoMatches->count() > 1) {
            Log::error('Duplicate order_no detected in database - data integrity violation.', [
                'order_no' => $validatedData['order_no'],
                'matched_ids' => $orderNoMatches->pluck('id')->all(),
            ]);

            throw ValidationException::withMessages([
                'order_no' => "Duplicate order_no [{$validatedData['order_no']}] found in database. Manual intervention required.",
            ]);
        }

        return $orderNoMatches->first(function (SheetOrder $order) use ($sheetId, $sheetName) {
            $existingSheetId = $this->normalizeIdentityValue($order->sheet_id);
            $existingSheetName = $this->normalizeIdentityValue($order->sheet_name);

            if ($sheetId !== null && $existingSheetId !== $sheetId) {
                return false;
            }

            if ($sheetName !== null && $existingSheetName !== $sheetName) {
                return false;
            }

            return true;
        });
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
