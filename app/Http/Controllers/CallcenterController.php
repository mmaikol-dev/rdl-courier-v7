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
    public function makeCall(Request $request)
    {
        $request->validate([
            'to' => 'required|string', // recipient number(s)
        ]);

        // ⚠️ Hardcoded Africa's Talking credentials (for testing ONLY)
        $username = "rdlcallcenter"; 
        $apiKey   = "atsk_2e98940cc66266269a15a83e568e22c44c014384369f5ebbe8cfd0ec7bb2b67573b777b2"; 
        $from     = "+254711082385"; // Must be a registered AT voice number

        $AT    = new AfricasTalking($username, $apiKey);
        $voice = $AT->voice();

        try {
            $results = $voice->call([
                'from' => $from,
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
            $phone = $user->phone ?? '+254711082385';
    
            $apiKey   = "atsk_2e98940cc66266269a15a83e568e22c44c014384369f5ebbe8cfd0ec7bb2b67573b777b2";
            $username = "rdlcallcenter";
    
            $response = Http::withHeaders([
                'apiKey' => $apiKey
            ])->post("https://webrtc.africastalking.com/capability-token/request", [
                'username'    => $username,
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

        // ⚠️ Hardcoded credentials (testing only)
        $username = "rdlcallcenter"; 
        $apiKey   = "atsk_2e98940cc66266269a15a83e568e22c44c014384369f5ebbe8cfd0ec7bb2b67573b777b2"; 

        $AT    = new AfricasTalking($username, $apiKey);
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
