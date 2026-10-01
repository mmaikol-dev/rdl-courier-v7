<?php

namespace App\Http\Controllers;

use App\Exports\ReportOrdersExport;
use App\Models\Sheet;
use App\Models\SheetOrder;
use App\Models\User;
use App\Support\CountryAccess;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Maatwebsite\Excel\Facades\Excel;
use Log;

class ReportController extends Controller
{
    /**
     * Statuses offered on the report screen. Kept in sync with the order board.
     */
    private const STATUS_OPTIONS = [
        'Scheduled',
        'Dispatched',
        'Followup',
        SheetOrder::NEW_ORDERS_STATUS,
        'Pending',
        'Delivered',
        'Cancelled',
        'Expired',
        'Returned',
        'WrongContact',
    ];

    /**
     * Which order timestamp the date window is applied to.
     */
    private const DATE_FIELDS = ['delivery_date', 'order_date'];

    private const PREVIEW_PAGE_SIZE = 50;

    public function index(Request $request)
    {
        $user = $request->user()?->loadMissing('country');

        return Inertia::render('report/index', [
            'merchants' => $this->availableMerchants($user),
            'statuses' => self::STATUS_OPTIONS,
            'dateFields' => self::DATE_FIELDS,
            'isMerchantUser' => $this->merchantScope($user) !== null,
        ]);
    }

