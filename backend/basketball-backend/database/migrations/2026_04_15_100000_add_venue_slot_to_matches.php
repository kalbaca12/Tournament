<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('matches') && !Schema::hasColumn('matches', 'venue_slot')) {
            Schema::table('matches', function (Blueprint $table) {
                $table->unsignedInteger('venue_slot')->nullable()->after('venue_id');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('matches') && Schema::hasColumn('matches', 'venue_slot')) {
            Schema::table('matches', function (Blueprint $table) {
                $table->dropColumn('venue_slot');
            });
        }
    }
};
