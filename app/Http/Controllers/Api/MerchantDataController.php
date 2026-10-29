<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MerchantApiIntegration;
use App\Models\Deduction;
use App\Models\Product;
use App\Models\SheetOrder;
use App\Models\Transfer;
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
            return response()->json(['message' => 'This integration is not permitted to read '.$scope.'.'], 403);
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

        $orders = SheetOrder::query()->where('merchant', $merchant)
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

        $sent = Transfer::query()
            ->join('products as movement_products', 'movement_products.id', '=', 'transfers.product_id')
            ->leftJoin('users as movement_agents', 'movement_agents.id', '=', 'transfers.agent_id')
            ->where(fn ($query) => $query->where('movement_products.merchant', $merchant)->orWhere('movement_products.user_id', $merchantUserId))
            ->when($updatedSince, fn ($query) => $query->where('transfers.updated_at', '>=', $updatedSince))
            ->selectRaw("transfers.id as id, 'sent' as movement_type, transfers.product_id as product_id, movement_products.name as product_name, movement_products.code as product_code, transfers.merchant as merchant, transfers.quantity as quantity, transfers.agent_id as agent_id, movement_agents.name as agent_name, transfers.date as date, transfers.region as region, transfers.store_name as store_name, transfers.from as `from`, transfers.country as country, NULL as reason, transfers.transfer_by as performed_by, NULL as code, transfers.created_at as created_at, transfers.updated_at as updated_at");

        $returned = Deduction::query()
            ->join('products as movement_products', 'movement_products.id', '=', 'deductions.product_id')
            ->leftJoin('users as movement_agents', 'movement_agents.id', '=', 'deductions.agent_id')
            ->where(fn ($query) => $query->where('movement_products.merchant', $merchant)->orWhere('movement_products.user_id', $merchantUserId))
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
