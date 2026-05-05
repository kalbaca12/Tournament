<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('matches') && !Schema::hasColumn('matches', 'venue_name')) {
            Schema::table('matches', function (Blueprint $table) {
                $table->string('venue_name', 150)->nullable()->after('venue_slot');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('matches') && Schema::hasColumn('matches', 'venue_name')) {
            Schema::table('matches', function (Blueprint $table) {
                $table->dropColumn('venue_name');
            });
        }
    }
};
