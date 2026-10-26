<?php

namespace App\Http\Controllers;

use App\Models\Transfer;
use App\Models\Product;
use App\Models\User;
use App\Models\Deduction;
use App\Models\Whatsapp;
use App\Services\OpenwaService;
use App\Support\CountryAccess;
use Illuminate\Support\Facades\Log;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Inertia\Inertia;

class TransferController extends Controller
{
    public function __construct(
        private readonly OpenwaService $openwa,
    ) {}

    private function resolveCountryOrFail(?\App\Models\User $user): string
    {
        $country = CountryAccess::resolveCountryNameForWrite($user, null);

        abort_if(! $country, 403, 'No country is assigned to this user.');

        return $country;
    }

    /**
     * Send transfer notification to the country group.
     */
    private function sendTransferNotification(array $transfers, string $region, string $from, string $country): void
    {
        $message = "*STOCK TRANSFER NOTIFICATION* 📦\n\n";
        $message .= "*Country:* {$country}\n";
        $message .= "*Region:* {$region}\n";
        $message .= "*From:* {$from}\n";
        $message .= "*Date:* " . now()->format('d M Y, H:i') . "\n";
        $message .= "*Transferred By:* " . (auth()->user()->name ?? 'System') . "\n\n";
        
        $message .= "*Transferred Products:*\n";
        foreach ($transfers as $index => $transfer) {
            $product = Product::find($transfer['product_id']);
            $agent = User::find($transfer['agent_id']);
            
            $num = $index + 1;
            $message .= "{$num}. *{$product->name}*\n";
            $message .= "   📦 Code: {$product->code}\n";
            $message .= "   📤 Quantity: {$transfer['quantity']} units\n";
            $message .= "   👤 Agent: {$agent->name}\n";
            $message .= "   🏷️ Merchant: {$product->merchant}\n\n";
        }
        
        $message .= "*Total Products Transferred:* " . count($transfers) . "\n\n";
        $message .= "_Automated notification from Inventory System_";
        
        try {
            $result = $this->openwa->sendToGroup($country, $message);

            Whatsapp::create([
                'to' => $result['to'],
                'client_name' => 'Stock Transfer',
                'store_name' => $country,
                'cc_agents' => null,
                'message' => $message,
                'status' => 'sent',
                'sid' => $result['message_id'],
            ]);

            Log::info('Transfer notification sent to group.', [
                'country' => $country,
                'message_id' => $result['message_id'],
            ]);
        } catch (\Throwable $e) {
            Log::error('Failed to send transfer notification to group.', [
                'country' => $country,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Send deduction notification to the country group.
     */
    private function sendDeductionNotification(int $productId, int $agentId, int $quantity, string $reason, string $code, string $country): void
    {
        $product = Product::find($productId);
        $agent = User::find($agentId);
        
        $totalTransferred = Transfer::where('product_id', $productId)
            ->where('agent_id', $agentId)
            ->sum('quantity');
        
        $totalDeducted = Deduction::where('product_id', $productId)
            ->where('agent_id', $agentId)
            ->sum('quantity');
        
        $remainingQuantity = $totalTransferred - $totalDeducted;
        
        $message = "*STOCK DEDUCTION NOTIFICATION* 📉\n\n";
        $message .= "*Country:* {$country}\n";
        $message .= "*Date:* " . now()->format('d M Y, H:i') . "\n";
        $message .= "*Deducted By:* " . (auth()->user()->name ?? 'System') . "\n\n";
        
        $message .= "*Deduction Details:*\n";
        $message .= "📦 Product: {$product->name}\n";
        $message .= "🏷️ Code: {$product->code}\n";
        $message .= "📝 Deduction Code: {$code}\n";
        $message .= "👤 Agent: {$agent->name}\n";
        $message .= "📉 Quantity Deducted: {$quantity} units\n";
        $message .= "📊 Total Transferred: {$totalTransferred} units\n";
        $message .= "📊 Total Deducted: {$totalDeducted} units\n";
        $message .= "📊 Remaining: {$remainingQuantity} units\n";
        
        if ($reason) {
            $message .= "💬 Reason: {$reason}\n";
        }
        
        $message .= "\n_Automated notification from Inventory System_";
        
        try {
            $result = $this->openwa->sendToGroup($country, $message);

            Whatsapp::create([
                'to' => $result['to'],
                'client_name' => 'Stock Deduction',
                'store_name' => $country,
                'cc_agents' => null,
                'message' => $message,
                'status' => 'sent',
                'sid' => $result['message_id'],
            ]);

            Log::info('Deduction notification sent to group.', [
                'country' => $country,
                'message_id' => $result['message_id'],
            ]);
        } catch (\Throwable $e) {
            Log::error('Failed to send deduction notification to group.', [
                'country' => $country,
                'error' => $e->getMessage(),
            ]);
        }
    }

    public function index(Request $request)
    {
        $user = $request->user()?->loadMissing('country');

        $countryName = null;
        if (!CountryAccess::hasGlobalAccess($user)) {
            $countryName = CountryAccess::normalizeCountryName(CountryAccess::userCountryName($user));
        }

        $deductionSubquery = '(SELECT COALESCE(SUM(quantity), 0) FROM deductions WHERE agent_id = users.id';
        $bindings = [];
        if ($countryName) {
            $deductionSubquery .= ' AND LOWER(TRIM(country)) = ?';
            $bindings[] = $countryName;
        }
        $deductionSubquery .= ')';

        $agents = CountryAccess::scopeUsers(
            User::query()->where('roles', 'agent'),
            $user
        )
            ->select('id', 'name', 'store_phone', 'store_name', 'store_address', 'email', 'created_at')
            ->selectRaw($deductionSubquery . ' as deductions_sum_quantity', $bindings)
            ->withCount(['transfers' => function ($q) use ($user) {
                CountryAccess::scopeByCountryName($q, $user);
            }])
            ->withSum(['transfers' => function ($q) use ($user) {
                CountryAccess::scopeByCountryName($q, $user);
            }], 'quantity')
            ->withMax(['transfers' => function ($q) use ($user) {
                CountryAccess::scopeByCountryName($q, $user);
            }], 'created_at')
            ->orderBy('name')
            ->get();

        return inertia('products/transfer', [
            'agents' => $agents,
        ]);
    }

    public function showByAgent(Request $request, $agentId)
    {
        $user = $request->user()?->loadMissing('country');

        $agent = CountryAccess::scopeUsers(
            User::query()->where('roles', 'agent'),
            $user
        )->findOrFail($agentId);

        $countryName = null;
        if (!CountryAccess::hasGlobalAccess($user)) {
            $countryName = CountryAccess::normalizeCountryName(CountryAccess::userCountryName($user));
        }

        $deductionSubquery = '(SELECT COALESCE(SUM(quantity), 0) FROM deductions WHERE product_id = transfers.product_id AND agent_id = transfers.agent_id';
        $bindings = [];
        if ($countryName) {
            $deductionSubquery .= ' AND LOWER(TRIM(country)) = ?';
            $bindings[] = $countryName;
        }
        $deductionSubquery .= ')';

        $transfers = CountryAccess::scopeByCountryName(Transfer::query(), $user)
            ->where('agent_id', $agentId)
            ->select(
                'product_id',
                'agent_id',
                DB::raw('COUNT(*) as transfer_count'),
                DB::raw('SUM(quantity) as total_quantity'),
                DB::raw('MAX(created_at) as last_transfer_date'),
                DB::raw('MIN(created_at) as first_transfer_date')
            )
            ->selectRaw($deductionSubquery . ' as total_deducted', $bindings)
            ->with(['product:id,name,merchant,code', 'agent:id,name'])
            ->groupBy('product_id', 'agent_id');

        if ($request->filled('search')) {
            $search = $request->string('search')->toString();
            $transfers->whereHas('product', function ($q) use ($search) {
                $q->whereRaw('LOWER(name) LIKE ?', ['%' . mb_strtolower($search) . '%'])
                  ->orWhereRaw('LOWER(merchant) LIKE ?', ['%' . mb_strtolower($search) . '%'])
                  ->orWhereRaw('LOWER(code) LIKE ?', ['%' . mb_strtolower($search) . '%']);
            });
        }

        $transfers = $transfers->latest('last_transfer_date')
            ->paginate(20)
            ->withQueryString();

        $products = CountryAccess::scopeProducts(Product::query(), $user)
            ->select('id', 'name', 'merchant', 'code')
            ->get();

        return inertia('products/agent-transfers', [
            'agent' => $agent,
            'transfers' => $transfers,
            'products' => $products,
        ]);
    }

    public function groupedView(Request $request)
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
            ->with(['product:id,name,merchant,code', 'agent:id,name'])
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

        $products = CountryAccess::scopeProducts(Product::query(), $user)
            ->select('id', 'name', 'merchant', 'code')
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

        $products = CountryAccess::scopeProducts(Product::query(), $user)
            ->select('id', 'name', 'merchant', 'code')
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

        $deductions = CountryAccess::scopeByCountryName(Deduction::query(), $user)
            ->where('product_id', $productId)
            ->where('agent_id', $agentId)
            ->latest()
            ->get();

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

        // Send WhatsApp notification
        try {
            $this->sendTransferNotification(
                $validated['transfers'],
                $validated['region'],
                $validated['from'],
                $country
            );
        } catch (\Exception $e) {
            Log::error('Failed to send transfer WhatsApp notification: ' . $e->getMessage());
        }

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

        $totalTransferred = CountryAccess::scopeByCountryName(Transfer::query(), $user)
            ->where('product_id', $productId)
            ->where('agent_id', $agentId)
            ->sum('quantity');

        $totalDeducted = CountryAccess::scopeByCountryName(Deduction::query(), $user)
            ->where('product_id', $productId)
            ->where('agent_id', $agentId)
            ->sum('quantity');

        $remainingQuantity = $totalTransferred - $totalDeducted;

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

        // Send WhatsApp notification
        try {
            $this->sendDeductionNotification(
                $productId,
                $agentId,
                $validated['quantity'],
                $validated['reason'] ?? '',
                $validated['code'],
                $country
            );
        } catch (\Exception $e) {
            Log::error('Failed to send deduction WhatsApp notification: ' . $e->getMessage());
        }

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

    /**
     * Products that agents still hold stock of, for the "Returned quantities"
     * flow (an agent sending products back to the main office).
     */
    public function returnableProducts(Request $request)
    {
        $user = $request->user()?->loadMissing('country');
        $search = trim((string) $request->string('search'));

        $products = CountryAccess::scopeProducts(Product::query(), $user)
            ->select('id', 'name', 'code', 'merchant')
            ->orderBy('name')
            ->get()
            ->filter(function (Product $product) use ($search) {
                if ($search === '') {
                    return true;
                }

                $haystack = Str::lower(implode(' ', array_filter([
                    $product->name,
                    $product->code,
                    $product->merchant,
                ])));

                return Str::contains($haystack, Str::lower($search));
            })
            ->map(function (Product $product) use ($user) {
                $holdings = $this->productHoldings($user, (int) $product->id);

                return [
                    'id' => $product->id,
                    'name' => $product->name,
                    'code' => $product->code,
                    'merchant' => $product->merchant,
                    'agents' => $holdings->count(),
                    'remaining' => $holdings->sum('remaining'),
                ];
            })
            ->filter(fn (array $product) => $product['remaining'] > 0)
            ->take(25)
            ->values();

        return response()->json($products);
    }

    /**
     * Every agent holding a given product, with what they still have left.
     */
    public function productHolders(Request $request)
    {
        $user = $request->user()?->loadMissing('country');

        $product = CountryAccess::scopeProducts(Product::query(), $user)
            ->findOrFail((int) $request->integer('product_id'));

        $holdings = $this->productHoldings($user, (int) $product->id)
            ->filter(fn (array $holding) => $holding['remaining'] > 0)
            ->values();

        return response()->json([
            'product' => [
                'id' => $product->id,
                'name' => $product->name,
                'code' => $product->code,
                'merchant' => $product->merchant,
            ],
            'agents' => $holdings,
        ]);
    }

    /**
     * Deduct a product from several agents at once, each agent giving back
     * what they still hold. Every row of one return shares a code
     * (RET-001-2026-04-24, RET-001-2026-04-24-02, ...) so the return can be
     * traced as a single event.
     */
    public function bulkDeduct(Request $request)
    {
        $user = $request->user()?->loadMissing('country');
        $country = $this->resolveCountryOrFail($user);

        $validated = $request->validate([
            'product_id' => 'required|integer',
            'agent_ids' => 'required|array|min:1',
            'agent_ids.*' => 'required|integer',
            'reason' => 'nullable|string|max:500',
        ]);

        $product = CountryAccess::scopeProducts(Product::query(), $user)
            ->findOrFail($validated['product_id']);

        $agentIds = array_values(array_unique(array_map('intval', $validated['agent_ids'])));

        $agents = CountryAccess::scopeUsers(
            User::query()->where('roles', 'agent'),
            $user
        )->whereIn('id', $agentIds)->get();

        if ($agents->count() !== count($agentIds)) {
            return response()->json([
                'message' => 'One or more selected agents are not available for your country.',
            ], 422);
        }

        $holdings = $this->productHoldings($user, (int) $product->id)->keyBy('agent_id');

        $rows = [];
        foreach ($agents as $agent) {
            $remaining = (int) ($holdings->get($agent->id)['remaining'] ?? 0);

            if ($remaining <= 0) {
                continue;
            }

            $rows[] = ['agent' => $agent, 'quantity' => $remaining];
        }

        if ($rows === []) {
            return response()->json([
                'message' => 'None of the selected agents currently hold this product.',
            ], 422);
        }

        $reason = $validated['reason'] ?? 'Product returned to main office';
        $baseCode = null;

        DB::transaction(function () use (&$baseCode, $rows, $product, $country, $reason) {
            $baseCode = $this->nextReturnCode();

            foreach ($rows as $index => $row) {
                Deduction::create([
                    'code' => $index === 0
                        ? $baseCode
                        : $baseCode . '-' . str_pad((string) ($index + 1), 2, '0', STR_PAD_LEFT),
                    'product_id' => $product->id,
                    'agent_id' => $row['agent']->id,
                    'quantity' => $row['quantity'],
                    'reason' => $reason,
                    'deducted_by' => auth()->user()->name ?? 'System',
                    'country' => $country,
                ]);
            }
        });

        try {
            $this->sendBulkReturnNotification($product, $rows, (string) $baseCode, $country, $reason);
        } catch (\Throwable $e) {
            Log::error('Failed to send bulk return WhatsApp notification: ' . $e->getMessage());
        }

        return response()->json([
            'ok' => true,
            'code' => $baseCode,
            'agents' => count($rows),
            'units' => array_sum(array_column($rows, 'quantity')),
            'message' => 'Returned ' . $product->name . ' from ' . count($rows) . ' agent(s) — code ' . $baseCode . '.',
        ]);
    }

    /**
     * What every agent holds of a product: transferred, deducted and left.
     *
     * @return \Illuminate\Support\Collection<int, array<string, mixed>>
     */
    private function productHoldings(?\App\Models\User $user, int $productId)
    {
        $countryName = null;
        if (!CountryAccess::hasGlobalAccess($user)) {
            $countryName = CountryAccess::normalizeCountryName(CountryAccess::userCountryName($user));
        }

        $deductionSubquery = '(SELECT COALESCE(SUM(quantity), 0) FROM deductions WHERE product_id = transfers.product_id AND agent_id = transfers.agent_id';
        $bindings = [];
        if ($countryName) {
            $deductionSubquery .= ' AND LOWER(TRIM(country)) = ?';
            $bindings[] = $countryName;
        }
        $deductionSubquery .= ')';

        return CountryAccess::scopeByCountryName(Transfer::query(), $user)
            ->where('product_id', $productId)
            ->select('product_id', 'agent_id', DB::raw('SUM(quantity) as transferred'))
            ->selectRaw($deductionSubquery . ' as deducted', $bindings)
            ->with(['agent:id,name,store_name,store_phone'])
            ->groupBy('product_id', 'agent_id')
            ->get()
            ->map(function ($row) {
                $transferred = (int) $row->transferred;
                $deducted = (int) $row->deducted;

                return [
                    'agent_id' => (int) $row->agent_id,
                    'agent_name' => $row->agent?->name,
                    'store_name' => $row->agent?->store_name,
                    'transferred' => $transferred,
                    'deducted' => $deducted,
                    'remaining' => $transferred - $deducted,
                ];
            })
            ->sortByDesc('remaining')
            ->values();
    }

    /**
     * Next return code for today, e.g. RET-001-2026-04-24. The number is
     * serialised with a MySQL advisory lock because deductions.code is unique
     * and two returns could otherwise claim the same number.
     */
    private function nextReturnCode(): string
    {
        $date = now()->format('Y-m-d');
        $lockName = 'rd_return_code_' . $date;

        $lock = DB::selectOne('SELECT GET_LOCK(?, 5) as acquired', [$lockName]);

        try {
            $existing = Deduction::query()
                ->where('code', 'like', 'RET-%-' . $date)
                ->lockForUpdate()
                ->pluck('code');

            $highest = 0;
            foreach ($existing as $code) {
                if (preg_match('/^RET-(\d+)-' . preg_quote($date, '/') . '$/', (string) $code, $matches)) {
                    $highest = max($highest, (int) $matches[1]);
                }
            }

            return sprintf('RET-%03d-%s', $highest + 1, $date);
        } finally {
            if ($lock && (int) $lock->acquired === 1) {
                DB::selectOne('SELECT RELEASE_LOCK(?)', [$lockName]);
            }
        }
    }

    /**
     * One message for the whole return instead of one per agent.
     */
    private function sendBulkReturnNotification(Product $product, array $rows, string $code, string $country, string $reason): void
    {
        $totalUnits = array_sum(array_column($rows, 'quantity'));

        $message = "*STOCK RETURN NOTIFICATION* 📦\n\n";
        $message .= "*Country:* {$country}\n";
        $message .= "*Date:* " . now()->format('d M Y, H:i') . "\n";
        $message .= "*Returned By:* " . (auth()->user()->name ?? 'System') . "\n\n";
        $message .= "*Return Details:*\n";
        $message .= "📦 Product: {$product->name}\n";
        $message .= "🏷️ Code: {$product->code}\n";
        $message .= "🧾 Return Code: {$code}\n";
        $message .= "👥 Agents: " . count($rows) . "\n";
        $message .= "📊 Total Units Returned: {$totalUnits}\n\n";

        foreach ($rows as $index => $row) {
            $message .= ($index + 1) . ". *{$row['agent']->name}* — {$row['quantity']} units\n";
        }

        if ($reason) {
            $message .= "\n💬 Reason: {$reason}\n";
        }

        $message .= "\n_Automated notification from Inventory System_";

        try {
            $result = $this->openwa->sendToGroup($country, $message);

            Whatsapp::create([
                'to' => $result['to'],
                'client_name' => 'Stock Return',
                'store_name' => $country,
                'cc_agents' => null,
                'message' => $message,
                'status' => 'sent',
                'sid' => $result['message_id'],
            ]);

            Log::info('Bulk return notification sent to group.', [
                'country' => $country,
                'code' => $code,
                'agents' => count($rows),
            ]);
        } catch (\Throwable $e) {
            Log::error('Failed to send bulk return notification to group.', [
                'country' => $country,
                'error' => $e->getMessage(),
            ]);
        }
    }
}