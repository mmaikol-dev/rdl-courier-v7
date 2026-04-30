<?php

namespace App\Http\Controllers;

use App\Models\assign;
use App\Models\OrderHistory;
use App\Models\Sheet;
use App\Models\SheetOrder;
use App\Models\User;
use App\Support\CountryAccess;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;
use Illuminate\Http\Request;
use Inertia\Inertia;

class AssignController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        $user = $request->user()?->loadMissing('country');
        $query = CountryAccess::scopeByCountryName(SheetOrder::query(), $user);

        if ($user?->roles === 'merchant') {
            $query->where('merchant', $user->name);
        }
    
        if ($request->filled('country')) {
            $query->whereRaw('LOWER(country) = ?', [mb_strtolower(trim((string) $request->country))]);
        }

        foreach ($request->all() as $key => $value) {
            if (!empty($value) && \Schema::hasColumn('sheet_orders', $key)) {
                if (!in_array($key, ['status', 'merchant', 'cc_email', 'product_name', 'country'])) {
                    $query->where($key, 'like', "%{$value}%");
                }
            }
        }
    
        if ($request->filled('status')) {
            $statuses = is_array($request->status) ? $request->status : explode(',', $request->status);
            $query->where(function($q) use ($statuses) {
                if (in_array('New Orders', $statuses)) {
                    $q->orWhereNull('status')->orWhere('status', '');
                }
                $otherStatuses = array_diff($statuses, ['New Orders']);
                if (!empty($otherStatuses)) {
                    $q->orWhereIn('status', $otherStatuses);
                }
            });
        }
    
        if ($request->filled('merchant') && $user?->roles !== 'merchant') {
            $merchants = is_array($request->merchant) ? $request->merchant : explode(',', $request->merchant);
            $query->whereIn('merchant', $merchants);
        }
    
        if ($request->filled('cc_email')) {
            $ccs = is_array($request->cc_email) ? $request->cc_email : explode(',', $request->cc_email);
            $query->whereIn('cc_email', $ccs);
        }

        // Add product_name filter
        if ($request->filled('product_name')) {
            $query->where('product_name', 'like', "%{$request->product_name}%");
        }
    
        if ($request->filled('from_date') && $request->filled('to_date')) {
            $from = Carbon::parse($request->from_date, 'Africa/Nairobi')->startOfDay();
            $to = Carbon::parse($request->to_date, 'Africa/Nairobi')->endOfDay();
            $query->whereBetween('delivery_date', [$from, $to]);
        }

        if ($request->filled('delivery_date')) {
            $query->whereDate('delivery_date', $request->delivery_date);
        }
    
        $query->orderBy('created_at', 'desc');
    
        $totalOrders = (clone $query)->count();
    
        $orders = $query->paginate(50)->appends($request->all());
    
        $merchantData = CountryAccess::scopeByCountryName(
            SheetOrder::select('merchant', 'sheet_id', 'sheet_name'),
            $user
        )
            ->whereNotNull('merchant')
            ->groupBy('merchant', 'sheet_id', 'sheet_name')
            ->get()
            ->groupBy('merchant')
            ->map(function ($items, $merchant) {
                return [
                    'sheet_id'    => $items->first()->sheet_id,
                    'sheet_names' => $items->pluck('sheet_name')->unique()->values(),
                ];
            });
    
        $merchantUsers = CountryAccess::scopeByCountryName(
            Sheet::query()->whereNotNull('sheet_name')->where('sheet_name', '!=', ''),
            $user,
            'country'
        )
            ->distinct()
            ->orderBy('sheet_name')
            ->pluck('sheet_name')
            ->values();
        $ccUsers = CountryAccess::scopeUsers(
            User::query()->where('roles', 'callcenter1'),
            $user
        )->pluck('name');

        // Get unique product names for filter
        $productNames = CountryAccess::scopeByCountryName(
            SheetOrder::select('product_name'),
            $user
        )
            ->whereNotNull('product_name')
            ->where('product_name', '!=', '')
            ->distinct()
            ->orderBy('product_name')
            ->pluck('product_name');
    
        return inertia('sheetorders/assign', [
            'orders'        => $orders,
            'filters'       => $request->all(),
            'merchantUsers' => $merchantUsers,
            'merchantData'  => $merchantData,
            'ccUsers'       => $ccUsers,
            'productNames'  => $productNames,
            'totalOrders'   => $totalOrders,
        ]);
    }

    /**
     * Bulk reassign orders to CC agents using round-robin distribution
     */
    public function reassign(Request $request)
    {
        $request->validate([
            'order_ids' => 'required|array|min:1',
            'order_ids.*' => 'exists:sheet_orders,id',
            'cc_emails' => 'required|array|min:1',
            'cc_emails.*' => 'required|string',
        ]);
    
        try {
            $user = $request->user()?->loadMissing('country');
            $orders = CountryAccess::scopeByCountryName(
                SheetOrder::query(),
                $user
            )->whereIn('id', $request->order_ids)->get();
            $ccAgents = $request->cc_emails;
            $updatedCount = 0;
            $agentIndex = 0;
    
            foreach ($orders as $sheetorder) {
                // Round-robin: assign to agents in rotation
                $newValue = $ccAgents[$agentIndex % count($ccAgents)];
                $oldValue = $sheetorder->cc_email;
    
                if ($oldValue !== $newValue) {
                    // Log the reassignment for accountability
                    OrderHistory::create([
                        'order_id'  => $sheetorder->id,
                        'user_id'   => auth()->id(),
                        'attribute' => 'cc_email',
                        'old_value' => $oldValue,
                        'new_value' => $newValue,
                    ]);
    
                    // Update the cc_email field
                    $sheetorder->update(['cc_email' => $newValue]);
                    $updatedCount++;
                }
                
                $agentIndex++;
            }

            $agentsList = implode(', ', $ccAgents);
            return back()->with('success', "Successfully reassigned {$updatedCount} order(s) using round-robin to: {$agentsList}");
        } catch (\Exception $e) {
            return back()->with('error', 'Failed to reassign orders: ' . $e->getMessage());
        }
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
    public function show(assign $assign)
    {
        //
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(assign $assign)
    {
        //
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, assign $assign)
    {
        //
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(assign $assign)
    {
        //
    }
}
