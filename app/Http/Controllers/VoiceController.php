<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;
use Inertia\Inertia;

class VoiceController extends Controller
{
    // SAME API KEY for both WebRTC and Voice - just different header names
    private $apiKey = 'atsk_ec7c2142c456c3c9dc406eec927f8e4b7732afc428c3829b3b2181bbb76a48b6e723cc3e';
    private $username = 'rdlcallcenter';
    private $callFrom = '+254709369980';
    
    public function index()
    {
        return Inertia::render('Voice/index', [
            'callFrom' => $this->callFrom,
            'username' => $this->username
        ]);
    }

    public function getCapabilityToken(Request $request)
    {
        $clientName = $request->input('client_name', 'agent_' . uniqid());
        
        Log::info('Generating capability token for: ' . $clientName);
        
        try {
            $payload = [
                'username' => $this->username,
                'clientName' => $clientName,
                'phoneNumber' => $this->callFrom
            ];
            
            Log::info('Request payload: ', $payload);
            
            // WebRTC API uses lowercase 'apiKey'
            $response = Http::withOptions([
                'verify' => true,
                'timeout' => 30,
            ])->withHeaders([
                'apiKey' => $this->apiKey,  // lowercase 'a'
                'Content-Type' => 'application/json',
                'Accept' => 'application/json'
            ])->post('https://webrtc.africastalking.com/capability-token/request', $payload);

            Log::info('Response status: ' . $response->status());
            Log::info('Response body: ' . $response->body());

            if ($response->successful()) {
                $data = $response->json();
                
                if (isset($data['errorMessage'])) {
                    Log::error('API returned error: ' . $data['errorMessage']);
                    return response()->json([
                        'success' => false,
                        'error' => $data['errorMessage']
                    ], 500);
                }
                
                if (!isset($data['token'])) {
                    Log::error('No token in response: ' . json_encode($data));
                    return response()->json([
                        'success' => false,
                        'error' => 'No token received from API',
                        'response' => $data
                    ], 500);
                }
                
                Cache::put("client_name_{$clientName}", $clientName, now()->addDay());
                Cache::put('default_agent', $clientName, now()->addDays(7));
                
                return response()->json([
                    'success' => true,
                    'token' => $data['token'],
                    'clientName' => $clientName,
                    'fullClientName' => $this->username . '.' . $clientName,
                    'lifeTimeSec' => $data['lifeTimeSec'] ?? 86400,
                    'incoming' => $data['incoming'] ?? true,
                    'outgoing' => $data['outgoing'] ?? true,
                    'message' => 'Token generated successfully'
                ]);
            }

            Log::error('Failed with status: ' . $response->status());
            Log::error('Response: ' . $response->body());

            return response()->json([
                'success' => false,
                'error' => 'Failed to get capability token. HTTP Status: ' . $response->status(),
                'details' => $response->body(),
                'request_payload' => $payload
            ], 400);

        } catch (\Exception $e) {
            Log::error('Error: ' . $e->getMessage());
            Log::error('Trace: ' . $e->getTraceAsString());
            
            return response()->json([
                'success' => false,
                'error' => 'Network error: ' . $e->getMessage(),
                'solution' => 'Check server connectivity to webrtc.africastalking.com'
            ], 500);
        }
    }

