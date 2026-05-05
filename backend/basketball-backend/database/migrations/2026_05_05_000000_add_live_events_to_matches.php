<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('matches') && !Schema::hasColumn('matches', 'live_events')) {
            Schema::table('matches', function (Blueprint $table) {
                $table->json('live_events')->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('matches') && Schema::hasColumn('matches', 'live_events')) {
            Schema::table('matches', function (Blueprint $table) {
                $table->dropColumn('live_events');
            });
        }
    }
};
