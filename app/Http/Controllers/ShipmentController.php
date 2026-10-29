<?php

namespace App\Http\Controllers;

use App\Models\InventoryLog;
use App\Models\Product;
use App\Models\Shipment;
use App\Models\ShipmentItem;
use App\Support\CountryAccess;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;

class ShipmentController extends Controller
{
    private function ensureInventoryUser(Request $request): void
    {
        abort_if(strtolower(trim((string) $request->user()?->roles)) === 'merchant', 403);
    }

    /** @return array<int, array{code: string, name: string, country: string}> */
    private function availableWarehouses(Request $request): array
    {
        $user = $request->user()->loadMissing('country');
        $warehouses = config('warehouses', []);

        if (CountryAccess::hasGlobalAccess($user)) {
            $selectedCountry = trim((string) $request->session()->get('selected_country'));

            if ($selectedCountry !== '') {
                $warehouses = array_values(array_filter(
                    $warehouses,
                    fn (array $warehouse): bool => mb_strtolower($warehouse['country']) === mb_strtolower($selectedCountry),
                ));
            }

            return $warehouses;
        }

        $country = mb_strtolower(trim((string) CountryAccess::userCountryName($user)));

        return array_values(array_filter(
            $warehouses,
            fn (array $warehouse): bool => mb_strtolower($warehouse['country']) === $country,
        ));
    }

    private function shipmentsForUser(Request $request): Builder
    {
        $this->ensureInventoryUser($request);
        $user = $request->user()->loadMissing('country');

        return CountryAccess::scopeByCountryName(Shipment::query(), $user, 'country');
    }

    public function index(Request $request)
    {
        $query = $this->shipmentsForUser($request);
        $stage = strtoupper(trim((string) $request->query('stage', 'ALL')));

        if ($stage === 'RECEIVING') {
            $query->whereIn('status', [Shipment::ARRIVED, Shipment::RECEIVING]);
        } elseif (in_array($stage, [Shipment::EXPECTED, Shipment::RECEIVED, Shipment::DISCREPANCY], true)) {
            $query->where('status', $stage);
        } else {
            $stage = 'ALL';
        }

        $base = $this->shipmentsForUser($request);
        $openIds = (clone $base)->whereIn('status', [Shipment::EXPECTED, Shipment::ARRIVED, Shipment::RECEIVING])->select('id');
        $expected = (clone $base)->where('status', Shipment::EXPECTED);
        $dock = (clone $base)->whereIn('status', [Shipment::ARRIVED, Shipment::RECEIVING]);
        $completedIds = (clone $base)->whereIn('status', [Shipment::RECEIVED, Shipment::DISCREPANCY])->select('id');
        $upcoming = (clone $base)
            ->where('status', Shipment::EXPECTED)
            ->whereBetween('expected_on', [today()->toDateString(), today()->addDays(7)->toDateString()]);

        return Inertia::render('shipments/index', [
            'shipments' => Inertia::defer(fn () => $query
                ->with('items:id,shipment_id,product_name,expected_quantity,received_quantity')
                ->withSum('items as expected_units', 'expected_quantity')
                ->withSum('items as received_units', 'received_quantity')
                ->latest('created_at')
                ->paginate(15)
                ->withQueryString()),
            'stage' => $stage,
            'stats' => Inertia::defer(fn () => [
                'expected_count' => (clone $expected)->count(),
                'expected_units' => (int) ShipmentItem::query()->whereIn('shipment_id', $openIds)->sum('expected_quantity'),
                'arriving_soon' => (clone $upcoming)->count(),
                'at_dock' => (clone $dock)->count(),
                'received_count' => (clone $base)->whereIn('status', [Shipment::RECEIVED, Shipment::DISCREPANCY])->count(),
                'units_received' => (int) ShipmentItem::query()->whereIn('shipment_id', $completedIds)->sum('received_quantity'),
                'discrepancies' => (clone $base)->where('status', Shipment::DISCREPANCY)->count(),
            ]),
        ]);
    }

    public function create(Request $request)
    {
        $this->ensureInventoryUser($request);
        $warehouses = $this->availableWarehouses($request);
        $userCountry = mb_strtolower(trim((string) CountryAccess::userCountryName($request->user()->loadMissing('country'))));
        $defaultWarehouse = collect($warehouses)->first(
            fn (array $warehouse): bool => mb_strtolower($warehouse['country']) === $userCountry,
        ) ?? ($warehouses[0] ?? null);

        return Inertia::render('shipments/create', [
            'warehouses' => $warehouses,
            'defaultWarehouseCode' => $defaultWarehouse['code'] ?? null,
        ]);
    }