    public function makeCall(Request $request)
    {
        $request->validate([
            'phone_number' => 'required|string',
            'client_name' => 'required|string'
        ]);

        $phoneNumber = $request->input('phone_number');
        $clientName = $request->input('client_name');
        
        Log::info('Voice API call to: ' . $phoneNumber . ' with client: ' . $clientName);
        
        if (!str_starts_with($phoneNumber, '+')) {
            $phoneNumber = '+' . ltrim($phoneNumber, '0');
        }
        
        // Generate unique session ID for tracking
        $sessionId = 'outbound_' . uniqid() . '_' . time();
        
        // Store outbound call info BEFORE making the call
        Cache::put("outbound_call_{$sessionId}", [
            'client_name' => $clientName,
            'phone_number' => $phoneNumber,
            'initiated_at' => now(),
            'type' => 'outbound_agent_call'
        ], now()->addHours(2));
        
        // Also store by phone number for quick lookup
        Cache::put("active_outbound_{$phoneNumber}", $sessionId, now()->addHours(2));
        
        try {
            $callbackUrl = url('/api/webhooks/voice/callback');
            Log::info('Using callback URL: ' . $callbackUrl);
            
            // CRITICAL FIX: Voice API uses 'Apikey' with capital 'A'
            $response = Http::withOptions([
                'verify' => true,
                'timeout' => 30,
            ])->withHeaders([
                'Apikey' => $this->apiKey,  // Capital 'A' - this is the fix!
                'Content-Type' => 'application/x-www-form-urlencoded',
                'Accept' => 'application/json'
            ])->asForm()->post('https://voice.africastalking.com/call', [
                'username' => $this->username,
                'to' => $phoneNumber,
                'from' => $this->callFrom,
                'callbackUrl' => $callbackUrl
            ]);

            Log::info('Voice API response status: ' . $response->status());
            Log::info('Voice API response body: ' . $response->body());

            $responseData = $response->json();
            
            if (isset($responseData['errorMessage']) && $responseData['errorMessage'] !== 'None') {
                Log::error('Voice API error: ' . $responseData['errorMessage']);
                
                // Clean up cache on error
                Cache::forget("outbound_call_{$sessionId}");
                Cache::forget("active_outbound_{$phoneNumber}");
                
                return response()->json([
                    'success' => false,
                    'error' => $responseData['errorMessage']
                ], 500);
            }
            
            if (!$response->successful()) {
                Cache::forget("outbound_call_{$sessionId}");
                Cache::forget("active_outbound_{$phoneNumber}");
                
                return response()->json([
                    'success' => false,
                    'error' => 'Failed to initiate call',
                    'details' => $response->body()
                ], 500);
            }
            
            return response()->json([
                'success' => true,
                'message' => 'Call initiated successfully',
                'data' => $responseData,
                'session_id' => $sessionId,
                'note' => 'Call will connect automatically when answered'
            ]);

        } catch (\Exception $e) {
            Log::error('Voice API error: ' . $e->getMessage());
            Log::error('Trace: ' . $e->getTraceAsString());
            
            Cache::forget("outbound_call_{$sessionId}");
            Cache::forget("active_outbound_{$phoneNumber}");
            
            return response()->json([
                'success' => false,
                'error' => 'Network error: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * FIXED: Smart callback that auto-connects without showing incoming call UI
     */
    public function callCallback(Request $request)
    {
        Log::info('=== CALLBACK RECEIVED ===');
        Log::info('All request data:', $request->all());
        
        $isActive = $request->input('isActive', '0');
        $direction = $request->input('direction', '');
        $callSessionState = $request->input('callSessionState', '');
        $sessionId = $request->input('sessionId', '');
        $callerNumber = $request->input('callerNumber', '');
        $destinationNumber = $request->input('destinationNumber', '');
        
        Log::info("Direction: {$direction}, IsActive: {$isActive}, State: {$callSessionState}");
        Log::info("Caller: {$callerNumber}, Destination: {$destinationNumber}");
        
        $xml = '<?xml version="1.0" encoding="UTF-8"?>';
        $xml .= '<Response>';
        
        // Check if this is an outbound call we initiated
        $outboundSessionId = Cache::get("active_outbound_{$callerNumber}");
        $isOutboundCall = $outboundSessionId !== null;
        
        if ($isOutboundCall) {
            Log::info("IDENTIFIED AS OUTBOUND CALL - Session: {$outboundSessionId}");
            $outboundInfo = Cache::get("outbound_call_{$outboundSessionId}");
            
            if ($outboundInfo && $isActive == '1') {
                // Person answered - connect immediately to WebRTC client
                $clientName = $outboundInfo['client_name'];
                $fullClientName = $this->username . '.' . $clientName;
                
                Log::info("PERSON ANSWERED - AUTO-CONNECTING to agent: {$fullClientName}");
                
                // Mark as connected to prevent re-processing
                Cache::put("call_connected_{$sessionId}", true, now()->addHours(2));
                
                // NO Say tag - Direct connection
                $xml .= '<Dial phoneNumbers="' . htmlspecialchars($fullClientName) . '"';
                $xml .= ' callerId="' . htmlspecialchars($this->callFrom) . '"';
                $xml .= ' sequential="true"';
                $xml .= '>';
                $xml .= '<ClientId>' . htmlspecialchars($clientName) . '</ClientId>';
                $xml .= '</Dial>';
                
                // Clean up cache after connection
                Cache::forget("active_outbound_{$callerNumber}");
            } else {
                // Call is ringing or ended
                Log::info("Outbound call state: {$callSessionState}");
                if ($callSessionState === 'Completed' || $callSessionState === 'Failed') {
                    $xml .= '<Hangup/>';
                    Cache::forget("outbound_call_{$outboundSessionId}");
                    Cache::forget("active_outbound_{$callerNumber}");
                }
            }
        } 
        elseif ($direction === 'Inbound') {
            // Handle genuine inbound calls
            Log::info("GENUINE INBOUND CALL");
            
            // Check if it's a WebRTC client calling out
            if (strpos($callerNumber, $this->username . '.') === 0) {
                Log::info("WebRTC client making outbound call");
                
                if ($isActive == '1') {
                    $clientDialedNumber = $request->input('clientDialedNumber', '');
                    if ($clientDialedNumber) {
                        Log::info("Connecting WebRTC to: {$clientDialedNumber}");
                        $xml .= '<Dial phoneNumbers="' . htmlspecialchars($clientDialedNumber) . '"';
                        $xml .= ' callerId="' . htmlspecialchars($this->callFrom) . '"';
                        $xml .= '>';
                        $xml .= '</Dial>';
                    }
                }
            } else {
                // Regular phone calling your AT number
                if ($isActive == '1') {
                    $clientName = Cache::get('default_agent', 'agent_default');
                    $fullClientName = $this->username . '.' . $clientName;
                    
                    Log::info("Connecting inbound call to agent: {$fullClientName}");
                    
                    $xml .= '<Say voice="woman">Connecting you to an agent.</Say>';
                    $xml .= '<Dial phoneNumbers="' . htmlspecialchars($fullClientName) . '"';
                    $xml .= ' callerId="' . htmlspecialchars($this->callFrom) . '"';
                    $xml .= '>';
                    $xml .= '<ClientId>' . htmlspecialchars($clientName) . '</ClientId>';
                    $xml .= '</Dial>';
                }
            }
        } else {
            Log::info("Unknown call type - hanging up");
            $xml .= '<Hangup/>';
        }
        
        $xml .= '</Response>';
        
        Log::info('Returning XML: ' . $xml);
        
        return response($xml, 200)
            ->header('Content-Type', 'application/xml');
    }

    public function incomingCall(Request $request)
    {
        Log::info('=== INCOMING CALL RECEIVED ===');
        Log::info('Request data:', $request->all());
        
        $callerNumber = $request->input('callerNumber');
        $sessionId = $request->input('sessionId');
        
        $clientName = Cache::get('default_agent', 'agent_default');
        $fullClientName = $this->username . '.' . $clientName;
        
        Cache::put("incoming_call_{$sessionId}", [
            'caller' => $callerNumber,
            'agent' => $clientName,
            'time' => now()
        ], now()->addHours(2));
        
        $xml = '<?xml version="1.0" encoding="UTF-8"?>';
        $xml .= '<Response>';
        $xml .= '<Say voice="woman" playBeep="true">Thank you for calling. Please wait while we connect you to an agent.</Say>';
        $xml .= '<Dial phoneNumbers="' . htmlspecialchars($fullClientName) . '"';
        $xml .= ' sequential="true"';
        $xml .= ' record="false"';
        $xml .= ' callerId="' . $this->callFrom . '"';
        $xml .= ' ringbackTone="http://www.music.helsinki.fi/tmt/opetus/uusmedia/esim/a2002011001-e02-128k.ogg"';
        $xml .= '>';
        $xml .= '<ClientId>' . htmlspecialchars($clientName) . '</ClientId>';
        $xml .= '</Dial>';
        $xml .= '</Response>';
        
        Log::info('Incoming call XML:', ['xml' => $xml]);
        
        return response($xml, 200)
            ->header('Content-Type', 'application/xml')
            ->header('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
    
    public function handleDigits(Request $request)
    {
        $digits = $request->input('dtmfDigits');
        $sessionId = $request->input('sessionId');
        
        Log::info('DTMF digits received', [
            'digits' => $digits,
            'sessionId' => $sessionId
        ]);
        
        $xml = '<?xml version="1.0" encoding="UTF-8"?>';
        $xml .= '<Response>';
        
        switch ($digits) {
            case '1':
                $clientName = Cache::get('default_agent', 'agent_default');
                $xml .= '<Say voice="woman">Connecting you to an agent, please hold.</Say>';
                $xml .= '<Dial phoneNumbers="' . $this->username . '.' . $clientName . '" sequential="true" record="false" callerId="' . $this->callFrom . '">';
                $xml .= '<ClientId>' . htmlspecialchars($clientName) . '</ClientId>';
                $xml .= '</Dial>';
                break;
            case '2':
                $xml .= '<Say voice="woman">Our business hours are Monday to Friday, 9 AM to 5 PM. Thank you for calling.</Say>';
                $xml .= '<Reject />';
                break;
            default:
                $xml .= '<Say voice="woman">Invalid option selected. Please try again.</Say>';
                $xml .= '<Redirect>' . url('/api/webhooks/voice/incoming') . '</Redirect>';
        }
        
        $xml .= '</Response>';
        
        return response($xml, 200)
            ->header('Content-Type', 'application/xml');
    }
    
    public function setDefaultAgent(Request $request)
    {
        $request->validate([
            'client_name' => 'required|string'
        ]);
        
        $clientName = $request->input('client_name');
        Cache::put('default_agent', $clientName, now()->addDays(7));
        
        Log::info('Default agent set to: ' . $clientName);
        
        return response()->json([
            'success' => true,
            'message' => 'Default agent set successfully',
            'full_client_name' => $this->username . '.' . $clientName
        ]);
    }
    
    public function listActiveSessions()
    {
        $sessions = [];
        
        return response()->json([
            'success' => true,
            'sessions' => $sessions,
            'default_agent' => Cache::get('default_agent', 'Not set')
        ]);
    }
    
    public function testSystem(Request $request)
    {
        $testClient = 'test_' . time();
        
        try {
            $payload = [
                'username' => $this->username,
                'clientName' => $testClient,
                'phoneNumber' => $this->callFrom
            ];
            
            $response = Http::withOptions([
                'verify' => true,
                'timeout' => 10,
            ])->withHeaders([
                'apiKey' => $this->apiKey,  // lowercase for WebRTC
                'Content-Type' => 'application/json',
            ])->post('https://webrtc.africastalking.com/capability-token/request', $payload);
            
            $webrtcWorking = $response->successful();
            $webrtcData = $response->successful() ? ['token_received' => true] : $response->body();
            
        } catch (\Exception $e) {
            $webrtcWorking = false;
            $webrtcData = $e->getMessage();
        }
        
        return response()->json([
            'success' => true,
            'system_status' => [
                'webrtc_api' => $webrtcWorking ? 'Working' : 'Failed',
                'webrtc_details' => $webrtcData,
                'credentials' => [
                    'username' => $this->username,
                    'phone_number' => $this->callFrom,
                    'api_key_prefix' => substr($this->apiKey, 0, 10) . '...'
                ],
                'cache_status' => [
                    'default_agent' => Cache::get('default_agent', 'Not set'),
                    'driver' => config('cache.default')
                ]
            ],
            'next_steps' => [
                '1. Open voice interface and initialize client',
                '2. Make a test call from browser',
                '3. Check Laravel logs for callbacks',
                '4. Test incoming calls by dialing ' . $this->callFrom
            ]
        ]);
    }
}