<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('incoming_sheet_orders', function (Blueprint $table): void {
            $table->id();
            $table->string('source_hash', 64)->unique();
            $table->string('order_no')->nullable()->index();
            $table->string('sheet_id')->nullable()->index();
            $table->string('sheet_name')->nullable();
            $table->json('payload');
            $table->string('status')->default('pending')->index();
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->text('error_message')->nullable();
            $table->timestamp('processed_at')->nullable();
            $table->timestamp('available_at')->nullable()->index();
            $table->timestamps();

            $table->index(['sheet_id', 'sheet_name'], 'incoming_sheet_orders_sheet_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('incoming_sheet_orders');
    }
};
