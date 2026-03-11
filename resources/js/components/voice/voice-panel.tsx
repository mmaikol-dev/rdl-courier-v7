"use client";

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  Mic,
  Phone,
  PhoneIncoming,
  PhoneOff,
  Radio,
  Volume2,
  VolumeX,
  XCircle,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

// Type definitions for Africa's Talking
declare global {
  interface Window {
    Africastalking: {
      Client: new (token: string, options?: any) => any;
    };
  }
}

interface ClientInstance {
  call: (phoneNumber: string) => void;
  answer: () => void;
  hangup: () => void;
  muteAudio: () => void;
  unmuteAudio: () => void;
  isAudioMuted: () => boolean;
  getCounterpartNum: () => string;
  on: (event: string, callback: (data?: any) => void) => void;
  off?: (event: string, callback: (data?: any) => void) => void;
}

type VoicePanelVariant = 'compact' | 'full';

interface VoicePanelProps {
  variant?: VoicePanelVariant;
  initialPhoneNumber?: string;
  autoInitialize?: boolean;
}

const API_BASE_URL = '/api';

// Persist client across unmounts (e.g., closing drawer / navigating)
let globalVoiceClient: ClientInstance | null = null;
let globalClientToken: string | null = null;
let globalClientName: string | null = null;

export default function VoicePanel({ variant = 'compact', initialPhoneNumber = '', autoInitialize = false }: VoicePanelProps) {
  const [phoneNumber, setPhoneNumber] = React.useState('');
  const [callStatus, setCallStatus] = React.useState<'idle' | 'connecting' | 'ringing' | 'active' | 'ended'>('idle');
  const [clientToken, setClientToken] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isMuted, setIsMuted] = React.useState(false);
  const [clientName, setClientName] = React.useState('');
  const [callDuration, setCallDuration] = React.useState(0);
  const [isInitializing, setIsInitializing] = React.useState(false);
  const [libraryLoadError, setLibraryLoadError] = React.useState(false);
  const [incomingCallInfo, setIncomingCallInfo] = React.useState<{ from: string; time: Date } | null>(null);
  const [activeCallNumber, setActiveCallNumber] = React.useState('');

  const clientRef = React.useRef<ClientInstance | null>(null);
  const callTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const presenceTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const [isLibraryLoaded, setIsLibraryLoaded] = React.useState(false);
  const [showIncomingCallAlert, setShowIncomingCallAlert] = React.useState(false);
  const callStatusRef = React.useRef(callStatus);
  const showIncomingCallAlertRef = React.useRef(showIncomingCallAlert);

  const showDetails = variant === 'full';

  React.useEffect(() => {
    const scriptId = 'africastalking-script';

    const loadLibrary = () => {
      if (document.getElementById(scriptId)) {
        if (window.Africastalking) {
          setIsLibraryLoaded(true);
        }
        return;
      }

      if (typeof window !== 'undefined' && !window.Africastalking) {
        const script = document.createElement('script');
        script.id = scriptId;
        script.src = 'https://unpkg.com/africastalking-client@1.0.6/build/africastalking.js';
        script.async = true;
        script.onload = () => {
          setIsLibraryLoaded(true);
          setLibraryLoadError(false);
        };
        script.onerror = () => {
          setLibraryLoadError(true);
          setError('Failed to load voice calling library. Please refresh the page.');
        };
        document.body.appendChild(script);
      } else if (window.Africastalking) {
        setIsLibraryLoaded(true);
      }
    };

    loadLibrary();

    return () => {
      cleanupCall();
    };
  }, []);

  // Restore existing client if it was initialized before unmount
  React.useEffect(() => {
    if (globalVoiceClient && globalClientToken && globalClientName) {
      clientRef.current = globalVoiceClient;
      setClientToken(globalClientToken);
      setClientName(globalClientName);
      setCallStatus('idle');
      setError(null);
      setIsInitializing(false);
    }
  }, []);

  React.useEffect(() => {
    if (!initialPhoneNumber) {
      return;
    }

    // Sync parent-selected number when panel opens; avoid clobbering while a call is active.
    if (callStatus === 'idle') {
      setPhoneNumber(initialPhoneNumber);
    }
  }, [initialPhoneNumber, callStatus]);

  const publishPresence = React.useCallback(async (status: 'ready' | 'busy' | 'offline' | 'away') => {
    if (!clientName) {
      return;
    }
    try {
      await fetch(`${API_BASE_URL}/voice/agent-presence`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          client_name: clientName,
          status,
          metadata: {
            source: 'voice-panel',
            variant,
            active_call_number: activeCallNumber || null,
          },
        }),
      });
    } catch {
      // no-op, next heartbeat will retry
    }
  }, [clientName, variant, activeCallNumber]);

  React.useEffect(() => {
    if (!clientToken || !clientName) {
      return;
    }

    const status: 'ready' | 'busy' = callStatus === 'idle' ? 'ready' : 'busy';
    void publishPresence(status);

    if (presenceTimerRef.current) {
      clearInterval(presenceTimerRef.current);
    }
    presenceTimerRef.current = setInterval(() => {
      const heartbeatStatus: 'ready' | 'busy' = callStatusRef.current === 'idle' ? 'ready' : 'busy';
      void publishPresence(heartbeatStatus);
    }, 20000);

    return () => {
      if (presenceTimerRef.current) {
        clearInterval(presenceTimerRef.current);
        presenceTimerRef.current = null;
      }
    };
  }, [clientToken, clientName, publishPresence]);

  React.useEffect(() => {
    if (!autoInitialize) {
      return;
    }
    if (!isLibraryLoaded || libraryLoadError || isInitializing || clientToken || clientRef.current) {
      return;
    }

    void initializeClient(true);
  }, [autoInitialize, isLibraryLoaded, libraryLoadError, isInitializing, clientToken]);

  const cleanupCall = () => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }

    setIsMuted(false);
    setCallDuration(0);
    setActiveCallNumber('');
  };

  React.useEffect(() => {
    callStatusRef.current = callStatus;
    if (callStatus === 'active') {
      callTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
      if (callStatus === 'idle') {
        setCallDuration(0);
      }
    }

    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
    };
  }, [callStatus]);
  
  React.useEffect(() => {
    showIncomingCallAlertRef.current = showIncomingCallAlert;
  }, [showIncomingCallAlert]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const validatePhoneNumber = (number: string): boolean => {
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(number);
  };

  const initializeClient = async (isAuto = false) => {
    if (clientRef.current && clientToken) {
      setIsInitializing(false);
      setCallStatus('idle');
      return;
    }

    try {
      setError(null);
      setIsInitializing(true);
      if (!isAuto) {
        toast.info('Initializing voice client...');
      }
      const initTimeout = setTimeout(() => {
        setIsInitializing(false);
        setError('Initialization timed out. Please try again.');
        toast.error('Voice client initialization timed out.');
      }, 15000);

      const response = await fetch(`${API_BASE_URL}/voice/capability-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          client_name: `agent_${Date.now()}`
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to get capability token');
      }

      if (!data.token) {
        throw new Error('No token received from server');
      }

      setClientToken(data.token);
      setClientName(data.clientName || `agent_${Date.now()}`);

      if (window.Africastalking) {
        const client = new window.Africastalking.Client(data.token);

        const handleReady = () => {
          setCallStatus('idle');
          setError(null);
          setIsInitializing(false);
          clearTimeout(initTimeout);
          toast.success('Voice client is ready.');
        };

        const handleIncomingCall = (call: any) => {
          const from = call.from || 'Unknown';
          const currentStatus = callStatusRef.current;

          // If this is the callback leg from an outbound call, auto-answer immediately
          if (currentStatus === 'connecting' || currentStatus === 'ringing') {
            setActiveCallNumber(from);
            setCallStatus('active');
            setTimeout(() => {
              answerIncomingCall();
            }, 200);
            return;
          }

          setIncomingCallInfo({
            from,
            time: new Date(),
          });
          setShowIncomingCallAlert(true);
          setCallStatus('ringing');
          setActiveCallNumber(from);

          // For true inbound calls, allow user to answer (auto-answer after 15s)
          setTimeout(() => {
            if (callStatusRef.current === 'ringing' && showIncomingCallAlertRef.current) {
              answerIncomingCall();
            }
          }, 15000);
        };

        const handleCallAccepted = () => {
          setCallStatus('active');
          setShowIncomingCallAlert(false);
          setIncomingCallInfo(null);
        };

        const handleCallEnded = () => {
          setCallStatus('ended');
          setIsMuted(false);
          setShowIncomingCallAlert(false);
          setIncomingCallInfo(null);
          setTimeout(() => {
            setCallStatus('idle');
            setActiveCallNumber('');
          }, 2000);
        };

        const handleCallFailed = (err: any) => {
          setError(`Call failed: ${err.message || 'Unknown error'}`);
          setCallStatus('idle');
          setShowIncomingCallAlert(false);
          setIncomingCallInfo(null);
          setActiveCallNumber('');
          setIsInitializing(false);
          clearTimeout(initTimeout);
        };

        const handleHangup = () => {
          handleCallEnded();
        };

        const handleNotReady = () => {
          setError('Client connection lost. Please reinitialize.');
          setCallStatus('idle');
          setIsInitializing(false);
          clearTimeout(initTimeout);
        };

        const handleOffline = () => {
          setError('Connection lost. Please reinitialize the client.');
          setCallStatus('idle');
          setClientToken(null);
          setIsInitializing(false);
          clearTimeout(initTimeout);
        };

        client.on('ready', handleReady);
        client.on('incomingcall', handleIncomingCall);
        client.on('callaccepted', handleCallAccepted);
        client.on('callended', handleCallEnded);
        client.on('callfailed', handleCallFailed);
        client.on('hangup', handleHangup);
        client.on('notready', handleNotReady);
        client.on('offline', handleOffline);

        clientRef.current = {
          call: (number: string) => client.call(number),
          answer: () => client.answer(),
          hangup: () => client.hangup(),
          muteAudio: () => client.muteAudio(),
          unmuteAudio: () => client.unmuteAudio(),
          isAudioMuted: () => client.isAudioMuted(),
          getCounterpartNum: () => client.getCounterpartNum(),
          on: (event: string, callback: (data?: any) => void) => client.on(event, callback),
          off: client.off ? (event: string, callback: (data?: any) => void) => client.off(event, callback) : undefined,
        };

        globalVoiceClient = clientRef.current;
        globalClientToken = data.token;
        globalClientName = data.clientName || `agent_${Date.now()}`;
      } else {
        throw new Error('Africa\'s Talking library not loaded');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to initialize call client');
      setIsInitializing(false);
      toast.error(err.message || 'Failed to initialize voice client.');
    }
  };

  const answerIncomingCall = () => {
    try {
      if (!clientRef.current) {
        setError('Client not initialized');
        return;
      }

      clientRef.current.answer();
      setCallStatus('active');
      setShowIncomingCallAlert(false);
      setIncomingCallInfo(null);
    } catch {
      setError('Failed to answer incoming call');
      setCallStatus('idle');
    }
  };

  const rejectIncomingCall = () => {
    try {
      if (clientRef.current) {
        clientRef.current.hangup();
      }
      setShowIncomingCallAlert(false);
      setIncomingCallInfo(null);
      setCallStatus('idle');
    } catch {
      // no-op
    }
  };

  const makeCall = async () => {
    if (!phoneNumber) {
      setError('Please enter a phone number');
      return;
    }

    if (!validatePhoneNumber(phoneNumber)) {
      setError('Please enter a valid phone number in international format');
      return;
    }

    try {
      setError(null);
      setCallStatus('connecting');
      setActiveCallNumber(phoneNumber);

      const response = await fetch(`${API_BASE_URL}/voice/make-call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          phone_number: phoneNumber,
          client_name: clientName,
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to make call');
      }

      setCallStatus('ringing');
    } catch (err: any) {
      setError(err.message || 'Failed to make call');
      setCallStatus('idle');
      setActiveCallNumber('');
    }
  };

  const hangUp = () => {
    try {
      if (clientRef.current) {
        clientRef.current.hangup();
      }
      setCallStatus('idle');
      setIsMuted(false);
      setShowIncomingCallAlert(false);
      setIncomingCallInfo(null);
      setActiveCallNumber('');
    } catch {
      setError('Failed to hang up call');
    }
  };

  const toggleMute = () => {
    try {
      if (clientRef.current) {
        if (isMuted) {
          clientRef.current.unmuteAudio();
        } else {
          clientRef.current.muteAudio();
        }
        setIsMuted(!isMuted);
      }
    } catch {
      setError('Failed to toggle mute');
    }
  };

  const getStatusColor = () => {
    switch (callStatus) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'connecting':
      case 'ringing':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'ended':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const getStatusText = () => {
    switch (callStatus) {
      case 'connecting':
        return 'Connecting...';
      case 'ringing':
        return 'Ringing...';
      case 'active':
        return 'Call Active';
      case 'ended':
        return 'Call Ended';
      default:
        return 'Ready';
    }
  };

  const getStatusIcon = () => {
    switch (callStatus) {
      case 'active':
        return <Radio className="h-4 w-4 animate-pulse" />;
      case 'connecting':
      case 'ringing':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'ended':
        return <PhoneOff className="h-4 w-4" />;
      default:
        return <Phone className="h-4 w-4" />;
    }
  };

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\+?[0-9]*$/.test(value)) {
      setPhoneNumber(value);
    }
  };

  const resetClient = () => {
    cleanupCall();
    if (clientRef.current) {
      try {
        clientRef.current.hangup();
      } catch {
        // no-op
      }
    }
    setClientToken(null);
    setClientName('');
    setPhoneNumber('');
    setError(null);
    setCallStatus('idle');
    setIncomingCallInfo(null);
    setShowIncomingCallAlert(false);
    setActiveCallNumber('');
    clientRef.current = null;
    globalVoiceClient = null;
    globalClientToken = null;
    globalClientName = null;
    void publishPresence('offline');
  };

  React.useEffect(() => {
    return () => {
      if (presenceTimerRef.current) {
        clearInterval(presenceTimerRef.current);
        presenceTimerRef.current = null;
      }
      if (globalClientName || clientName) {
        const finalClientName = globalClientName || clientName;
        void fetch(`${API_BASE_URL}/voice/agent-presence`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            client_name: finalClientName,
            status: 'offline',
            metadata: { source: 'voice-panel-unmount' },
          }),
          keepalive: true,
        }).catch(() => undefined);
      }
    };
  }, [clientName]);

  return (
    <div className={showDetails ? 'space-y-6 p-4' : 'space-y-4'}>
      {libraryLoadError && (
        <Alert variant="destructive" className="animate-in fade-in duration-300">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load voice calling library. Please refresh the page or check your internet connection.
          </AlertDescription>
        </Alert>
      )}

      {showIncomingCallAlert && incomingCallInfo && (
        <Alert className="border-blue-300 bg-blue-50 animate-in slide-in-from-top duration-300">
          <PhoneIncoming className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <div className="flex flex-col gap-2">
              <div className="font-semibold">Incoming Call!</div>
              <div>From: {incomingCallInfo.from}</div>
              <div className="flex gap-2 mt-2">
                <Button onClick={answerIncomingCall} size="sm" className="bg-green-600 hover:bg-green-700">
                  <Phone className="h-4 w-4 mr-2" />
                  Answer
                </Button>
                <Button onClick={rejectIncomingCall} size="sm" variant="destructive">
                  <PhoneOff className="h-4 w-4 mr-2" />
                  Reject
                </Button>
              </div>
              <div className="text-xs text-blue-600 mt-1">Auto-answering in 15 seconds...</div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className={showDetails ? 'grid gap-6 lg:grid-cols-3' : 'grid gap-4'}>
        <div className={showDetails ? 'lg:col-span-2' : ''}>
          <Card className="shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl flex items-center gap-2">Call Interface</CardTitle>
                  <CardDescription>Make outbound calls to clients</CardDescription>
                </div>
                <Badge variant="outline" className={`${getStatusColor()} border text-sm px-3 py-1`}>
                  <span className="flex items-center gap-2">
                    {getStatusIcon()}
                    {getStatusText()}
                  </span>
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {clientName && (
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200 animate-in fade-in duration-300">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-blue-600" />
                    <span className="text-blue-700">
                      <strong>Agent ID:</strong> {clientName}
                    </span>
                  </div>
                  <div className="text-xs text-blue-600">{clientToken ? 'Connected' : 'Disconnected'}</div>
                </div>
              )}

              {activeCallNumber && (callStatus === 'connecting' || callStatus === 'ringing' || callStatus === 'active') && (
                <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-indigo-600" />
                      <span className="text-indigo-700 font-medium">
                        {callStatus === 'active' ? 'Connected to:' : 'Calling:'}
                      </span>
                    </div>
                    <span className="text-indigo-900 font-semibold">{activeCallNumber}</span>
                  </div>
                </div>
              )}

              {error && (
                <Alert variant="destructive" className="animate-in fade-in duration-300">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {isInitializing && (
                <Alert className="border-blue-300 bg-blue-50 animate-in fade-in duration-300">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  <AlertDescription className="text-blue-800">
                    Initializing voice client in this drawer...
                  </AlertDescription>
                </Alert>
              )}

              {!clientToken && !error && (
                <Alert className="border-blue-300 bg-blue-50">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800">
                    Click "Initialize Call Client" to start. You&apos;ll need to allow microphone permissions when prompted.
                  </AlertDescription>
                </Alert>
              )}

              {!clientToken && (
                <Button
                  onClick={() => void initializeClient(false)}
                  disabled={!isLibraryLoaded || libraryLoadError || isInitializing}
                  className="w-full"
                  size="lg"
                >
                  {isInitializing ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Initializing...
                    </>
                  ) : isLibraryLoaded ? (
                    <>
                      <Phone className="mr-2 h-5 w-5" />
                      Initialize Call Client
                    </>
                  ) : (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Loading Library...
                    </>
                  )}
                </Button>
              )}

              {clientToken && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-medium flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Phone Number
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+254712345678"
                      value={phoneNumber}
                      onChange={handlePhoneNumberChange}
                      disabled={callStatus !== 'idle'}
                      className="text-lg h-12"
                      pattern="^\+[1-9]\d{1,14}$"
                    />
                    <div className="flex justify-between items-center">
                      <p className="text-xs text-muted-foreground">
                        Enter number in international format (e.g., +254712345678)
                      </p>
                      {phoneNumber && !validatePhoneNumber(phoneNumber) && (
                        <p className="text-xs text-red-500">Invalid format</p>
                      )}
                    </div>
                  </div>

                  {callStatus === 'idle' && (
                    <Button
                      onClick={makeCall}
                      className="w-full bg-green-600 hover:bg-green-700"
                      size="lg"
                      disabled={!phoneNumber || !validatePhoneNumber(phoneNumber)}
                    >
                      <Phone className="mr-2 h-5 w-5" />
                      Make Call
                    </Button>
                  )}

                  {(callStatus === 'connecting' || callStatus === 'ringing' || callStatus === 'active') && (
                    <div className="space-y-4">
                      {callStatus === 'active' && (
                        <div className="text-center p-6 bg-green-50 rounded-lg border border-green-200 animate-in fade-in duration-300">
                          <div className="flex flex-col items-center gap-3">
                            <div className="w-4 h-4 bg-green-500 rounded-full animate-pulse" />
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-green-700">Connected - Live Call</p>
                              <div className="flex items-center justify-center gap-2 text-2xl font-bold text-green-800">
                                <Clock className="h-6 w-6" />
                                {formatDuration(callDuration)}
                              </div>
                              <p className="text-xs text-green-600">You can now talk with the client</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {(callStatus === 'connecting' || callStatus === 'ringing') && (
                        <div className="text-center p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                          <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-8 w-8 animate-spin text-yellow-600" />
                            <p className="text-yellow-700 font-medium">
                              {callStatus === 'connecting' ? 'Connecting to server...' : 'Ringing...'}
                            </p>
                            <p className="text-sm text-yellow-600">Calling: {activeCallNumber}</p>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <Button onClick={hangUp} variant="destructive" size="lg" className="col-span-2">
                          <PhoneOff className="mr-2 h-5 w-5" />
                          {callStatus === 'active' ? 'End Call' : 'Cancel Call'}
                        </Button>

                        {callStatus === 'active' && (
                          <Button
                            onClick={toggleMute}
                            variant={isMuted ? 'destructive' : 'outline'}
                            size="lg"
                            className="col-span-2"
                          >
                            {isMuted ? (
                              <>
                                <VolumeX className="mr-2 h-5 w-5" />
                                Unmute Microphone
                              </>
                            ) : (
                              <>
                                <Volume2 className="mr-2 h-5 w-5" />
                                Mute Microphone
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {showDetails && (
          <div className="space-y-6">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  How It Works
                </CardTitle>
                <CardDescription>Follow these steps to make a call</CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3 text-sm">
                  {[
                    'Click "Initialize Call Client" to set up WebRTC',
                    'Allow microphone permissions when prompted',
                    'Enter phone number in international format (+254...)',
                    'Click "Make Call" - the client will receive the call',
                    'When connected, both parties can hear each other',
                    'Use "Mute" to mute your microphone during call',
                    'Click "Hang Up" to end the call',
                    'Receive incoming calls in the incoming call alert'
                  ].map((step, index) => (
                    <li key={index} className="flex gap-3">
                      <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-semibold text-xs">
                        {index + 1}
                      </span>
                      <span className="text-muted-foreground">{step}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>

            <Card className="shadow-lg border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="text-lg text-green-800 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" />
                  System Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-green-700">Library Loaded</span>
                    <Badge
                      variant={isLibraryLoaded ? 'default' : 'secondary'}
                      className={isLibraryLoaded ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}
                    >
                      {isLibraryLoaded ? '✓ Yes' : '✗ No'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-green-700">Client Initialized</span>
                    <Badge
                      variant={clientToken ? 'default' : 'secondary'}
                      className={clientToken ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}
                    >
                      {clientToken ? '✓ Yes' : '✗ No'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-green-700">Current Status</span>
                    <Badge variant="outline" className={`${getStatusColor()} border`}>
                      {getStatusText()}
                    </Badge>
                  </div>
                  {clientName && (
                    <div className="pt-2 border-t border-green-200">
                      <p className="text-xs text-green-600">
                        <strong>Agent ID:</strong> {clientName}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-lg border-orange-200 bg-orange-50">
              <CardHeader>
                <CardTitle className="text-lg text-orange-800 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Troubleshooting
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-orange-700">
                  {[
                    'The call() method returns undefined - this is normal',
                    'Events are handled at client level, not call object level',
                    'Ensure microphone permissions are granted',
                    'Verify phone number format is correct',
                    'Check Africa\'s Talking dashboard for credits',
                    'Reinitialize client if connection drops'
                  ].map((tip, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-orange-500 mt-0.5">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {clientToken && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Mic className="h-3 w-3" />
          Make sure your microphone permissions are enabled.
          <Button variant="link" className="p-0 text-xs" onClick={resetClient}>
            Reset Client
          </Button>
        </div>
      )}
    </div>
  );
}
