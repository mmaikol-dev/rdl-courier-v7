<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;
use AfricasTalking\SDK\AfricasTalking;
use Exception;

class CallcenterController extends Controller
{
    private function credentials(): array
    {
        return [
            'username' => (string) config('services.africastalking.username', ''),
            'api_key' => (string) config('services.africastalking.callcenter_api_key', ''),
            'from' => (string) config('services.africastalking.callcenter_from', ''),
        ];
    }

    public function makeCall(Request $request)
    {
        $request->validate([
            'to' => 'required|string', // recipient number(s)
        ]);

        $credentials = $this->credentials();

        $AT = new AfricasTalking($credentials['username'], $credentials['api_key']);
        $voice = $AT->voice();

        try {
            $results = $voice->call([
                'from' => $credentials['from'],
                'to'   => $request->input('to')
            ]);

            return response()->json($results);
        } catch (Exception $e) {
            return response()->json([
                'error'   => true,
                'message' => $e->getMessage()
            ], 500);
        }
    }



    public function generateWebRTCToken(Request $request)
    {
        try {
            $user = Auth::user();
            $clientName = $user->username ?? $user->email;
            $credentials = $this->credentials();
            $phone = $user->phone ?? $credentials['from'];
    
            $response = Http::withHeaders([
                'apiKey' => $credentials['api_key']
            ])->post("https://webrtc.africastalking.com/capability-token/request", [
                'username'    => $credentials['username'],
                'clientName'  => $clientName,
                'phoneNumber' => $phone,
                'incoming'    => 'true',
                'outgoing'    => 'true',
            ]);
    
            if ($response->failed()) {
                Log::error("WebRTC token request failed", ['response' => $response->body()]);
                return response()->json(['error' => true, 'message' => 'Failed to fetch token', 'body' => $response->body()], 500);
            }
    
            return response()->json($response->json());
    
        } catch (Exception $e) {
            Log::error("WebRTC token generation error: " . $e->getMessage());
            return response()->json([
                'error'   => true,
                'message' => $e->getMessage()
            ], 500);
        }
    }

    public function voiceCallback(Request $request)
    {
        Log::info('Voice Callback:', $request->all());
    
        // Example: bridge agent and client
        $agentNumber  = "+254711234567";            // Agent's phone number
        $clientNumber = $request->input('callerNumber'); // Or pick from $request->input('to')
    
        $xmlResponse = '<?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Dial phoneNumbers="' . $agentNumber . ',' . $clientNumber . '"/>
            </Response>';
    
        return response($xmlResponse, 200)
            ->header('Content-Type', 'application/xml');
    }
    

    public function endCall(Request $request)
    {
        $request->validate([
            'sessionId' => 'required|string', // Africa's Talking session ID from makeCall
        ]);

        $credentials = $this->credentials();

        $AT = new AfricasTalking($credentials['username'], $credentials['api_key']);
        $voice = $AT->voice();

        try {
            $results = $voice->hangup([
                'sessionId' => $request->input('sessionId'),
            ]);

            return response()->json([
                'status' => 'success',
                'data'   => $results
            ]);
        } catch (Exception $e) {
            return response()->json([
                'error'   => true,
                'message' => $e->getMessage()
            ], 500);
        }
    }
}
