<?php

namespace App\Http\Controllers;

use App\Models\C2BTransaction;
use App\Models\OrderHistory;
use App\Models\SheetOrder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;

class C2BTransactionController extends Controller
{
    private function recordOrderHistory(SheetOrder $order, string $attribute, mixed $oldValue, mixed $newValue): void
    {
        if ((string) $oldValue === (string) $newValue) {
            return;
        }

        OrderHistory::create([
            'order_id' => $order->id,
            'user_id' => auth()->id(),
            'attribute' => $attribute,
            'old_value' => $oldValue,
            'new_value' => $newValue,
        ]);
    }

    /**
     * Show paginated transactions (for your Inertia frontend).
     */
        public function index(Request $request)
{
    $query = C2BTransaction::query();

    // ✅ Search by transaction_id, account_number, payer_phone, or business_shortcode
    if ($request->filled('search')) {
        $search = $request->input('search');
        $query->where(function ($q) use ($search) {
            $q->where('transaction_id', 'like', "%{$search}%")
              ->orWhere('account_number', 'like', "%{$search}%")
              ->orWhere('payer_phone', 'like', "%{$search}%")
              ->orWhere('business_shortcode', 'like', "%{$search}%");
        });
    }

    // ✅ Filter by status (processed/pending)
    if ($request->filled('status')) {
        if ($request->status === 'processed') {
            $query->where('processed', true);
        } elseif ($request->status === 'pending') {
            $query->where('processed', false);
        }
    }

    // ✅ Filter by date range
    if ($request->filled('start_date')) {
        $query->whereDate('created_at', '>=', $request->start_date);
    }
    if ($request->filled('end_date')) {
        $query->whereDate('created_at', '<=', $request->end_date);
    }

    $summaryQuery = clone $query;

    // ✅ Pagination + keep filters across pages
    $transactions = $query->orderBy('created_at', 'desc')
        ->paginate(100)
        ->withQueryString();

    return Inertia::render('transactions/index', [
        'transactions' => $transactions,
        'summary' => [
            'totalAmount' => (float) $summaryQuery->sum('amount'),
            'totalRecords' => $summaryQuery->count(),
        ],
        'filters' => $request->only(['search', 'status', 'start_date', 'end_date']),
    ]);
}


    /**
     * This is the callback Safaricom will POST to
     */
   public function confirmTransaction(Request $request)
{
    Log::info('M-Pesa C2B Callback Received:', $request->all());

    $transId           = $request->input('TransID');
    $billRefNumber     = $request->input('BillRefNumber');
    $transAmount       = $request->input('TransAmount');
    $businessShortCode = $request->input('BusinessShortCode');
    $payerPhone = $request->input('MSISDN')
        ?? $request->input('MSISDNNumber')
        ?? $request->input('PhoneNumber')
        ?? $request->input('Phone')
        ?? null;

    // Extra log for debugging
    Log::info('Parsed Transaction:', [
        'TransID'           => $transId,
        'BillRefNumber'     => $billRefNumber,
        'TransAmount'       => $transAmount,
        'PayerPhone'        => $payerPhone,
        'BusinessShortCode' => $businessShortCode,
    ]);

    if (!$transId || !$billRefNumber || !$transAmount || !$businessShortCode) {
        Log::error('Missing required fields from Safaricom');
        return response()->json([
            'ResultCode' => 1,
            'ResultDesc' => 'Missing required fields'
        ]);
    }

    try {
        // Prevent duplicates
        $transaction = C2BTransaction::updateOrCreate(
            ['transaction_id' => $transId],
            [
                'account_number' => $billRefNumber,
                'amount'         => $transAmount,
                'payer_phone'    => $payerPhone,
                'business_shortcode' => $businessShortCode,
            ]
        );

        Log::info("Transaction {$transId} saved successfully.");

        $order = SheetOrder::where('order_no', $billRefNumber)->first();

        if (! $order) {
            Log::warning("No matching sheet order found for account number {$billRefNumber}.");
        } else {
            $deliveryDate = now()->toDateString();
            $paidAmount = (float) $transAmount;
            $orderAmount = (float) ($order->amount ?? 0);

            if ($paidAmount >= $orderAmount) {
                $oldCode = $order->code;
                $oldStatus = $order->status;
                $oldDeliveryDate = $order->delivery_date;

                $order->update([
                    'code' => $transId,
                    'status' => 'Delivered',
                    'delivery_date' => $deliveryDate,
                ]);

                $this->recordOrderHistory($order, 'code', $oldCode, $transId);
                $this->recordOrderHistory($order, 'status', $oldStatus, 'Delivered');
                $this->recordOrderHistory($order, 'delivery_date', $oldDeliveryDate, $deliveryDate);

                $transaction->update(['processed' => 1]);

                Log::info("Order {$order->order_no} marked as Delivered from C2B callback.", [
                    'order_amount' => $orderAmount,
                    'paid_amount' => $paidAmount,
                    'delivery_date' => $deliveryDate,
                ]);
            } else {
                $oldCode = $order->code;
                $oldDeliveryDate = $order->delivery_date;

                $order->update([
                    'code' => $transId,
                    'delivery_date' => $deliveryDate,
                ]);

                $this->recordOrderHistory($order, 'code', $oldCode, $transId);
                $this->recordOrderHistory($order, 'delivery_date', $oldDeliveryDate, $deliveryDate);

                $transaction->update(['processed' => 1]);

                Log::warning("Order {$order->order_no} received partial C2B payment.", [
                    'order_amount' => $orderAmount,
                    'paid_amount' => $paidAmount,
                    'delivery_date' => $deliveryDate,
                ]);
            }
        }
    } catch (\Exception $e) {
        Log::error('Error saving transaction: ' . $e->getMessage());
        return response()->json([
            'ResultCode' => 1,
            'ResultDesc' => 'Database save error'
        ]);
    }

    // Response back to Safaricom (very important!)
    return response()->json([
        'ResultCode' => 0,
        'ResultDesc' => 'Success'
    ]);
}

/**
 * Store manually via form.
 */
public function store(Request $request)
{
    $validated = $request->validate([
        'transaction_id' => 'required|string|unique:c2b_transactions,transaction_id',
        'account_number' => 'required|string',
        'amount'         => 'required|numeric|min:0',
        'payer_phone'    => 'nullable|string',
        'business_shortcode' => 'required|string',
        'processed'      => 'boolean',
    ]);

    C2BTransaction::create($validated);

    return redirect()->route('transactions.index')
        ->with('success', 'Transaction created successfully.');
}


public function validateTransaction(Request $request)
{
    Log::info('Validation Callback Received:', $request->all());
    return response()->json([
        'ResultCode' => 0,
        'ResultDesc' => 'Accepted'
    ]);
}

    /**
     * Update manually.
     */
    public function update(Request $request, C2BTransaction $transaction)
    {
        $validated = $request->validate([
            'account_number' => 'required|string',
            'amount'         => 'required|numeric|min:0',
            'payer_phone'    => 'nullable|string',
            'business_shortcode' => 'nullable|string',
            'processed'      => 'boolean',
        ]);

        $transaction->update($validated);

        return redirect()->route('transactions.index')
            ->with('success', 'Transaction updated successfully.');
    }

    /**
     * Delete transaction.
     */
    public function destroy(C2BTransaction $transaction)
    {
        $transaction->delete();

        return redirect()->route('transactions.index')
            ->with('success', 'Transaction deleted successfully.');
    }
}
