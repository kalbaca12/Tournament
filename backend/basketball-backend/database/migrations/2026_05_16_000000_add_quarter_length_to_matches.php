<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('matches') && !Schema::hasColumn('matches', 'quarter_length_seconds')) {
            Schema::table('matches', function (Blueprint $table) {
                $table->unsignedInteger('quarter_length_seconds')->default(600)->after('live_events');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('matches') && Schema::hasColumn('matches', 'quarter_length_seconds')) {
            Schema::table('matches', function (Blueprint $table) {
                $table->dropColumn('quarter_length_seconds');
            });
        }
    }
};
