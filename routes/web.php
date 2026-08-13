<?php

use App\Http\Controllers\AiController;
use App\Http\Controllers\AppScriptController;
use App\Http\Controllers\AssignController;
use App\Http\Controllers\C2BTransactionController;
use App\Http\Controllers\CallcenterController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\ChatController;
use App\Http\Controllers\ClearanceController;
use App\Http\Controllers\DailyBudgetController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DispatchController;
use App\Http\Controllers\FinanceWorkflowController;
use App\Http\Controllers\ImportController;
use App\Http\Controllers\IncomingSheetOrderController;
use App\Http\Controllers\InventoryDeductionController;
use App\Http\Controllers\MapController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\RequisitionCategoryController;
use App\Http\Controllers\RequisitionController;
use App\Http\Controllers\SheetController;
use App\Http\Controllers\SheetOrderController;
use App\Http\Controllers\SidebarRolePermissionController;
use App\Http\Controllers\StatsController;
use App\Http\Controllers\StkController;
use App\Http\Controllers\TransferController;
use App\Http\Controllers\UndeliveredController;
use App\Http\Controllers\UnitController;
use App\Http\Controllers\UnremittedController;
use App\Http\Controllers\UpdateController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\UserLocationController;
use App\Http\Controllers\DeductedOrdersController;
use App\Http\Controllers\WaredashController;
use App\Http\Controllers\WaybillController;
use App\Http\Controllers\WhatsappController;
use App\Http\Controllers\OrderScanController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    return Inertia::render('welcome', [
        'canResetPassword' => Route::has('password.request'),
        'loginUrl' => route('login'),
        'passwordResetUrl' => Route::has('password.request') ? route('password.request') : null,
        'status' => session('status'),
    ]);
})->name('home');

// no auth routes
// appscript api

