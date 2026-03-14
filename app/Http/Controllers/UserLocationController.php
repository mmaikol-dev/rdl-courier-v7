<?php

namespace App\Http\Controllers;

use App\Models\UserLoginLocation;
use App\Models\UserLocation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserLocationController extends Controller
{
    public function heartbeat(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'accuracy_meters' => ['nullable', 'numeric', 'min:0'],
            'altitude_meters' => ['nullable', 'numeric'],
            'speed_mps' => ['nullable', 'numeric', 'min:0'],
            'heading_degrees' => ['nullable', 'numeric', 'between:0,360'],
            'event_type' => ['nullable', 'string', 'max:32'],
            'source' => ['nullable', 'string', 'max:32'],
        ]);

        $location = UserLocation::create([
            'user_id' => $request->user()->id,
            'latitude' => $validated['latitude'],
            'longitude' => $validated['longitude'],
            'accuracy_meters' => $validated['accuracy_meters'] ?? null,
            'altitude_meters' => $validated['altitude_meters'] ?? null,
            'speed_mps' => $validated['speed_mps'] ?? null,
            'heading_degrees' => $validated['heading_degrees'] ?? null,
            'event_type' => $validated['event_type'] ?? 'heartbeat',
            'source' => $validated['source'] ?? 'browser',
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'recorded_at' => now(),
        ]);

        return response()->json([
            'message' => 'Location captured',
            'location_id' => $location->id,
        ]);
    }

    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'accuracy_meters' => ['nullable', 'numeric', 'min:0'],
        ]);

        $loginLocationId = $request->session()->pull('login_location_id');

        $loginLocation = $loginLocationId
            ? UserLoginLocation::query()
                ->where('id', $loginLocationId)
                ->where('user_id', $request->user()->id)
                ->first()
            : null;

        if ($loginLocation) {
            $loginLocation->update([
                'latitude' => $validated['latitude'],
                'longitude' => $validated['longitude'],
                'accuracy_meters' => $validated['accuracy_meters'] ?? null,
                'source' => 'browser',
                'meta' => array_filter([
                    'captured_after_login' => true,
                ]),
            ]);
        } else {
            $loginLocation = UserLoginLocation::create([
                'user_id' => $request->user()->id,
                'latitude' => $validated['latitude'],
                'longitude' => $validated['longitude'],
                'accuracy_meters' => $validated['accuracy_meters'] ?? null,
                'source' => 'browser',
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'logged_in_at' => now(),
                'meta' => ['captured_after_login' => true],
            ]);
        }

        return response()->json([
            'message' => 'Login location saved',
            'login_location_id' => $loginLocation->id,
        ]);
    }
}
