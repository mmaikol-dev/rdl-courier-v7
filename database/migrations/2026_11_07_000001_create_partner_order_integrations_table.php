<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('partner_order_integrations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('sheets_id')->constrained('sheets')->cascadeOnDelete();
            $table->string('provider', 80)->default('healthilyvitae');
            $table->string('integration_name');
            $table->string('base_url', 500);
            $table->text('api_key'); // encrypted by model cast
            $table->string('country_code', 2)->default('KE');
            $table->date('since_date');
            $table->boolean('is_enabled')->default(true);
            $table->timestamp('last_synced_at')->nullable();
            $table->unsignedInteger('orders_synced')->default(0);
            $table->text('last_error')->nullable();
            $table->timestamp('last_error_at')->nullable();
            $table->timestamps();
            $table->index(['is_enabled', 'provider']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('partner_order_integrations');
    }
};
