<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('tournaments') && !Schema::hasColumn('tournaments', 'stage_day_gap_days')) {
            Schema::table('tournaments', function (Blueprint $table): void {
                $table->unsignedInteger('stage_day_gap_days')->default(0)->after('group_games_per_day');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('tournaments') && Schema::hasColumn('tournaments', 'stage_day_gap_days')) {
            Schema::table('tournaments', function (Blueprint $table): void {
                $table->dropColumn('stage_day_gap_days');
            });
        }
    }
};
