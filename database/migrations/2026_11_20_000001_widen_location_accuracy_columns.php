<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_locations', function (Blueprint $table): void {
            $table->decimal('accuracy_meters', 12, 2)->nullable()->change();
        });

        Schema::table('user_login_locations', function (Blueprint $table): void {
            $table->decimal('accuracy_meters', 12, 2)->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('user_locations', function (Blueprint $table): void {
            $table->decimal('accuracy_meters', 8, 2)->nullable()->change();
        });

        Schema::table('user_login_locations', function (Blueprint $table): void {
            $table->decimal('accuracy_meters', 8, 2)->nullable()->change();
        });
    }
};
