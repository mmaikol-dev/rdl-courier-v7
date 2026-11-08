<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('transfers', 'received_at')) {
            Schema::table('transfers', function (Blueprint $table): void {
                $table->timestamp('received_at')->nullable()->index();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('transfers', 'received_at')) {
            Schema::table('transfers', function (Blueprint $table): void {
                $table->dropIndex(['received_at']);
                $table->dropColumn('received_at');
            });
        }
    }
};
