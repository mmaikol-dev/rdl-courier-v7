<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('countries', function (Blueprint $table): void {
            $table->id();
            $table->string('name')->unique();
            $table->string('code', 10)->nullable()->unique();
            $table->timestamps();
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->foreignId('country_id')->nullable()->after('roles')->constrained('countries')->nullOnDelete();
        });

        $countryNames = collect();

        if (Schema::hasTable('sheet_orders') && Schema::hasColumn('sheet_orders', 'country')) {
            $countryNames = $countryNames->merge(
                DB::table('sheet_orders')
                    ->whereNotNull('country')
                    ->where('country', '!=', '')
                    ->distinct()
                    ->pluck('country')
            );
        }

        if (Schema::hasTable('sheets') && Schema::hasColumn('sheets', 'country')) {
            $countryNames = $countryNames->merge(
                DB::table('sheets')
                    ->whereNotNull('country')
                    ->where('country', '!=', '')
                    ->distinct()
                    ->pluck('country')
            );
        }

        $timestamp = now();

        $countryNames
            ->map(fn ($name) => trim((string) $name))
            ->filter()
            ->unique()
            ->values()
            ->each(function (string $name) use ($timestamp): void {
                DB::table('countries')->updateOrInsert(
                    ['name' => $name],
                    ['created_at' => $timestamp, 'updated_at' => $timestamp],
                );
            });

        if (
            Schema::hasTable('users') &&
            Schema::hasTable('sheets') &&
            Schema::hasColumn('users', 'name') &&
            Schema::hasColumn('users', 'roles') &&
            Schema::hasColumn('sheets', 'sheet_name') &&
            Schema::hasColumn('sheets', 'country')
        ) {
            $merchantUsers = DB::table('users')
                ->where('roles', 'merchant')
                ->select('id', 'name')
                ->get();

            foreach ($merchantUsers as $user) {
                $countryName = DB::table('sheets')
                    ->where('sheet_name', $user->name)
                    ->whereNotNull('country')
                    ->where('country', '!=', '')
                    ->value('country');

                if (! $countryName) {
                    continue;
                }

                $countryId = DB::table('countries')->where('name', $countryName)->value('id');

                if ($countryId) {
                    DB::table('users')->where('id', $user->id)->update(['country_id' => $countryId]);
                }
            }
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('country_id');
        });

        Schema::dropIfExists('countries');
    }
};
