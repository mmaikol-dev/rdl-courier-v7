<?php

namespace App\Http\Controllers;

use App\Models\MerchantApiIntegration;
use App\Models\MerchantApiRequestLog;
use App\Models\StoreepIntegration;
use App\Support\SidebarRegistry;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;

class MerchantApiDashboardController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $isManager = SidebarRegistry::canManage($user?->roles);
        $isMerchant = strtolower(trim((string) $user?->roles)) === 'merchant';
        abort_unless($isManager || $isMerchant, 403);

        return Inertia::render('merchant-api-dashboard/index', [
            'canManage' => $isManager,
            'dashboardData' => Inertia::defer(function () use ($user, $isManager): array {
        $integrations = MerchantApiIntegration::query()
            ->with('merchantUser:id,name,email')
            ->when(! $isManager, fn ($query) => $query->where('merchant_user_id', $user->id));
        $integrationIds = (clone $integrations)->pluck('id');

        $since = now()->subHours(24);
        $requests = MerchantApiRequestLog::query()
            ->whereIn('merchant_api_integration_id', $integrationIds)
            ->where('requested_at', '>=', $since);

        $requestCount = (clone $requests)->count();
        $errorCount = (clone $requests)->where('status_code', '>=', 400)->count();
        $averageLatency = (int) round((float) ((clone $requests)->avg('duration_ms') ?? 0));
        $successRate = $requestCount > 0 ? round((($requestCount - $errorCount) / $requestCount) * 100, 1) : null;

        $endpointStats = (clone $requests)
            ->selectRaw('path, method, COUNT(*) as requests, SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as errors, AVG(duration_ms) as latency, MAX(duration_ms) as slowest, MAX(requested_at) as last_seen')
            ->groupBy('path', 'method')
            ->orderByDesc('requests')
            ->get()
            ->map(fn ($row) => [
                'path' => $row->path,
                'method' => $row->method,
                'requests' => (int) $row->requests,
                'errors' => (int) $row->errors,
                'latency' => (int) round((float) $row->latency),
                'slowest' => (int) $row->slowest,
                'last_seen' => $row->last_seen,
            ]);

        $timeline = (clone $requests)
            ->selectRaw('DATE_FORMAT(requested_at, "%Y-%m-%d %H:00:00") as bucket, COUNT(*) as requests, SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as errors, AVG(duration_ms) as latency')
            ->groupBy('bucket')
            ->orderBy('bucket')
            ->get()
            ->keyBy(fn ($row) => Carbon::parse($row->bucket)->format('Y-m-d H'));

        $chart = collect(range(23, 0))->map(function (int $hoursAgo) use ($timeline): array {
            $hour = now()->subHours($hoursAgo)->startOfHour();
            $row = $timeline->get($hour->format('Y-m-d H'));

            return [
                'time' => $hour->format('H:i'),
                'requests' => (int) ($row?->requests ?? 0),
                'errors' => (int) ($row?->errors ?? 0),
                'latency' => (int) round((float) ($row?->latency ?? 0)),
            ];
        })->values();

        $latestLogs = (clone $requests)
            ->with('integration:id,name,merchant_user_id')
            ->latest('requested_at')
            ->limit(50)
            ->get(['id', 'merchant_api_integration_id', 'method', 'path', 'status_code', 'duration_ms', 'requested_at'])
            ->map(fn ($log) => [
                'id' => $log->id,
                'integration' => $log->integration?->name ?? 'Deleted integration',
                'method' => $log->method,
                'path' => $log->path,
                'status_code' => $log->status_code,
                'duration_ms' => $log->duration_ms,
                'requested_at' => $log->requested_at?->toDateTimeString(),
            ]);

        $integrationRows = (clone $integrations)->latest('id')->get()->map(function ($integration) use ($since): array {
            $stats = MerchantApiRequestLog::query()
                ->where('merchant_api_integration_id', $integration->id)
                ->where('requested_at', '>=', $since)
                ->selectRaw('COUNT(*) as requests, SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as errors, AVG(duration_ms) as latency')
                ->first();

            return [
                'id' => $integration->id,
                'name' => $integration->name,
                'merchant' => $integration->merchantUser?->name,
                'email' => $integration->merchantUser?->email,
                'active' => $integration->is_active && (bool) $integration->merchantUser?->merchant_api_enabled,
                'last_used_at' => $integration->last_used_at?->toDateTimeString(),
                'requests' => (int) ($stats?->requests ?? 0),
                'errors' => (int) ($stats?->errors ?? 0),
                'latency' => (int) round((float) ($stats?->latency ?? 0)),
            ];
        });

        $externalConnections = StoreepIntegration::query()
            ->with('sheet:id,sheet_name')
            ->when(! $isManager, fn ($query) => $query->whereHas('sheet', fn ($sheet) => $sheet->where('sheet_name', $user->name)))
            ->latest('id')
            ->get(['id', 'sheets_id', 'store_name', 'is_enabled', 'last_synced_at', 'last_error_at'])
            ->map(fn (StoreepIntegration $integration) => [
                'id' => $integration->id,
                'provider' => 'Storeep',
                'name' => $integration->store_name,
                'merchant' => $integration->sheet?->sheet_name,
                'active' => $integration->is_enabled,
                'has_error' => $integration->last_error_at !== null,
                'last_error_at' => $integration->last_error_at?->toDateTimeString(),
                'last_activity_at' => $integration->last_synced_at?->toDateTimeString(),
            ]);

            return [
            'stats' => [
                'requests' => $requestCount,
                'errors' => $errorCount,
                'latency' => $averageLatency,
                'success_rate' => $successRate,
                'active_integrations' => (clone $integrations)
                    ->where('is_active', true)
                    ->whereHas('merchantUser', fn ($query) => $query->where('merchant_api_enabled', true))
                    ->count(),
                'total_integrations' => (clone $integrations)->count(),
            ],
            'chart' => $chart,
            'endpointStats' => $endpointStats,
            'logs' => $latestLogs,
            'integrations' => $integrationRows,
            'externalConnections' => $externalConnections,
            ];
            }, 'dashboardData'),
        ]);
    }

}
