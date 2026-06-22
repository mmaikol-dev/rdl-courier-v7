<?php

namespace App\Http\Controllers;

use App\Models\Transfer;
use App\Models\Product;
use App\Models\User;
use App\Models\Deduction;
use App\Support\CountryAccess;
use Illuminate\Support\Facades\Log;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class TransferController extends Controller
{
    private function resolveCountryOrFail(?\App\Models\User $user): string
    {
        $country = CountryAccess::resolveCountryNameForWrite($user, null);

        abort_if(! $country, 403, 'No country is assigned to this user.');

        return $country;
    }

    public function index(Request $request)
    {
        $view = $request->get('view', 'grouped');

        if ($view === 'grouped') {
            return $this->groupedView($request);
        }

        return $this->detailedView($request);
    }

    private function groupedView(Request $request)
    {
        $user = $request->user()?->loadMissing('country');

        $query = CountryAccess::scopeByCountryName(Transfer::query(), $user)
            ->select(
                'product_id',
                'agent_id',
                DB::raw('COUNT(*) as transfer_count'),
                DB::raw('SUM(quantity) as total_quantity'),
                DB::raw('MAX(created_at) as last_transfer_date'),
                DB::raw('MIN(created_at) as first_transfer_date')
            )
            // ✅ CHANGED: was 'product:id,name,unit_id' — now uses merchant column
            ->with(['product:id,name,merchant', 'agent:id,name'])
            ->groupBy('product_id', 'agent_id');

        if ($request->product_id) {
            $query->where('product_id', $request->product_id);
        }

        if ($request->agent_id) {
            $query->where('agent_id', $request->agent_id);
        }

        if ($request->date) {
            $query->whereDate('created_at', $request->date);
        }

        $groupedTransfers = $query->latest('last_transfer_date')->paginate(20);

        // ✅ CHANGED: was ->select('id', 'name', 'unit_id') — now uses merchant column
        $products = CountryAccess::scopeProducts(Product::query(), $user)
            ->select('id', 'name', 'merchant')
            ->get();

        $agents = CountryAccess::scopeUsers(
            User::query()->where('roles', 'agent'),
            $user
        )
            ->select('id', 'name')
            ->orderBy('name')
            ->get();

        return inertia('products/transfer', [
            'groupedTransfers' => $groupedTransfers,
            'products' => $products,
            'agents' => $agents,
            'view' => 'grouped'
        ]);
    }

    private function detailedView(Request $request)
    {
        $user = $request->user()?->loadMissing('country');
        $query = CountryAccess::scopeByCountryName(Transfer::query(), $user)
            ->with(['product', 'agent']);

        if ($request->product_id) {
            $query->where('product_id', $request->product_id);
        }

        if ($request->agent_id) {
            $query->where('agent_id', $request->agent_id);
        }

        if ($request->date) {
            $query->whereDate('created_at', $request->date);
        }

        $transfers = $query->latest()->paginate(20);

        // ✅ CHANGED: was ->select('id', 'name', 'unit_id') — now uses merchant column
        $products = CountryAccess::scopeProducts(Product::query(), $user)
            ->select('id', 'name', 'merchant')
            ->get();

        $agents = CountryAccess::scopeUsers(
            User::query()->where('roles', 'agent'),
            $user
        )
            ->select('id', 'name')
            ->orderBy('name')
            ->get();

        return inertia('products/transfer', [
            'transfers' => $transfers,
            'products' => $products,
            'agents' => $agents,
            'view' => 'detailed'
        ]);
    }

    public function show(Request $request, $productId, $agentId)
    {
        $user = $request->user()?->loadMissing('country');

        $query = CountryAccess::scopeByCountryName(Transfer::query(), $user)
            ->where('product_id', $productId)
            ->where('agent_id', $agentId)
            ->with(['product', 'agent', 'unit']);

        if ($request->date) {
            $query->whereDate('created_at', $request->date);
        }

        $transfers = $query->latest()->paginate(20);

        // Get deductions for this product-agent combination
        $deductions = CountryAccess::scopeByCountryName(Deduction::query(), $user)
            ->where('product_id', $productId)
            ->where('agent_id', $agentId)
            ->latest()
            ->get();

        // Calculate totals
        $totalTransferred = CountryAccess::scopeByCountryName(Transfer::query(), $user)
            ->where('product_id', $productId)
            ->where('agent_id', $agentId)
            ->sum('quantity');

        $totalDeducted = CountryAccess::scopeByCountryName(Deduction::query(), $user)
            ->where('product_id', $productId)
            ->where('agent_id', $agentId)
            ->sum('quantity');

        $remainingQuantity = $totalTransferred - $totalDeducted;

        return inertia('products/transferdetails', [
            'transfers' => $transfers,
            'deductions' => $deductions,
            'productId' => $productId,
            'agentId' => $agentId,
            'totalTransferred' => $totalTransferred,
            'totalDeducted' => $totalDeducted,
            'remainingQuantity' => $remainingQuantity,
        ]);
    }

    public function store(Request $request)
    {
        $user = $request->user()?->loadMissing('country');
        $country = $this->resolveCountryOrFail($user);

        $validated = $request->validate([
            'region' => 'required|string',
            'from' => 'required|string',
            'transfers' => 'required|array|min:1',
            'transfers.*.product_id' => 'required|exists:products,id',
            'transfers.*.quantity' => 'required|integer|min:1',
            'transfers.*.agent_id' => 'required|exists:users,id',
        ]);

        DB::transaction(function () use ($validated, $user, $country) {
            foreach ($validated['transfers'] as $transferData) {
                $product = CountryAccess::scopeProducts(
                    Product::query(),
                    $user
                )->findOrFail($transferData['product_id']);

                $agent = CountryAccess::scopeUsers(
                    User::query()->where('roles', 'agent'),
                    $user
                )->findOrFail($transferData['agent_id']);

                Transfer::create([
                    'product_id' => $product->id,
                    'merchant' => $product->merchant,
                    'quantity' => $transferData['quantity'],
                    'agent_id' => $agent->id,
                    'date' => now()->toDateString(),
                    'region' => $validated['region'],
                    'store_name' => $product->name,
                    'from' => $validated['from'],
                    'country' => $country,
                    'transfer_by' => auth()->user()->name ?? 'System',
                ]);
            }
        });

        return redirect()->back()->with('success', 'Transfers created successfully!');
    }

    public function storeDeduction(Request $request, $productId, $agentId)
    {
        $user = $request->user()?->loadMissing('country');
        $country = $this->resolveCountryOrFail($user);

        $validated = $request->validate([
            'code' => 'required|string|unique:deductions,code',
            'quantity' => 'required|integer|min:1',
            'reason' => 'nullable|string|max:500',
        ]);

        CountryAccess::scopeProducts(Product::query(), $user)->findOrFail($productId);
        CountryAccess::scopeUsers(
            User::query()->where('roles', 'agent'),
            $user
        )->findOrFail($agentId);

        // Calculate current remaining quantity
        $totalTransferred = CountryAccess::scopeByCountryName(Transfer::query(), $user)
            ->where('product_id', $productId)
            ->where('agent_id', $agentId)
            ->sum('quantity');

        $totalDeducted = CountryAccess::scopeByCountryName(Deduction::query(), $user)
            ->where('product_id', $productId)
            ->where('agent_id', $agentId)
            ->sum('quantity');

        $remainingQuantity = $totalTransferred - $totalDeducted;

        // Check if deduction quantity exceeds remaining quantity
        if ($validated['quantity'] > $remainingQuantity) {
            return redirect()->back()->withErrors([
                'quantity' => 'Deduction quantity cannot exceed remaining quantity (' . $remainingQuantity . ' units)'
            ]);
        }

        Deduction::create([
            'code' => $validated['code'],
            'product_id' => $productId,
            'agent_id' => $agentId,
            'quantity' => $validated['quantity'],
            'reason' => $validated['reason'],
            'deducted_by' => auth()->user()->name ?? 'System',
            'country' => $country,
        ]);

        return redirect()->back()->with('success', 'Deduction recorded successfully!');
    }

    public function destroyDeduction($id)
    {
        $deduction = CountryAccess::scopeByCountryName(
            Deduction::query(),
            request()->user()?->loadMissing('country')
        )->findOrFail($id);
        $deduction->delete();

        return redirect()->back()->with('success', 'Deduction deleted successfully!');
    }
}