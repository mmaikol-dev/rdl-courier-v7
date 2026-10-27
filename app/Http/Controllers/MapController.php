<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\UserLoginLocation;
use App\Models\UserLocation;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class MapController extends Controller
{
    public function index(Request $request): Response
    {
        $selectedUserId = $request->integer('user_id');
        $showAllUsers = $request->boolean('all_users');
        $trailWindowHours = collect([1, 3, 6, 12, 24])
            ->first(fn (int $hours) => $hours === $request->integer('trail_hours'), 6);

        $mapData = Inertia::defer(function () use ($selectedUserId, $showAllUsers, $trailWindowHours) {
            $users = User::query()
                ->select('id', 'name', 'email', 'roles')
                ->orderBy('name')
                ->get();

            $activeLocations = UserLocation::query()
                ->with('user:id,name,email,roles')
                ->where('recorded_at', '>=', now()->subHours(12))
                ->latest('recorded_at')
                ->get()
                ->unique('user_id')
                ->values()
                ->map(fn (UserLocation $location) => [
                    'id' => $location->id,
                    'user_id' => $location->user_id,
                    'user_name' => $location->user?->name,
                    'user_email' => $location->user?->email,
                    'user_role' => $location->user?->roles,
                    'latitude' => $location->latitude,
                    'longitude' => $location->longitude,
                    'accuracy_meters' => $location->accuracy_meters,
                    'event_type' => $location->event_type,
                    'source' => $location->source,
                    'recorded_at' => optional($location->recorded_at)->toIso8601String(),
                ]);

            $loginLocations = UserLoginLocation::query()
                ->with('user:id,name,email,roles')
                ->where('logged_in_at', '>=', now()->subDays(7))
                ->whereNotNull('latitude')
                ->whereNotNull('longitude')
                ->latest('logged_in_at')
                ->limit(250)
                ->get()
                ->map(fn (UserLoginLocation $location) => [
                    'id' => $location->id,
                    'user_id' => $location->user_id,
                    'user_name' => $location->user?->name,
                    'user_email' => $location->user?->email,
                    'user_role' => $location->user?->roles,
                    'latitude' => $location->latitude,
                    'longitude' => $location->longitude,
                    'accuracy_meters' => $location->accuracy_meters,
                    'source' => $location->source,
                    'logged_in_at' => optional($location->logged_in_at)->toIso8601String(),
                ]);

            $resolvedUserId = $selectedUserId;
            if (! $resolvedUserId && ! $showAllUsers) {
                $resolvedUserId = $activeLocations
                    ->sortByDesc(fn ($location) => strtolower((string) $location['user_role']) === 'agent')
                    ->pluck('user_id')
                    ->first();
            }

            $selectedUser = $resolvedUserId
                ? User::query()->select('id', 'name', 'email', 'roles')->find($resolvedUserId)
                : null;

            $selectedUserTrail = $selectedUser
                ? UserLocation::query()
                    ->where('user_id', $selectedUser->id)
                    ->where('recorded_at', '>=', now()->subHours($trailWindowHours))
                    ->oldest('recorded_at')
                    ->limit(250)
                    ->get()
                    ->map(fn (UserLocation $location) => [
                        'id' => $location->id,
                        'latitude' => $location->latitude,
                        'longitude' => $location->longitude,
                        'accuracy_meters' => $location->accuracy_meters,
                        'speed_mps' => $location->speed_mps,
                        'heading_degrees' => $location->heading_degrees,
                        'recorded_at' => optional($location->recorded_at)->toIso8601String(),
                    ])
                : [];

            return [
                'users' => $users,
                'activeLocations' => $activeLocations,
                'loginLocations' => $loginLocations,
                'selectedUserId' => $resolvedUserId,
                'selectedUserTrail' => $selectedUserTrail,
                'trailWindowHours' => $trailWindowHours,
                'trackingSummary' => [
                    'trackedUsers' => $activeLocations->count(),
                    'loginPins' => $loginLocations->count(),
                    'agentsOnline' => $activeLocations->filter(fn ($location) => strtolower((string) $location['user_role']) === 'agent')->count(),
                ],
            ];
        });

        return Inertia::render('maps/index', ['mapData' => $mapData]);
    }
}
