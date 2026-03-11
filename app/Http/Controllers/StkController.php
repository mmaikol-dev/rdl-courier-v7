<?php

namespace App\Http\Controllers;

use App\Models\SheetOrder;
use App\Models\MpesaTransaction;
use App\Models\User;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\DB;
use GuzzleHttp\Client;
use Illuminate\Support\Str;

class StkController extends Controller
{
    /**
     * Show orders list
     */
    public function index(Request $request)
    {
        Log::info('Fetching latest sheet orders for STK view');
        $query = SheetOrder::query();
        $selectedAgent = $request->input('agent');
        $user = $request->user();
        $normalizedRole = strtolower(trim((string) ($user?->roles ?? '')));
        
        // 🔐 Role-based filtering: Agents only see their own orders
        if ($user && $normalizedRole === 'agent') {
            $query->where('agent', $user->name);
        }

        if ($request->filled('agent')) {
            $query->where('agent', $selectedAgent);
        }
        
        // 📦 Only show specific statuses
        $query->whereIn('status', ['scheduled', 'dispatched', 'delivered']);
        
        // 🔍 Exact search by order_no
        if ($request->filled('search')) {
            $search = $request->input('search');
            $query->where('order_no', $search);
        }
        
        // 📦 Filter by status (optional additional filter)
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        
        // 📅 Delivery date range filter
        if ($request->filled('start_date')) {
            $query->whereRaw('DATE(delivery_date) >= ?', [$request->start_date]);
        }
        if ($request->filled('end_date')) {
            $query->whereRaw('DATE(delivery_date) <= ?', [$request->end_date]);
        }
        
        // 🚀 Order by most recent first and paginate
        $orders = $query->latest('created_at')
            ->paginate(20)
            ->withQueryString();
        
        Log::info('Fetched orders count: ' . $orders->count());
        
        // ✅ Keep transformation but include all necessary fields
        $transformedOrders = $orders->through(function ($order) {
            $rawDeliveryDate = $order->getRawOriginal('delivery_date');

            return [
                'id' => $order->id ?? 0,
                'order_no' => $order->order_no ?? '',
                'client_name' => $order->client_name ?? '',
                'quantity' => $order->quantity ?? 0,
                'amount' => $order->amount ?? 0,
                'product_name' => $order->product_name ?? '',
                'address' => $order->address ?? '',
                'phone' => $order->phone ?? '',
                'city' => $order->city ?? '',
                'status' => $order->status ?? 'Pending',
                'delivery_date' => $rawDeliveryDate ? substr((string) $rawDeliveryDate, 0, 10) : '',
                'code' => $order->code ?? '',
                'comments' => $order->comments ?? '', // ✅ Add comments field
                'confirmed' => $order->confirmed ?? false, // ✅ Add confirmed field
            ];
        });

        $agents = User::query()
            ->where('roles', 'agent')
            ->orderBy('name')
            ->get(['id', 'name']);
        
        return Inertia::render('stk/index', [
            'orders'  => $transformedOrders,
            'filters' => $request->only(['search', 'status', 'start_date', 'end_date', 'agent']),
            'agents' => $agents,
        ]);
    }

    /**
     * Update order comments and confirmation status
     */
    public function update(Request $request, $id)
    {
        Log::info('Updating sheet order', ['id' => $id, 'data' => $request->all()]);

        try {
            $validated = $request->validate([
                'comments' => 'nullable|string',
                'confirmed' => 'required|boolean',
            ]);

            $order = SheetOrder::findOrFail($id);
            
            // ✅ Use validated data and update efficiently
            $order->update([
                'comments' => $validated['comments'],
                'confirmed' => $validated['confirmed'],
            ]);

            Log::info('Sheet order updated successfully', [
                'id' => $id,
                'comments' => $validated['comments'],
                'confirmed' => $validated['confirmed']
            ]);

            // ✅ Return Inertia response instead of redirect for better UX
            return back()->with('success', 'Order updated successfully');
            
        } catch (\Illuminate\Validation\ValidationException $e) {
            Log::error('Validation failed for sheet order update', [
                'id' => $id,
                'errors' => $e->errors()
            ]);
            return back()->withErrors($e->errors());
            
        } catch (\Exception $e) {
            Log::error('Failed to update sheet order: ' . $e->getMessage(), [
                'id' => $id,
                'trace' => $e->getTraceAsString()
            ]);
            return back()->with('error', 'Failed to update order: ' . $e->getMessage());
        }
    }

