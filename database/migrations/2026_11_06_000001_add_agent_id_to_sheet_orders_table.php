<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('sheet_orders')) {
            return;
        }

        if (! Schema::hasColumn('sheet_orders', 'agent_id')) {
            Schema::table('sheet_orders', function (Blueprint $table): void {
                $table->foreignId('agent_id')->nullable()->after('agent')->constrained('users')->nullOnDelete();
            });
        }

        $agentIds = DB::table('users')
            ->whereRaw('LOWER(TRIM(roles)) = ?', ['agent'])
            ->get(['id', 'name', 'store_address'])
            ->groupBy(fn (object $agent): string => mb_strtolower(trim((string) $agent->name)).'|'.mb_strtolower(trim((string) $agent->store_address)));

        DB::table('sheet_orders')
            ->whereNull('agent_id')
            ->whereNotNull('agent')
            ->orderBy('id')
            ->chunkById(500, function ($orders) use ($agentIds): void {
                foreach ($orders as $order) {
                    $key = mb_strtolower(trim((string) $order->agent)).'|'.mb_strtolower(trim((string) $order->country));
                    $matches = $agentIds->get($key, collect());
                    if ($matches->count() !== 1) {
                        continue;
                    }

                    DB::table('sheet_orders')->where('id', $order->id)->update([
                        'agent_id' => $matches->first()->id,
                    ]);
                }
            });
    }

    public function down(): void
    {
        if (! Schema::hasTable('sheet_orders') || ! Schema::hasColumn('sheet_orders', 'agent_id')) {
            return;
        }

        Schema::table('sheet_orders', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('agent_id');
        });
    }
};