Route::middleware(['auth', 'verified'])->group(function () {
    Route::post('select-country', function (Request $request) {
        $request->validate(['country' => 'nullable|string']);
        session(['selected_country' => $request->country ?: null]);

        return back();
    })->name('select-country');
    Route::get('maps', [MapController::class, 'index'])->name('maps.index');
    Route::post('locations/heartbeat', [UserLocationController::class, 'heartbeat'])
        ->middleware('throttle:6,1')
        ->name('locations.heartbeat');
    Route::post('locations/login', [UserLocationController::class, 'login'])
        ->middleware('throttle:3,1')
        ->name('locations.login');

    // dashboard

    Route::get('dashboard', [DashboardController::class, 'index'])->name('dashboard');
    // sheetorderspage- route
    Route::resource('sheetorders', SheetOrderController::class);
    Route::get('sheetorders/{order}/histories', [SheetOrderController::class, 'histories'])
        ->name('sheetorders.histories');

    // product and transfer

    Route::get('/products/{product}/inventory-logs', [ProductController::class, 'inventoryLogs'])
        ->name('products.inventoryLogs');

    Route::post('/products/scan-barcodes', [ProductController::class, 'scanBarcodes'])
        ->name('products.scanBarcodes');

    Route::get('/products/{product}/barcode-history', [ProductController::class, 'getBarcodeHistory'])
        ->name('products.barcodeHistory');

    Route::post('/products/{product:id}/update-quantity', [ProductController::class, 'updateQuantity'])
        ->name('products.updateQuantity');

    Route::resource('products', ProductController::class);
    Route::get('/inventory-deductions', [InventoryDeductionController::class, 'index'])->name('inventory-deductions.index');
    Route::post('/inventory-deductions', [InventoryDeductionController::class, 'store'])->name('inventory-deductions.store');

    // Deducted Orders — view orders already deducted with linked products
    Route::get('/deducted-orders', [DeductedOrdersController::class, 'index'])->name('deducted-orders.index');

    // QR order scanning (warehouse outbound/inbound)
    Route::get('/order-scans', [OrderScanController::class, 'index'])->name('order-scans.index');
    Route::post('/order-scans', [OrderScanController::class, 'store'])->name('order-scans.store');

    Route::get('/transfer', [TransferController::class, 'index'])->name('transfers.index');

    Route::post('/transfers', [TransferController::class, 'store'])->name('transfers.store');

    Route::get('/transfers/agent/{agentId}', [TransferController::class, 'showByAgent'])->name('transfers.agent.show');
    Route::get('/transfers/{productId}/{agentId}', [TransferController::class, 'show'])->name('transfers.show');
    Route::post('/transfers/{productId}/{agentId}/deductions', [TransferController::class, 'storeDeduction'])->name('transfers.deductions.store');
    Route::delete('/deductions/{id}', [TransferController::class, 'destroyDeduction'])->name('deductions.destroy');

    // sheets
    Route::resource('sheets', SheetController::class);
    Route::get('/sheets/{sheetId}/view', [SheetController::class, 'viewSheetData']);

    // units(merchants)
    Route::resource('units', UnitController::class);

    // category
    Route::resource('categories', CategoryController::class);

    // users
    Route::resource('users', UserController::class);
    Route::get('sidebar-permissions', [SidebarRolePermissionController::class, 'index'])->name('sidebar-permissions.index');
    Route::put('sidebar-permissions', [SidebarRolePermissionController::class, 'update'])->name('sidebar-permissions.update');

    // c2btrans.
    Route::resource('transactions', C2BTransactionController::class);

    // dispatch

    Route::put('sheet_orders/{id}', [DispatchController::class, 'update'])->name('sheet_orders.update');
    Route::delete('sheet_orders/{id}', [DispatchController::class, 'destroy'])->name('sheet_orders.destroy');

    Route::post('/dispatch/bulk-download-waybills', [DispatchController::class, 'bulkDownloadWaybills'])->name('dispatch.bulkDownload');

    // Or update your frontend to use /dispatch endpoints
    Route::get('/dispatch/agent-orders/{agent}', [DispatchController::class, 'printAgentOrders'])
        ->name('dispatch.agent-orders');
    Route::resource('dispatch', DispatchController::class);
    Route::get('dispatch/{order}/waybill', [DispatchController::class, 'generateWaybill'])->name('dispatch.waybill');
    Route::post('/dispatch/bulk-assign', [DispatchController::class, 'bulkAssignAgent'])->name('dispatch.bulk-assign');
    // waybill
    Route::get('/waybill/download/{id}', [WaybillController::class, 'download'])->name('waybill.download');

    // apscriptapi
    Route::resource('appscript', AppScriptController::class);

    // Whatsapp
    Route::resource('whastapp', WhatsappController::class);
    Route::post('/whatsapp/{id}/send', [WhatsappController::class, 'sendMessage'])
        ->name('whatsapp.send');

    // reassign
    Route::post('assign/reassign', [AssignController::class, 'reassign'])->name('assign.reassign');

    Route::resource('assign', AssignController::class);

    // stkpush

    Route::get('/webrtc/token', [CallcenterController::class, 'generateWebRTCToken']);

    Route::get('/stk', [StkController::class, 'index'])->name('stk.index');
    Route::put('/stk/{id}', [StkController::class, 'update'])->name('stk.update');
    Route::delete('/stk/{id}', [StkController::class, 'destroy'])->name('stk.destroy');

    // report
    // Only the ones you actually use
    Route::get('/report', [ReportController::class, 'index'])->name('report.index');
    Route::get('/report/download', [ReportController::class, 'download'])->name('report.download');
    Route::get('/finance-workflow', [FinanceWorkflowController::class, 'index'])->name('finance-workflow.index');
    Route::get('/finance-workflow/orders', [FinanceWorkflowController::class, 'merchantOrders'])->name('finance-workflow.orders');
    Route::post('/finance-workflow/mark-delivered', [FinanceWorkflowController::class, 'markDelivered'])->name('finance-workflow.mark-delivered');
    Route::get('/finance-workflow/download-report', [FinanceWorkflowController::class, 'downloadMerchantReport'])->name('finance-workflow.download-report');
    Route::post('/finance-workflow/mark-confirmed', [FinanceWorkflowController::class, 'markConfirmed'])->name('finance-workflow.mark-confirmed');
    Route::post('/finance-workflow/mark-remitted', [FinanceWorkflowController::class, 'markRemitted'])->name('finance-workflow.mark-remitted');

    Route::get('/clearance', [ClearanceController::class, 'index'])->name('clearance.index');

    // undelivered
    Route::resource('/undelivered', UndeliveredController::class);

    // Warehouse Dashboard

    Route::resource('waredash', WaredashController::class);

    // unremitted
    Route::resource('/unremitted', UnremittedController::class);

    Route::get('/stats', [StatsController::class, 'index'])->name('stats.index');

    // whatsapp
    Route::resource('whatsapp', ChatController::class);
    Route::put('/chats/{phone}', [ChatController::class, 'updateStatus']);
    Route::get('/chats/{phone}', [ChatController::class, 'show'])->name('chats.show');
    Route::get('/api/whatsapp/conversations', [ChatController::class, 'getConversations']);

    // import
    Route::resource('import', ImportController::class);
    Route::post('/orders/import', [ImportController::class, 'store'])->name('orders.import.store');
    Route::get('/incoming-sheet-orders', [IncomingSheetOrderController::class, 'index'])->name('incoming-sheet-orders.index');
    Route::post('/incoming-sheet-orders/{id}/retry', [IncomingSheetOrderController::class, 'retry'])->name('incoming-sheet-orders.retry');

    // bulk expire orders
    Route::get('/orders/bulk-expire', [App\Http\Controllers\OrderExpireController::class, 'index'])->name('orders.bulk-expire');
    Route::post('/orders/bulk-expire', [App\Http\Controllers\OrderExpireController::class, 'bulkExpire'])->name('orders.bulk-expire.store');

    // Ai
    Route::resource('ai', AiController::class);
    Route::post('/ai/ask', [AiController::class, 'ask'])->name('ai.ask');
    Route::post('/ai/create-orders', [AiController::class, 'createOrders'])->name('ai.create-orders');
    Route::post('/ai/suggest-sheets', [AiController::class, 'suggestSheets'])->name('ai.suggest-sheets');
    Route::post('/ai/conversations', [AiController::class, 'createConversation'])->name('ai.conversations.store');
    Route::get('/ai/conversations/{conversation}', [AiController::class, 'showConversation'])->name('ai.conversations.show');
    Route::delete('/ai/conversations/{conversation}', [AiController::class, 'deleteConversation'])->name('ai.conversations.destroy');

    // updates
    Route::post('/sheet-updates/run', [UpdateController::class, 'run'])
        ->middleware('throttle:2,1');
    Route::resource('updates', UpdateController::class);

    Route::get('/reqcategories', [RequisitionCategoryController::class, 'index'])
        ->name('reqcategories.index');
    Route::post('/reqcategories', [RequisitionCategoryController::class, 'store'])
        ->name('reqcategories.store');
    Route::put('/reqcategories/{category}', [RequisitionCategoryController::class, 'update'])
        ->name('reqcategories.update');
    Route::delete('/reqcategories/{category}', [RequisitionCategoryController::class, 'destroy'])
        ->name('reqcategories.destroy');

    // Daily Budgets Routes
    Route::get('/budgets', [DailyBudgetController::class, 'index'])
        ->name('budgets.index');
    Route::post('/budgets', [DailyBudgetController::class, 'store'])
        ->name('budgets.store');
    Route::get('/budgets/{id}', [DailyBudgetController::class, 'show'])
        ->name('budgets.show');
    Route::post('/budgets/{id}/topup', [DailyBudgetController::class, 'topUp'])
        ->name('budgets.topup');
    Route::get('/budgets/date/{date}', [DailyBudgetController::class, 'getByDate'])
        ->name('budgets.by-date');

    // requisition
    Route::get('/requisitions', [RequisitionController::class, 'index'])
        ->name('requisitions.index');
    Route::post('/requisitions', [RequisitionController::class, 'store'])
        ->name('requisitions.store');
    Route::get('/requisitions/{requisition}', [RequisitionController::class, 'show'])
        ->name('requisitions.show');
    Route::patch('/requisitions/{requisition}/status', [RequisitionController::class, 'updateStatus'])
        ->name('requisitions.update-status');
    Route::patch('/requisitions/{requisition}/items/{item}', [RequisitionController::class, 'updateItem'])
        ->name('requisitions.update-item');
    Route::delete('/requisitions/{requisition}', [RequisitionController::class, 'destroy'])
        ->name('requisitions.destroy');

});

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