    /**
     * Return the rows the current filters resolve to, so the operator can
     * confirm the selection before generating the workbook.
     */
    public function preview(Request $request)
    {
        try {
            $user = $request->user()?->loadMissing('country');
            $filters = $this->validatedFilters($request);

            $query = $this->reportQuery($user, $filters);

            $total = (clone $query)->count();

            $page = max(1, (int) $request->input('page', 1));

            $rows = $this->previewPage($query, $page)
                ->map(fn (SheetOrder $order) => $this->previewRow($order, $filters['date_field']))
                ->all();

            $hasMore = $page * self::PREVIEW_PAGE_SIZE < $total;

            return response()->json([
                'success' => true,
                'total' => $total,
                'rows' => $rows,
                'page' => $page,
                'has_more' => $hasMore,
                'applied' => $this->describeFilters($filters),
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->errors()[array_key_first($e->errors())][0] ?? 'Invalid filters.',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Throwable $e) {
            Log::error('Report preview failed: ' . $e->getMessage(), [
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Could not build the preview. Please try again.',
            ], 500);
        }
    }

    public function download(Request $request)
    {
        try {
            $user = $request->user()?->loadMissing('country');
            $filters = $this->validatedFilters($request);

            $query = $this->reportQuery($user, $filters);
            $total = (clone $query)->count();

            if ($total === 0) {
                return back()->withErrors([
                    'from' => 'No orders match these filters. Adjust the date range or filters and try again.',
                ]);
            }

            $filename = 'orders_report_'
                . ($filters['date_field'] === 'order_date' ? 'by_order_date' : 'by_delivery_date')
                . '_' . Carbon::now('Africa/Nairobi')->format('Ymd_His') . '.xlsx';

            return Excel::download(new ReportOrdersExport($query), $filename);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return back()->withErrors($e->errors());
        } catch (\Throwable $e) {
            Log::error('Report download failed: ' . $e->getMessage(), [
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json([
                'error' => 'Export failed',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Validate and normalise the report filters. Dates are plain Y-m-d strings
     * interpreted as Africa/Nairobi wall time, matching the order board.
     *
     * @return array<string, mixed>
     */
    private function validatedFilters(Request $request): array
    {
        $validated = $request->validate([
            'from' => 'required|date_format:Y-m-d',
            'to' => 'nullable|date_format:Y-m-d',
            'date_field' => 'nullable|string|in:'.implode(',', self::DATE_FIELDS),
            'merchant' => 'nullable|string|max:255',
            'statuses' => 'nullable|array',
            'statuses.*' => 'nullable|string|max:50',
        ]);

        $from = Carbon::createFromFormat('Y-m-d', $validated['from'], 'Africa/Nairobi')->startOfDay();
        $to = isset($validated['to']) && $validated['to'] !== ''
            ? Carbon::createFromFormat('Y-m-d', $validated['to'], 'Africa/Nairobi')->endOfDay()
            : Carbon::now('Africa/Nairobi')->endOfDay();

        if ($to->lt($from)) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'to' => 'The end date must be on or after the start date.',
            ]);
        }

        $statuses = array_values(array_filter(
            (array) ($validated['statuses'] ?? []),
            fn ($status) => is_string($status) && trim($status) !== ''
        ));

        return [
            'from' => $from,
            'to' => $to,
            'date_field' => in_array($validated['date_field'] ?? null, self::DATE_FIELDS, true)
                ? $validated['date_field']
                : 'delivery_date',
            'merchant' => isset($validated['merchant']) && trim((string) $validated['merchant']) !== ''
                ? trim((string) $validated['merchant'])
                : null,
            'statuses' => $statuses,
        ];
    }

    /**
     * The single source of truth for both the preview table and the workbook.
     */
    private function reportQuery(?User $user, array $filters): Builder
    {
        $query = CountryAccess::scopeByCountryName(SheetOrder::query(), $user);

        // A merchant-role operator is hard-limited to their own merchant names,
        // regardless of what the request asked for.
        $merchantScope = $this->merchantScope($user);

        if ($merchantScope !== null) {
            $query->whereIn('merchant', $merchantScope);
        } elseif ($filters['merchant'] !== null) {
            $query->where('merchant', $filters['merchant']);
        }

        $query->whereBetween($filters['date_field'], [$filters['from'], $filters['to']]);

        $query->whereStatuses($filters['statuses']);

        return $query->orderBy($filters['date_field'])->orderBy('id');
    }

    /**
     * Merchant names a merchant-role operator is allowed to see: their own
     * name or username. Returns null for everyone else.
     *
     * @return array<int, string>|null
     */
    private function merchantScope(?User $user): ?array
    {
        if (! $user || strtolower(trim((string) $user->roles)) !== 'merchant') {
            return null;
        }

        $names = array_values(array_unique(array_filter(
            array_map(
                fn ($value) => is_string($value) ? trim($value) : '',
                [$user->name, $user->username]
            ),
            fn ($value) => $value !== ''
        )));

        return $names === [] ? null : $names;
    }

    /**
     * The merchant dropdown options. A merchant-role operator only ever sees
     * their own name or username, matched against real merchants.
     *
     * @return array<int, string>
     */
    private function availableMerchants(?User $user): array
    {
        $query = CountryAccess::scopeByCountryName(
            Sheet::query()->select('sheet_name'),
            $user
        )
            ->whereNotNull('sheet_name')
            ->where('sheet_name', '!=', '');

        $scope = $this->merchantScope($user);

        if ($scope !== null) {
            $query->whereIn('sheet_name', $scope);
        }

        $merchants = $query->distinct()->pluck('sheet_name');

        // The operator's own name/username may not be present in the sheets
        // table yet, but they still need to see their own option.
        if ($scope !== null) {
            return $scope;
        }

        return $merchants->sort()->values()->all();
    }

    /**
     * Offset-paginated so the date ordering on the shared query stays valid.
     */
    private function previewPage(Builder $query, mixed $page)
    {
        $page = max(1, (int) ($page ?: 1));

        return $query
            ->forPage($page, self::PREVIEW_PAGE_SIZE)
            ->get(['id', 'order_no', 'order_date', 'delivery_date', 'amount', 'client_name', 'phone', 'alt_no', 'city', 'country', 'product_name', 'quantity', 'status', 'merchant', 'cc_email']);
    }

    /**
     * @return array<string, mixed>
     */
    private function previewRow(SheetOrder $order, string $dateField): array
    {
        return [
            'id' => $order->id,
            'order_no' => $order->order_no,
            'order_date' => $order->order_date?->format('Y-m-d'),
            'delivery_date' => $order->delivery_date?->format('Y-m-d'),
            'sort_date' => $order->{$dateField}?->format('Y-m-d'),
            'amount' => $order->amount,
            'client_name' => $order->client_name,
            'phone' => $order->phone,
            'alt_no' => $order->alt_no,
            'city' => $order->city,
            'country' => $order->country,
            'product_name' => $order->product_name,
            'quantity' => $order->quantity,
            'status' => $order->status,
            'merchant' => $order->merchant,
            'cc_email' => $order->cc_email,
        ];
    }

    /**
     * @return array<string, string>
     */
    private function describeFilters(array $filters): array
    {
        return [
            'date_field' => $filters['date_field'],
            'date_field_label' => $filters['date_field'] === 'order_date' ? 'Order date' : 'Delivery date',
            'from' => $filters['from']->format('Y-m-d'),
            'to' => $filters['to']->format('Y-m-d'),
            'merchant' => $filters['merchant'] ?? 'All merchants',
            'statuses' => $filters['statuses'] === [] ? 'All statuses' : implode(', ', $filters['statuses']),
        ];
    }
}