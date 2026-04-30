<?php

namespace App\Http\Controllers;

use App\Models\Requisition;
use App\Models\DailyBudget;
use App\Models\BudgetTransaction;
use App\Models\RequisitionCategory;
use App\Models\RequisitionItem;
use App\Models\User;
use App\Support\CountryAccess;
use Inertia\Inertia;
use Illuminate\Support\Facades\Log;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RequisitionController extends Controller
{
    private function requisitionQueryForUser(?\App\Models\User $user)
    {
        return CountryAccess::scopeByCountryName(
            Requisition::query(),
            $user
        );
    }

    private function ensureCountryAccess(Request $request, Requisition $requisition): void
    {
        $user = $request->user()?->loadMissing('country');

        if (CountryAccess::hasGlobalAccess($user)) {
            return;
        }

        abort_unless(
            CountryAccess::matchesCountryName($requisition->country, $user),
            403
        );
    }

    private function resolveCountryOrFail(?\App\Models\User $user): string
    {
        $country = CountryAccess::resolveCountryNameForWrite($user, null);

        abort_if(! $country, 403, 'No country is assigned to this user.');

        return $country;
    }

    public function index(Request $request)
    {
        $user = $request->user()?->loadMissing('country');
        $query = $this->requisitionQueryForUser($user)
            ->with(['category', 'user', 'items', 'dailyBudget']);

        // Filter by status - only if not empty
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        // Filter by category - only if not empty
        if ($request->filled('category_id')) {
            $query->where('category_id', $request->category_id);
        }

        // Filter by date range - only if not empty
        if ($request->filled('date_from')) {
            $query->whereDate('requisition_date', '>=', $request->date_from);
        }

        if ($request->filled('date_to')) {
            $query->whereDate('requisition_date', '<=', $request->date_to);
        }

        // Filter by priority - only if not empty
        if ($request->filled('priority')) {
            $query->where('priority', $request->priority);
        }

        // Search functionality - only if not empty
        if ($request->filled('search')) {
            $query->where(function($q) use ($request) {
                $q->where('title', 'like', '%' . $request->search . '%')
                  ->orWhere('requisition_number', 'like', '%' . $request->search . '%')
                  ->orWhere('description', 'like', '%' . $request->search . '%');
            });
        }

        $requisitions = $query->latest()->paginate(15);

        // Fetch categories from requisition_categories table
        $categories = RequisitionCategory::all();
        
        // Fetch all users for dropdown
        $users = CountryAccess::scopeUsers(
            User::query()->select('id', 'name', 'email'),
            $user
        )->get();

        return Inertia::render('requisitions/index', [
            'requisitions' => $requisitions,
            'categories' => $categories,
            'users' => $users,
            'filters' => [
                'status' => $request->status,
                'category_id' => $request->category_id,
                'date_from' => $request->date_from,
                'date_to' => $request->date_to,
                'priority' => $request->priority,
                'search' => $request->search,
            ],
        ]);
    }

    public function store(Request $request)
    {
        try {
            $authUser = $request->user()?->loadMissing('country');
            $country = $this->resolveCountryOrFail($authUser);

            $validated = $request->validate([
                'category_id' => 'required|exists:requisition_categories,id',
                'user_id' => 'required|exists:users,id',
                'description' => 'nullable|string',
                'requisition_date' => 'required|date',
                'items' => 'required|array|min:1',
                'items.*.item_name' => 'required|string',
                'items.*.description' => 'nullable|string',
                'items.*.quantity' => 'required|integer|min:1',
                'items.*.unit_price' => 'required|numeric|min:0',
            ]);

            $totalAmount = 0;
            foreach ($request->items as $item) {
                $totalAmount += $item['quantity'] * $item['unit_price'];
            }

            // Get the selected user's name for the title
            $selectedUser = CountryAccess::scopeUsers(
                User::query(),
                $authUser
            )->findOrFail($request->user_id);

            $requisition = Requisition::create([
                'category_id' => $request->category_id,
                'user_id' => auth()->id(),
                'country' => $country,
                'title' => $selectedUser->name, // Use selected user's name as title
                'description' => $request->description,
                'total_amount' => $totalAmount,
                'requisition_date' => $request->requisition_date,
                'status' => 'pending',
            ]);

            foreach ($request->items as $item) {
                $requisition->items()->create([
                    'item_name' => $item['item_name'],
                    'description' => $item['description'] ?? null,
                    'quantity' => $item['quantity'],
                    'unit_price' => $item['unit_price'],
                    'total_price' => $item['quantity'] * $item['unit_price'],
                ]);
            }

            $requisition->load(['category', 'user', 'items', 'dailyBudget']);

            if ($request->expectsJson()) {
                return response()->json([
                    'message' => 'Requisition created successfully',
                    'requisition' => $requisition,
                ], 201);
            }

            return redirect()->route('requisitions.index')
                ->with('success', 'Requisition created successfully');

        } catch (\Exception $e) {
            Log::error('Failed to create requisition', [
                'user_id' => auth()->id(),
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            if ($request->expectsJson()) {
                return response()->json([
                    'message' => 'Error creating requisition: ' . $e->getMessage(),
                ], 500);
            }

            return redirect()->back()
                ->with('error', 'Error creating requisition: ' . $e->getMessage());
        }
    }

    public function show(Requisition $requisition)
    {
        $this->ensureCountryAccess(request(), $requisition);
        $requisition->load(['category', 'user', 'items', 'dailyBudget', 'approver']);

        $itemNames = $requisition->items
            ->pluck('item_name')
            ->filter()
            ->map(fn ($name) => trim((string) $name))
            ->filter()
            ->unique()
            ->values();

        $duplicateItemsByName = [];

        if ($itemNames->isNotEmpty()) {
            $duplicateRows = RequisitionItem::query()
                ->select('requisition_items.item_name', 'requisitions.id as requisition_id', 'requisitions.requisition_number')
                ->join('requisitions', 'requisitions.id', '=', 'requisition_items.requisition_id')
                ->where('requisition_items.requisition_id', '!=', $requisition->id)
                ->where('requisitions.country', $requisition->country)
                ->whereIn(DB::raw('LOWER(TRIM(requisition_items.item_name))'), $itemNames->map(fn ($name) => mb_strtolower($name))->all())
                ->get();

            foreach ($duplicateRows as $row) {
                $key = mb_strtolower(trim((string) $row->item_name));
                $duplicateItemsByName[$key] ??= [];

                $entry = [
                    'id' => $row->requisition_id,
                    'requisition_number' => $row->requisition_number ?: ('#' . $row->requisition_id),
                ];

                if (!collect($duplicateItemsByName[$key])->contains(fn ($existing) => $existing['id'] === $entry['id'])) {
                    $duplicateItemsByName[$key][] = $entry;
                }
            }
        }

        if (request()->expectsJson()) {
            return response()->json([
                'requisition' => $requisition,
                'duplicateItemsByName' => $duplicateItemsByName,
            ]);
        }

        return Inertia::render('requisitions/show', [
            'requisition' => $requisition,
            'duplicateItemsByName' => $duplicateItemsByName,
        ]);
    }

    public function updateStatus(Request $request, Requisition $requisition)
    {
        $this->ensureCountryAccess($request, $requisition);
        $request->validate([
            'status' => 'required|in:pending,approved,rejected,paid',
        ]);

        try {
            DB::beginTransaction();

            $oldStatus = $requisition->status;
            $requisition->status = $request->status;

            if ($request->status === 'approved') {
                $requisition->approved_at = now();
                $requisition->approved_by = auth()->id();
            }

            if ($request->status === 'paid') {
                $budget = CountryAccess::scopeByCountryName(
                    DailyBudget::query(),
                    $request->user()?->loadMissing('country')
                )
                    ->whereDate('budget_date', $requisition->requisition_date)
                    ->first();

                if (!$budget) {
                    DB::rollBack();
                    return back()->withErrors(['message' => 'No budget found for this date']);
                }

                if ($budget->current_amount < $requisition->total_amount) {
                    DB::rollBack();
                    return back()->withErrors(['message' => 'Insufficient budget']);
                }

                $balanceBefore = $budget->current_amount;
                $budget->deductAmount($requisition->total_amount);

                BudgetTransaction::create([
                    'daily_budget_id' => $budget->id,
                    'type' => 'deduction',
                    'amount' => $requisition->total_amount,
                    'balance_before' => $balanceBefore,
                    'balance_after' => $budget->current_amount,
                    'reference_type' => 'Requisition',
                    'reference_id' => $requisition->id,
                    'description' => "Payment for requisition {$requisition->requisition_number}",
                    'created_by' => auth()->id(),
                ]);

                $requisition->daily_budget_id = $budget->id;
                $requisition->paid_at = now();
            }

            $requisition->save();

            DB::commit();

            // Return back with success message instead of JSON
            return back()->with('success', 'Requisition status updated successfully');

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Failed to update requisition status', [
                'requisition_id' => $requisition->id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            
            return back()->withErrors(['message' => 'Error updating status: ' . $e->getMessage()]);
        }
    }

    public function destroy(Requisition $requisition)
    {
        $this->ensureCountryAccess(request(), $requisition);

        if ($requisition->status === 'paid') {
            return back()->withErrors(['message' => 'Cannot delete paid requisition']);
        }

        try {
            $requisition->delete();
            return redirect()->route('requisitions.index')
                ->with('success', 'Requisition deleted successfully');
        } catch (\Exception $e) {
            Log::error('Failed to delete requisition', [
                'requisition_id' => $requisition->id,
                'error' => $e->getMessage(),
            ]);
            
            return back()->withErrors(['message' => 'Error deleting requisition']);
        }
    }
}
