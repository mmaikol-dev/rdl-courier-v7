<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('agent_assignment_scans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('sheet_orders')->cascadeOnDelete();
            $table->string('order_no');
            $table->foreignId('agent_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('scan_type');
            $table->foreignId('scanned_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('scanned_at')->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('agent_assignment_scans');
    }
};
