<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MerchantApiIntegration;
use App\Models\Deduction;
use App\Models\IncomingSheetOrder;
use App\Models\Product;
use App\Models\SheetOrder;
use App\Models\Transfer;
use App\Jobs\ProcessIncomingSheetOrder;
use App\Support\MerchantApiFieldCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class MerchantDataController extends Controller
{
    private function integration(Request $request): MerchantApiIntegration
    {
        return $request->attributes->get('merchant_api_integration');
    }

    private function authorizeScope(Request $request, string $scope): ?JsonResponse
    {
        $integration = $this->integration($request);
        $allowedScopes = $integration->merchantUser->merchant_api_scopes;

        if (! in_array($scope, $integration->scopes ?? [], true)
            || (is_array($allowedScopes) && ! in_array($scope, $allowedScopes, true))) {
            return response()->json(['message' => 'This integration is not permitted to use the '.$scope.' scope.'], 403);
        }

        return null;
    }

    private function pageSize(Request $request): int
    {
        $request->validate([
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'updated_since' => ['sometimes', 'date'],
        ]);

        return min(max((int) $request->query('per_page', 50), 1), 100);
    }

    public function storeOrder(Request $request): JsonResponse
    {
        if ($denied = $this->authorizeScope($request, 'orders:write')) {
            return $denied;
        }

        $validated = $request->validate([
            'external_order_id' => ['required', 'string', 'max:255'],
            'order_no' => ['required', 'string', 'max:255'],
            'order_date' => ['nullable', 'date'],
            'amount' => ['required', 'numeric', 'min:0'],
            'quantity' => ['required', 'integer', 'min:1'],
            'product_name' => ['nullable', 'string', 'max:255'],
            'delivery_date' => ['nullable', 'date'],
            'client_name' => ['nullable', 'string', 'max:255'],
            'client_city' => ['nullable', 'string', 'max:255'],
            'address' => ['nullable', 'string', 'max:2000'],
            'city' => ['nullable', 'string', 'max:255'],
            'country' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'alt_no' => ['nullable', 'string', 'max:30'],
            'code' => ['nullable', 'string', 'max:255'],
            'instructions' => ['nullable', 'string', 'max:2000'],
        ]);
        $validated['external_order_id'] = trim($validated['external_order_id']);
        $validated['order_no'] = trim($validated['order_no']);

        /** @var MerchantApiIntegration $integration */
        $integration = $this->integration($request);
        $merchant = $integration->merchantUser;
        $sourceSheetId = 'merchant-api:'.$integration->id;
        $sourceSheetName = 'Merchant API';
        $sourceHash = $this->incomingOrderSourceHash($integration, $validated['external_order_id']);
        $requestHash = $this->incomingOrderPayloadHash($validated);

        $payload = [
            'external_order_id' => $validated['external_order_id'],
            'order_no' => trim($validated['order_no']),
            'order_date' => $validated['order_date'] ?? now()->toDateString(),
            'amount' => $validated['amount'],
            'quantity' => $validated['quantity'],
            'product_name' => $validated['product_name'] ?? null,
            'delivery_date' => $validated['delivery_date'] ?? null,
            'client_name' => $validated['client_name'] ?? null,
            'client_city' => $validated['client_city'] ?? null,
            'address' => $validated['address'] ?? null,
            'city' => $validated['city'] ?? null,
            'country' => $validated['country'] ?? $merchant->country?->name,
            'phone' => $validated['phone'] ?? null,
            'alt_no' => $validated['alt_no'] ?? null,
            'code' => $validated['code'] ?? null,
            'instructions' => $validated['instructions'] ?? null,
            // Merchant ownership and lifecycle status are controlled by this API.
            'merchant' => $merchant->name,
            'store_name' => $merchant->store_name ?: 'RDL1',
            // Legacy sheet_orders schema requires a non-null source identity.
            'sheet_id' => $sourceSheetId,
            'sheet_name' => $sourceSheetName,
            'status' => null,
            '_merchant_api_request_hash' => $requestHash,
        ];

        $incoming = IncomingSheetOrder::firstOrCreate(
            ['source_hash' => $sourceHash],
            [
                'order_no' => $payload['order_no'],
                'sheet_id' => $sourceSheetId,
                'sheet_name' => $sourceSheetName,
                'payload' => $payload,
                'status' => 'pending',
                'available_at' => now(),
            ],
        );

        if (! $incoming->wasRecentlyCreated) {
            $existingRequestHash = data_get($incoming->payload, '_merchant_api_request_hash');
            if (! hash_equals((string) $existingRequestHash, $requestHash)) {
                return response()->json([
                    'message' => 'This external_order_id has already been used with a different order payload.',
                ], 409);
            }

            if ($incoming->status !== 'processed') {
                $incoming->forceFill([
                    'order_no' => $payload['order_no'],
                    'sheet_id' => $sourceSheetId,
                    'sheet_name' => $sourceSheetName,
                    'payload' => $payload,
                ])->save();
            }

            if (in_array($incoming->status, ['failed', 'skipped'], true)) {
                $incoming->forceFill([
                    'status' => 'pending',
                    'error_message' => null,
                    'available_at' => now(),
                ])->save();

                ProcessIncomingSheetOrder::dispatch($incoming->id);

                return $this->acceptedIncomingOrder($incoming->fresh(), true, 202);
            }

            $statusCode = $incoming->status === 'processed' ? 200 : 202;

            return $this->acceptedIncomingOrder($incoming, true, $statusCode);
        }

        ProcessIncomingSheetOrder::dispatch($incoming->id);

        return $this->acceptedIncomingOrder($incoming, false, 202);
    }

    public function incomingOrderStatus(Request $request, string $externalOrderId): JsonResponse
    {
        if ($denied = $this->authorizeScope($request, 'orders:write')) {
            return $denied;
        }

        $integration = $this->integration($request);
        $sourceHash = $this->incomingOrderSourceHash($integration, $externalOrderId);
        $incoming = IncomingSheetOrder::query()->where('source_hash', $sourceHash)->firstOrFail();

        return response()->json([
            'external_order_id' => $externalOrderId,
            'order_no' => $incoming->order_no,
            'status' => $incoming->status,
            'attempts' => $incoming->attempts,
            'error_message' => $incoming->status === 'failed' ? $incoming->error_message : null,
            'processed_at' => $incoming->processed_at?->toIso8601String(),
        ]);
    }

    private function acceptedIncomingOrder(IncomingSheetOrder $incoming, bool $duplicate, int $statusCode): JsonResponse
    {
        $externalOrderId = data_get($incoming->payload, 'external_order_id');
        return response()->json([
            'accepted' => true,
            'duplicate' => $duplicate,
            'external_order_id' => $externalOrderId,
            'order_no' => $incoming->order_no,
            'status' => $incoming->status,
            'request_id' => $incoming->id,
        ], $statusCode);
    }

    private function incomingOrderSourceHash(MerchantApiIntegration $integration, string $externalOrderId): string
    {
        return hash('sha256', json_encode([
            'source' => 'merchant-api',
            'integration_id' => $integration->id,
            'external_order_id' => trim($externalOrderId),
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }

    private function incomingOrderPayloadHash(array $payload): string
    {
        ksort($payload);

        return hash('sha256', json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }

    public function orders(Request $request): JsonResponse
    {
        if ($denied = $this->authorizeScope($request, 'orders:read')) return $denied;

        $merchant = $this->integration($request)->merchantUser->name;
        $availableColumns = Schema::getColumnListing('sheet_orders');
        $orderColumns = array_values(array_intersect([
            'id', 'order_no', 'order_date', 'amount', 'quantity', 'product_name', 'delivery_date',
            'client_name', 'client_city', 'address', 'city', 'country', 'phone', 'alt_no', 'status',
            'code', 'confirmed', 'created_at', 'updated_at',
        ], $availableColumns));
        $orderColumns[] = 'call_count';

        $orders = SheetOrder::query()->withCount([
            'histories as call_count' => fn ($historyQuery) => $historyQuery
                ->where('attribute', 'instructions'),
        ])->where('merchant', $merchant)
            ->when($request->filled('updated_since'), fn ($query) => $query->where('updated_at', '>=', $request->date('updated_since')))
            ->orderBy('id')->paginate($this->pageSize($request), $orderColumns);

        return response()->json($orders);
    }

    public function products(Request $request): JsonResponse
    {
        if ($denied = $this->authorizeScope($request, 'products:read')) return $denied;

        $integration = $this->integration($request);
        $merchant = $integration->merchantUser->name;
        $products = Product::query()->where(function ($query) use ($merchant, $integration): void {
            $query->where('merchant', $merchant)
                ->orWhere('user_id', $integration->merchant_user_id);
        })
            ->when($request->filled('updated_since'), fn ($query) => $query->where('updated_at', '>=', $request->date('updated_since')))
            ->orderBy('id')->paginate($this->pageSize($request), [
                'id', 'name', 'code', 'slug', 'quantity', 'selling_price', 'tax', 'tax_type',
                'category_id', 'store_name', 'country', 'unit_id', 'updated_at',
            ]);

        return response()->json($products);
    }

    public function transfers(Request $request): JsonResponse
    {
        if ($denied = $this->authorizeScope($request, 'transfers:read')) return $denied;

        $integration = $this->integration($request);
        $merchant = $integration->merchantUser->name;
        $merchantUserId = $integration->merchant_user_id;
        $perPage = $this->pageSize($request);
        $updatedSince = $request->date('updated_since');
        $request->validate(['agent_id' => ['sometimes', 'integer', 'min:1']]);
        $agentId = $request->query('agent_id');

        if ($request->query('view') !== 'movements') {
            $agentDeductions = DB::table('deductions as d')
                ->join('products as dp', 'dp.id', '=', 'd.product_id')
                ->where(fn ($query) => $query->where('dp.merchant', $merchant)->orWhere('dp.user_id', $merchantUserId))
                ->selectRaw('d.agent_id, SUM(d.quantity) as total_deducted')
                ->groupBy('d.agent_id');

            $agents = DB::table('transfers as t')
                ->join('products as p', 'p.id', '=', 't.product_id')
                ->join('users as a', 'a.id', '=', 't.agent_id')
                ->leftJoinSub($agentDeductions, 'agent_deductions', fn ($join) => $join->on('agent_deductions.agent_id', '=', 'a.id'))
                ->where(fn ($query) => $query->where('p.merchant', $merchant)->orWhere('p.user_id', $merchantUserId))
                ->where('a.roles', 'agent')
                ->when($agentId, fn ($query) => $query->where('a.id', $agentId))
                ->select('a.id', 'a.name', 'a.store_name', 'a.store_phone')
                ->selectRaw('COUNT(t.id) as transfer_count, SUM(t.quantity) as total_transferred, COALESCE(agent_deductions.total_deducted, 0) as total_deducted, MAX(t.created_at) as last_transfer_at')
                ->groupBy('a.id', 'a.name', 'a.store_name', 'a.store_phone', 'agent_deductions.total_deducted')
                ->orderBy('a.name')
                ->paginate($perPage);

            $agentIds = $agents->getCollection()->pluck('id')->all();
            $productDeductions = DB::table('deductions as d')
                ->join('products as dp', 'dp.id', '=', 'd.product_id')
                ->where(fn ($query) => $query->where('dp.merchant', $merchant)->orWhere('dp.user_id', $merchantUserId))
                ->selectRaw('d.agent_id, d.product_id, SUM(d.quantity) as total_deducted')
                ->groupBy('d.agent_id', 'd.product_id');

            $productsByAgent = DB::table('transfers as t')
                ->join('products as p', 'p.id', '=', 't.product_id')
                ->leftJoinSub($productDeductions, 'product_deductions', function ($join): void {
                    $join->on('product_deductions.agent_id', '=', 't.agent_id')
                        ->on('product_deductions.product_id', '=', 't.product_id');
                })
                ->where(fn ($query) => $query->where('p.merchant', $merchant)->orWhere('p.user_id', $merchantUserId))
                ->whereIn('t.agent_id', $agentIds ?: [0])
                ->select('t.agent_id', 'p.id as product_id', 'p.name as product_name', 'p.code as product_code', 'p.merchant')
                ->selectRaw('COUNT(t.id) as transfer_count, SUM(t.quantity) as total_quantity, COALESCE(product_deductions.total_deducted, 0) as total_deducted, MIN(t.created_at) as first_transfer_date, MAX(t.created_at) as last_transfer_date')
                ->groupBy('t.agent_id', 'p.id', 'p.name', 'p.code', 'p.merchant', 'product_deductions.total_deducted')
                ->orderByDesc('last_transfer_date')
                ->get()
                ->groupBy('agent_id');

            $agents->getCollection()->transform(function ($agent) use ($productsByAgent): object {
                $agent->remaining_quantity = (int) $agent->total_transferred - (int) $agent->total_deducted;
                $agent->products = $productsByAgent->get($agent->id, collect())->map(function ($product): object {
                    $product->remaining_quantity = (int) $product->total_quantity - (int) $product->total_deducted;
                    return $product;
                })->values();
                return $agent;
            });

            return response()->json($agents);
        }

        $sent = Transfer::query()
            ->join('products as movement_products', 'movement_products.id', '=', 'transfers.product_id')
            ->leftJoin('users as movement_agents', 'movement_agents.id', '=', 'transfers.agent_id')
            ->where(fn ($query) => $query->where('movement_products.merchant', $merchant)->orWhere('movement_products.user_id', $merchantUserId))
            ->when($agentId, fn ($query) => $query->where('transfers.agent_id', $agentId))
            ->when($updatedSince, fn ($query) => $query->where('transfers.updated_at', '>=', $updatedSince))
            ->selectRaw("transfers.id as id, 'sent' as movement_type, transfers.product_id as product_id, movement_products.name as product_name, movement_products.code as product_code, transfers.merchant as merchant, transfers.quantity as quantity, transfers.agent_id as agent_id, movement_agents.name as agent_name, transfers.date as date, transfers.region as region, transfers.store_name as store_name, transfers.from as `from`, transfers.country as country, NULL as reason, transfers.transfer_by as performed_by, NULL as code, transfers.created_at as created_at, transfers.updated_at as updated_at");

        $returned = Deduction::query()
            ->join('products as movement_products', 'movement_products.id', '=', 'deductions.product_id')
            ->leftJoin('users as movement_agents', 'movement_agents.id', '=', 'deductions.agent_id')
            ->where(fn ($query) => $query->where('movement_products.merchant', $merchant)->orWhere('movement_products.user_id', $merchantUserId))
            ->when($agentId, fn ($query) => $query->where('deductions.agent_id', $agentId))
            ->when($updatedSince, fn ($query) => $query->where('deductions.updated_at', '>=', $updatedSince))
            ->selectRaw("deductions.id as id, 'returned' as movement_type, deductions.product_id as product_id, movement_products.name as product_name, movement_products.code as product_code, movement_products.merchant as merchant, deductions.quantity as quantity, deductions.agent_id as agent_id, movement_agents.name as agent_name, DATE(deductions.created_at) as date, NULL as region, NULL as store_name, NULL as `from`, deductions.country as country, deductions.reason as reason, deductions.deducted_by as performed_by, deductions.code as code, deductions.created_at as created_at, deductions.updated_at as updated_at");

        $fields = array_values(array_intersect(
            $integration->transfer_fields ?? MerchantApiFieldCatalog::TRANSFER_FIELDS,
            MerchantApiFieldCatalog::TRANSFER_FIELDS
        ));
        // Always include the movement kind so the merchant can distinguish a send from a return.
        if (! in_array('movement_type', $fields, true)) {
            array_unshift($fields, 'movement_type');
        }

        $movements = DB::query()
            ->fromSub($sent->unionAll($returned), 'merchant_transfer_movements')
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate($perPage, $fields);

        return response()->json($movements);
    }
}
