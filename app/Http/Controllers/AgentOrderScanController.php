<?php

namespace App\Http\Controllers;

use App\Models\OrderHistory;
use App\Models\SheetOrder;
use App\Models\User;
use App\Support\CountryAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class AgentOrderScanController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user()->loadMissing('country');

        $agents = CountryAccess::scopeUsers(
            User::query()->whereRaw('LOWER(TRIM(roles)) = ?', ['agent'])->select(['id', 'name']),
            $user
        )->orderBy('name')->get();

        $recentScans = DB::table('agent_assignment_scans')
            ->join('sheet_orders', 'sheet_orders.id', '=', 'agent_assignment_scans.order_id')
            ->leftJoin('users as agents', 'agents.id', '=', 'agent_assignment_scans.agent_id')
            ->leftJoin('users as scanners', 'scanners.id', '=', 'agent_assignment_scans.scanned_by')
            ->whereIn('sheet_orders.id', CountryAccess::scopeByCountryName(SheetOrder::query(), $user)->select('id'))
            ->orderByDesc('agent_assignment_scans.scanned_at')
            ->limit(20)
            ->get([
                'agent_assignment_scans.id',
                'agent_assignment_scans.order_no',
                'agent_assignment_scans.scan_type',
                'agent_assignment_scans.scanned_at',
                'agents.name as agent_name',
                'scanners.name as scanned_by',
            ]);

        return Inertia::render('agent-order-scans/index', [
            'agents' => $agents,
            'recentScans' => $recentScans,
        ]);
    }

    public function store(Request $request)
    {
        $user = $request->user()->loadMissing('country');
        $validated = $request->validate([
            'order_no' => ['required', 'string', 'max:255'],
            'agent_id' => ['required', 'integer'],
            'scan_type' => ['required', 'in:in,out'],
        ]);

        $agent = CountryAccess::scopeUsers(
            User::query()->whereRaw('LOWER(TRIM(roles)) = ?', ['agent']),
            $user
        )->whereKey($validated['agent_id'])->first();

        if (! $agent) {
            return back()->withErrors(['agent_id' => 'Select an agent in your assigned country.']);
        }

        $order = CountryAccess::scopeByCountryName(SheetOrder::query(), $user)
            ->where('order_no', $validated['order_no'])
            ->first();

        if (! $order) {
            return back()->withErrors(['order_no' => "Order not found: {$validated['order_no']}"]);
        }

        $newStatus = $validated['scan_type'] === 'out' ? 'Dispatched' : 'Returned';

        DB::transaction(function () use ($order, $agent, $validated, $user, $newStatus): void {
            $order = SheetOrder::query()->whereKey($order->getKey())->lockForUpdate()->firstOrFail();
            $now = now();
            $deliveryDate = $now->toDateString();
            $oldAgent = $order->getRawOriginal('agent');
            $oldAgentId = $order->getRawOriginal('agent_id');
            $oldStatus = $order->getRawOriginal('status');
            $oldDeliveryDate = $order->getRawOriginal('delivery_date');
            $oldClearance = $order->getRawOriginal('clearance_status');
            $order->update([
                'agent' => $agent->name,
                'agent_id' => $agent->id,
                'assigned_at' => $now,
                'delivery_date' => $deliveryDate,
                'clearance_status' => 'not_cleared',
                'status' => $newStatus,
            ]);

            DB::table('agent_assignment_scans')->insert([
                'order_id' => $order->id,
                'order_no' => $order->order_no,
                'agent_id' => $agent->id,
                'scan_type' => $validated['scan_type'],
                'scanned_by' => $user->id,
                'scanned_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            $history = [];
            if ((int) $oldAgentId !== (int) $agent->id || $oldAgent !== $agent->name) {
                $history[] = ['attribute' => 'agent', 'old_value' => $oldAgent, 'new_value' => $agent->name];
            }
            if ((string) $oldStatus !== $newStatus) {
                $history[] = ['attribute' => 'status', 'old_value' => $oldStatus, 'new_value' => $newStatus];
            }
            if ($oldDeliveryDate !== $deliveryDate) {
                $history[] = ['attribute' => 'delivery_date', 'old_value' => $oldDeliveryDate, 'new_value' => $deliveryDate];
            }
            if ($oldClearance !== 'not_cleared') {
                $history[] = ['attribute' => 'clearance_status', 'old_value' => $oldClearance, 'new_value' => 'not_cleared'];
            }

            foreach ($history as $change) {
                OrderHistory::create([
                    'order_id' => $order->id,
                    'user_id' => $user->id,
                    ...$change,
                ]);
            }
        });

        return back()->with('success', "Order {$order->order_no} assigned to {$agent->name} and marked {$newStatus}.");
    }
}
