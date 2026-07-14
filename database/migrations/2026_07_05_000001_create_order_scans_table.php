<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_scans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('sheet_orders')->cascadeOnDelete();
            $table->string('order_no');
            $table->string('product_name')->nullable();
            $table->integer('quantity')->nullable();
            $table->string('scan_type'); // 'in' or 'out'
            $table->string('scanned_by')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('scanned_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_scans');
    }
};
