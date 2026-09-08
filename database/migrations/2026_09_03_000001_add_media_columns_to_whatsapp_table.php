<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp', function (Blueprint $table) {
            $table->string('media_url')->nullable()->after('type');
            $table->string('media_type')->nullable()->after('media_url');
            $table->string('mime_type')->nullable()->after('media_type');
            $table->string('media_path')->nullable()->after('mime_type');
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp', function (Blueprint $table) {
            $table->dropColumn(['media_url', 'media_type', 'mime_type', 'media_path']);
        });
    }
};