    public function productOptions(Request $request)
    {
        $this->ensureInventoryUser($request);
        $request->validate([
            'warehouse_code' => 'required|string|max:16',
            'search' => 'nullable|string|max:120',
        ]);

        $warehouse = collect($this->availableWarehouses($request))
            ->firstWhere('code', $request->string('warehouse_code')->toString());

        abort_unless($warehouse, 403, 'This warehouse is not available to your account.');

        $products = Product::query()
            ->whereRaw('LOWER(TRIM(country)) = ?', [mb_strtolower($warehouse['country'])])
            ->when($request->filled('search'), function (Builder $query) use ($request): void {
                $search = mb_strtolower(trim($request->string('search')->toString()));
                $query->where(function (Builder $nested) use ($search): void {
                    $nested->whereRaw('LOWER(name) LIKE ?', ['%'.$search.'%'])
                        ->orWhereRaw('LOWER(code) LIKE ?', ['%'.$search.'%']);
                });
            })
            ->orderBy('name')
            ->limit(100)
            ->get(['id', 'name', 'code', 'quantity']);

        return response()->json(['products' => $products]);
    }

    public function store(Request $request)
    {
        $this->ensureInventoryUser($request);
        $validated = $request->validate([
            'supplier' => 'required|string|max:255',
            'supplier_reference' => 'nullable|string|max:255',
            'carrier' => 'nullable|string|max:255',
            'tracking_number' => 'nullable|string|max:255',
            'expected_on' => 'nullable|date',
            'cartons' => 'nullable|integer|min:0|max:100000',
            'warehouse_code' => 'required|string|max:16',
            'note' => 'nullable|string|max:5000',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|integer|distinct|exists:products,id',
            'items.*.expected_quantity' => 'required|integer|min:1|max:10000000',
        ]);

        $warehouse = collect($this->availableWarehouses($request))
            ->firstWhere('code', $validated['warehouse_code']);

        if (! $warehouse) {
            throw ValidationException::withMessages([
                'warehouse_code' => 'Select a warehouse available to your account.',
            ]);
        }

        $productIds = collect($validated['items'])->pluck('product_id')->map(fn ($id): int => (int) $id);
        $products = Product::query()
            ->whereIn('id', $productIds)
            ->whereRaw('LOWER(TRIM(country)) = ?', [mb_strtolower($warehouse['country'])])
            ->get()
            ->keyBy('id');

        if ($products->count() !== $productIds->count()) {
            throw ValidationException::withMessages([
                'items' => 'Every shipment product must belong to the receiving warehouse country.',
            ]);
        }

        $shipment = DB::transaction(function () use ($validated, $warehouse, $products, $request): Shipment {
            $shipment = Shipment::create([
                'supplier' => $validated['supplier'],
                'supplier_reference' => $validated['supplier_reference'] ?? null,
                'carrier' => $validated['carrier'] ?? null,
                'tracking_number' => $validated['tracking_number'] ?? null,
                'expected_on' => $validated['expected_on'] ?? null,
                'cartons' => $validated['cartons'] ?? null,
                'warehouse_code' => $warehouse['code'],
                'warehouse_name' => $warehouse['name'],
                'country' => $warehouse['country'],
                'status' => Shipment::EXPECTED,
                'note' => $validated['note'] ?? null,
                'created_by' => $request->user()->id,
            ]);

            $shipment->update([
                'shipment_number' => 'IN-'.$warehouse['code'].'-'.str_pad((string) $shipment->id, 5, '0', STR_PAD_LEFT),
            ]);

            foreach ($validated['items'] as $item) {
                $product = $products->get((int) $item['product_id']);

                $shipment->items()->create([
                    'product_id' => $product->id,
                    'product_name' => $product->name,
                    'product_code' => $product->code,
                    'expected_quantity' => $item['expected_quantity'],
                ]);
            }

            return $shipment;
        });

        return redirect()->route('shipments.show', $shipment)->with('success', 'Shipment created and added to inbound stock.');
    }

    public function show(Request $request, int $shipment)
    {
        $shipment = $this->shipmentsForUser($request)
            ->with(['items' => fn ($query) => $query->orderBy('id')])
            ->findOrFail($shipment);

        return Inertia::render('shipments/show', ['shipment' => $shipment]);
    }

