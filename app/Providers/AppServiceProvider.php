<?php

namespace App\Providers;

use App\Models\Product;
use App\Models\SheetOrder;
use App\Models\Transfer;
use App\Models\Deduction;
use App\Observers\DeductionObserver;
use App\Observers\ProductObserver;
use App\Observers\SheetOrderObserver;
use App\Observers\TransferObserver;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        SheetOrder::observe(SheetOrderObserver::class);
        Product::observe(ProductObserver::class);
        Transfer::observe(TransferObserver::class);
        Deduction::observe(DeductionObserver::class);
    }
}