    /**
     * Initiate STK Push
     */
    public function stkPush(Request $request)
    {
        Log::info('Initiating STK Push', $request->all());

        try {
            // Validate request
            $request->validate([
                'phone' => 'required',
                'amount' => 'required|numeric|min:1',
                'order_no' => 'required|string',
            ]);

            // Clean phone number
            $phone = preg_replace('/\D/', '', $request->phone);
            if (!Str::startsWith($phone, '254')) {
                $phone = '254' . substr($phone, -9);
            }
            Log::info('Cleaned phone number: ' . $phone);

            // Credentials
            $BusinessShortCode = '4136031';
            $LipaNaMpesaPasskey = 'd147a3cce07da3f5d8f837816f5503b5129cbf7b6f7eeda3792cb91b42b52dcd';
            $consumerKey = 'OhZXxLngscvEPmeiy3IZqzXepQwAs5HOmuQOOLDRGwDbE8Dw';
            $consumerSecret = 'msYICfGIrlB75Gieeio2nAzh5egtQfNiKSb5CLWPEaEtENNwcObyEyAULW5QTUAd';

            $Timestamp = date('YmdHis');
            $Password = base64_encode($BusinessShortCode . $LipaNaMpesaPasskey . $Timestamp);
            $Amount = (float) str_replace(',', '', $request->amount);
            Log::info("STK Push Amount: {$Amount}, Timestamp: {$Timestamp}");

            // Generate access token
            $accessToken = $this->generateAccessToken($consumerKey, $consumerSecret);
            Log::info('Access token generated');

            // Send STK Push
            $client = new Client();
            $response = $client->post('https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest', [
                'headers' => [
                    'Authorization' => 'Bearer ' . $accessToken,
                    'Content-Type' => 'application/json',
                ],
                'json' => [
                    'BusinessShortCode' => $BusinessShortCode,
                    'Password' => $Password,
                    'Timestamp' => $Timestamp,
                    'TransactionType' => 'CustomerPayBillOnline',
                    'Amount' => $Amount,
                    'PartyA' => $phone,
                    'PartyB' => $BusinessShortCode,
                    'PhoneNumber' => $phone,
                    'CallBackURL' => 'https://realdealsystem.com/api/mpesa/callback',
                    'AccountReference' => $request->order_no,
                    'TransactionDesc' => 'Payment for Order ' . $request->order_no,
                ],
            ]);

            $stkPushResponse = json_decode((string) $response->getBody(), true);
            Log::info('STK Push Response received', $stkPushResponse);

            if (isset($stkPushResponse['CheckoutRequestID'])) {
                MpesaTransaction::create([
                    'transaction_id' => $stkPushResponse['CheckoutRequestID'],
                    'amount' => $Amount,
                    'phone_number' => $phone,
                    'status' => 'Pending',
                    'mpesa_receipts' => null,
                    'order_no' => $request->order_no,
                ]);
                Log::info('STK Transaction saved to database', ['CheckoutRequestID' => $stkPushResponse['CheckoutRequestID']]);

                return response()->json([
                    'success' => true,
                    'message' => 'STK Push initiated successfully. Check your phone.',
                    'data' => $stkPushResponse,
                ]);
            }

            Log::warning('STK Push request failed', $stkPushResponse);
            return response()->json([
                'success' => false,
                'message' => 'STK Push request failed.',
                'data' => $stkPushResponse
            ]);

        } catch (\Exception $e) {
            Log::error('STK Push Exception: ' . $e->getMessage(), ['trace' => $e->getTraceAsString()]);
            return response()->json([
                'success' => false,
                'message' => $e->getMessage()
            ]);
        }
    }