    public function markArrived(Request $request, int $shipment)
    {
        $shipment = $this->shipmentsForUser($request)->findOrFail($shipment);

        if ($shipment->status !== Shipment::EXPECTED) {
            return back()->with('error', 'Only expected shipments can be marked as arrived.');
        }

        $shipment->forceFill([
            'status' => Shipment::ARRIVED,
            'arrived_at' => now(),
        ])->save();

        return back()->with('success', 'Shipment marked as arrived. You can now count the products.');
    }

    public function saveReceipt(Request $request, int $shipment)
    {
        $this->ensureInventoryUser($request);
        $validated = $request->validate([
            'items' => 'required|array|min:1',
            'items.*.id' => 'required|integer|distinct',
            'items.*.received_quantity' => 'required|integer|min:0|max:10000000',
            'complete_receipt' => 'sometimes|boolean',
        ]);

        DB::transaction(function () use ($request, $shipment, $validated): void {
            $lockedShipment = $this->shipmentsForUser($request)
                ->whereKey($shipment)
                ->lockForUpdate()
                ->firstOrFail();

            if (in_array($lockedShipment->status, [Shipment::RECEIVED, Shipment::DISCREPANCY], true)) {
                throw ValidationException::withMessages([
                    'items' => 'This shipment has already been received.',
                ]);
            }

            if (! in_array($lockedShipment->status, [Shipment::ARRIVED, Shipment::RECEIVING], true)) {
                throw ValidationException::withMessages([
                    'items' => 'Mark the shipment as arrived before recording receipt counts.',
                ]);
            }

            $shipmentItems = ShipmentItem::query()
                ->where('shipment_id', $lockedShipment->id)
                ->lockForUpdate()
                ->get()
                ->keyBy('id');
            $counts = collect($validated['items'])->keyBy(fn (array $item): int => (int) $item['id']);

            if ($counts->count() !== $shipmentItems->count() || $counts->keys()->diff($shipmentItems->keys())->isNotEmpty()) {
                throw ValidationException::withMessages([
                    'items' => 'The receipt must include a count for every shipment product.',
                ]);
            }

            foreach ($shipmentItems as $itemId => $shipmentItem) {
                $shipmentItem->update([
                    'received_quantity' => (int) $counts->get($itemId)['received_quantity'],
                    'receipt_counted' => true,
                ]);
            }

            if (! ($validated['complete_receipt'] ?? false)) {
                $lockedShipment->forceFill(['status' => Shipment::RECEIVING])->save();

                return;
            }

            $hasDiscrepancy = false;

            foreach ($shipmentItems as $shipmentItem) {
                if ((int) $shipmentItem->received_quantity !== (int) $shipmentItem->expected_quantity) {
                    $hasDiscrepancy = true;
                }

                $product = Product::query()->whereKey($shipmentItem->product_id)->lockForUpdate()->firstOrFail();

                if (mb_strtolower(trim((string) $product->country)) !== mb_strtolower($lockedShipment->country)) {
                    throw ValidationException::withMessages([
                        'items' => "{$shipmentItem->product_name} no longer belongs to the shipment's warehouse country.",
                    ]);
                }

                $quantityAdded = (int) $shipmentItem->received_quantity;

                if ($quantityAdded === 0) {
                    continue;
                }

                $previousQuantity = (int) $product->quantity;
                $newQuantity = $previousQuantity + $quantityAdded;
                $product->update(['quantity' => $newQuantity]);

                InventoryLog::create([
                    'product_name' => $product->name,
                    'product_code' => $product->code,
                    'quantity_added' => $quantityAdded,
                    'remaining_qnty' => $newQuantity,
                    'added_by' => $request->user()->name,
                    'product_unit_id' => $product->unit_id,
                    'date_added' => now(),
                ]);
            }

            $lockedShipment->forceFill([
                'status' => $hasDiscrepancy ? Shipment::DISCREPANCY : Shipment::RECEIVED,
                'received_by' => $request->user()->id,
                'received_at' => now(),
            ])->save();
        });

        return back()->with('success', ($validated['complete_receipt'] ?? false)
            ? 'Receipt completed. Counted units have been added to available stock.'
            : 'Receipt counts saved. Units remain inbound until you complete the receipt.');
    }
}
