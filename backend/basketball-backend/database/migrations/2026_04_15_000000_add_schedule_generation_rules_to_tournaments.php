<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('tournaments')) {
            Schema::table('tournaments', function (Blueprint $table) {
                if (!Schema::hasColumn('tournaments', 'playoff_round_gap_days')) {
                    $table->unsignedInteger('playoff_round_gap_days')->default(1)->after('venue_names');
                }
                if (!Schema::hasColumn('tournaments', 'groups_to_playoffs_gap_days')) {
                    $table->unsignedInteger('groups_to_playoffs_gap_days')->default(1)->after('playoff_round_gap_days');
                }
                if (!Schema::hasColumn('tournaments', 'group_games_per_day')) {
                    $table->unsignedInteger('group_games_per_day')->nullable()->after('groups_to_playoffs_gap_days');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('tournaments')) {
            Schema::table('tournaments', function (Blueprint $table) {
                $drop = [];
                foreach (['playoff_round_gap_days', 'groups_to_playoffs_gap_days', 'group_games_per_day'] as $column) {
                    if (Schema::hasColumn('tournaments', $column)) {
                        $drop[] = $column;
                    }
                }
                if ($drop !== []) {
                    $table->dropColumn($drop);
                }
            });
        }
    }
};
