<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE sheets MODIFY cc_agents LONGTEXT NULL');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE sheets MODIFY cc_agents TEXT NULL');
    }
};
