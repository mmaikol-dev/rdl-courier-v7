<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('daily_budgets', 'country')) {
            Schema::table('daily_budgets', function (Blueprint $table): void {
                $table->string('country')->nullable()->after('budget_date')->index();
            });
        }

        if (! Schema::hasColumn('requisitions', 'country')) {
            Schema::table('requisitions', function (Blueprint $table): void {
                $table->string('country')->nullable()->after('user_id')->index();
            });
        }

        if (! Schema::hasColumn('transfers', 'country')) {
            Schema::table('transfers', function (Blueprint $table): void {
                $table->string('country')->nullable()->after('from')->index();
            });
        }

        if (! Schema::hasColumn('deductions', 'country')) {
            Schema::table('deductions', function (Blueprint $table): void {
                $table->string('country')->nullable()->after('deducted_by')->index();
            });
        }

        DB::table('requisitions')
            ->join('users', 'users.id', '=', 'requisitions.user_id')
            ->whereNull('requisitions.country')
            ->whereNotNull('users.store_address')
            ->where('users.store_address', '!=', '')
            ->update(['requisitions.country' => DB::raw('users.store_address')]);

        DB::table('transfers')
            ->join('users', 'users.id', '=', 'transfers.agent_id')
            ->whereNull('transfers.country')
            ->whereNotNull('users.store_address')
            ->where('users.store_address', '!=', '')
            ->update(['transfers.country' => DB::raw('users.store_address')]);

        DB::table('deductions')
            ->join('users', 'users.id', '=', 'deductions.agent_id')
            ->whereNull('deductions.country')
            ->whereNotNull('users.store_address')
            ->where('users.store_address', '!=', '')
            ->update(['deductions.country' => DB::raw('users.store_address')]);

        $budgetCountries = DB::table('requisitions')
            ->whereNotNull('daily_budget_id')
            ->whereNotNull('country')
            ->where('country', '!=', '')
            ->select('daily_budget_id', DB::raw('MIN(country) as country'))
            ->groupBy('daily_budget_id')
            ->get();

        foreach ($budgetCountries as $budgetCountry) {
            DB::table('daily_budgets')
                ->where('id', $budgetCountry->daily_budget_id)
                ->whereNull('country')
                ->update(['country' => $budgetCountry->country]);
        }

        DB::table('daily_budgets')
            ->whereNull('country')
            ->whereExists(function ($query): void {
                $query->select(DB::raw(1))
                    ->from('budget_transactions')
                    ->join('users', 'users.id', '=', 'budget_transactions.created_by')
                    ->whereColumn('budget_transactions.daily_budget_id', 'daily_budgets.id')
                    ->whereNotNull('users.store_address')
                    ->where('users.store_address', '!=', '');
            })
            ->update([
                'country' => DB::raw("(
                    SELECT MIN(users.store_address)
                    FROM budget_transactions
                    INNER JOIN users ON users.id = budget_transactions.created_by
                    WHERE budget_transactions.daily_budget_id = daily_budgets.id
                      AND users.store_address IS NOT NULL
                      AND users.store_address != ''
                )"),
            ]);

        $budgetDateUniqueIndexes = collect(DB::select("
            SELECT DISTINCT INDEX_NAME
            FROM information_schema.statistics
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'daily_budgets'
              AND NON_UNIQUE = 0
              AND INDEX_NAME != 'PRIMARY'
            GROUP BY INDEX_NAME
            HAVING COUNT(*) = 1 AND MAX(COLUMN_NAME) = 'budget_date'
        "))->pluck('INDEX_NAME');

        foreach ($budgetDateUniqueIndexes as $indexName) {
            DB::statement(sprintf(
                'ALTER TABLE `daily_budgets` DROP INDEX `%s`',
                str_replace('`', '``', $indexName)
            ));
        }

        $countryBudgetUniqueExists = DB::selectOne("
            SELECT 1 AS existing
            FROM information_schema.statistics
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'daily_budgets'
              AND INDEX_NAME = 'daily_budgets_country_budget_date_unique'
              AND NON_UNIQUE = 0
            LIMIT 1
        ");

        if (! $countryBudgetUniqueExists) {
            Schema::table('daily_budgets', function (Blueprint $table): void {
                $table->unique(['country', 'budget_date']);
            });
        }
    }

    public function down(): void
    {
        $countryBudgetUniqueExists = DB::selectOne("
            SELECT 1 AS existing
            FROM information_schema.statistics
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'daily_budgets'
              AND INDEX_NAME = 'daily_budgets_country_budget_date_unique'
              AND NON_UNIQUE = 0
            LIMIT 1
        ");

        $budgetDateUniqueExists = DB::selectOne("
            SELECT 1 AS existing
            FROM information_schema.statistics
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'daily_budgets'
              AND INDEX_NAME = 'daily_budgets_budget_date_unique'
              AND NON_UNIQUE = 0
            LIMIT 1
        ");

        Schema::table('daily_budgets', function (Blueprint $table) use ($countryBudgetUniqueExists, $budgetDateUniqueExists): void {
            if ($countryBudgetUniqueExists) {
                $table->dropUnique('daily_budgets_country_budget_date_unique');
            }

            if (! $budgetDateUniqueExists) {
                $table->unique('budget_date');
            }

            if (Schema::hasColumn('daily_budgets', 'country')) {
                $table->dropColumn('country');
            }
        });

        if (Schema::hasColumn('requisitions', 'country')) {
            Schema::table('requisitions', function (Blueprint $table): void {
                $table->dropColumn('country');
            });
        }

        if (Schema::hasColumn('transfers', 'country')) {
            Schema::table('transfers', function (Blueprint $table): void {
                $table->dropColumn('country');
            });
        }

        if (Schema::hasColumn('deductions', 'country')) {
            Schema::table('deductions', function (Blueprint $table): void {
                $table->dropColumn('country');
            });
        }
    }
};