    /**
     * Generate Access Token
     */
    private function generateAccessToken($consumerKey, $consumerSecret)
    {
        Log::info('Generating M-Pesa access token');
        $credentials = base64_encode($consumerKey . ':' . $consumerSecret);

        $client = new Client();
        $response = $client->request('GET',
            'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
            [
                'headers' => [
                    'Authorization' => 'Basic ' . $credentials,
                    'Content-Type' => 'application/json',
                ],
            ]
        );

        $responseBody = json_decode($response->getBody(), true);
        Log::info('Access token response', $responseBody);

        if (!isset($responseBody['access_token'])) {
            throw new \Exception('Failed to generate access token');
        }

        return $responseBody['access_token'];
    }

    /**
     * Handle STK Callback
     */
    public function handleCallback(Request $request)
    {
        $callbackData = $request->all();
        Log::info('Received M-Pesa STK Callback', $callbackData);

        $transactionStatus = $callbackData['Body']['stkCallback']['ResultCode'] ?? null;
        $checkoutRequestID = $callbackData['Body']['stkCallback']['CheckoutRequestID'] ?? null;
        $callbackItems = $callbackData['Body']['stkCallback']['CallbackMetadata']['Item'] ?? [];

        $amount = $mpesaReceiptNumber = $phoneNumber = null;
        foreach ($callbackItems as $item) {
            if ($item['Name'] == 'Amount') $amount = $item['Value'];
            if ($item['Name'] == 'MpesaReceiptNumber') $mpesaReceiptNumber = $item['Value'];
            if ($item['Name'] == 'PhoneNumber') $phoneNumber = $item['Value'];
        }
        Log::info('Parsed callback metadata', compact('amount', 'mpesaReceiptNumber', 'phoneNumber'));

        // Update transaction
        $transaction = MpesaTransaction::where('transaction_id', $checkoutRequestID)->first();
        if ($transaction) {
            $transaction->status = $transactionStatus == 0 ? 'Success' : 'Failed';
            $transaction->mpesa_receipts = $mpesaReceiptNumber;
            $transaction->amount = $amount ?? $transaction->amount;
            $transaction->phone_number = $phoneNumber ?? $transaction->phone_number;
            $transaction->save();
            Log::info('Updated MpesaTransaction record', ['transaction_id' => $checkoutRequestID]);

            if ($transactionStatus == 0) {
                $order = SheetOrder::where('order_no', $transaction->order_no)->first();
                if ($order) {
                    $order->code = $mpesaReceiptNumber;
                    $order->status = 'Delivered';
                    $order->save();
                    Log::info('Marked SheetOrder as paid', ['order_no' => $transaction->order_no]);
                }
            }
        } else {
            Log::warning('No transaction found for CheckoutRequestID', ['CheckoutRequestID' => $checkoutRequestID]);
        }

        return response()->json([
            'ResultCode' => 0,
            'ResultDesc' => 'Accepted'
        ]);
    }

    public function checkStatus($order_no)
    {
        Log::info('Checking transaction status', ['order_no' => $order_no]);
        $transaction = MpesaTransaction::where('order_no', $order_no)->latest()->first();

        if (!$transaction) {
            Log::info('Transaction not found, returning Pending');
            return response()->json(['status' => 'Pending']);
        }

        Log::info('Transaction found', ['status' => $transaction->status, 'mpesa_receipt' => $transaction->mpesa_receipts]);
        return response()->json([
            'status' => $transaction->status,
            'mpesa_receipt' => $transaction->mpesa_receipts,
            'amount' => $transaction->amount,
        ]);
    }
}
