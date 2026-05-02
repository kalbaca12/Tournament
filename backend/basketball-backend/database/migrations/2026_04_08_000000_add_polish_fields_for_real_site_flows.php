<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('tournaments') && !Schema::hasColumn('tournaments', 'venue_names')) {
            Schema::table('tournaments', function (Blueprint $table) {
                $table->json('venue_names')->nullable()->after('venues_count');
            });
        }

        if (Schema::hasTable('match_player_stats')) {
            Schema::table('match_player_stats', function (Blueprint $table) {
                if (!Schema::hasColumn('match_player_stats', 'minutes')) {
                    $table->unsignedSmallInteger('minutes')->default(0)->after('team_id');
                }
                if (!Schema::hasColumn('match_player_stats', 'dnp')) {
                    $table->boolean('dnp')->default(false)->after('minutes');
                }
                if (!Schema::hasColumn('match_player_stats', 'fouled_out')) {
                    $table->boolean('fouled_out')->default(false)->after('dnp');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('match_player_stats')) {
            Schema::table('match_player_stats', function (Blueprint $table) {
                $drop = [];
                foreach (['minutes', 'dnp', 'fouled_out'] as $column) {
                    if (Schema::hasColumn('match_player_stats', $column)) {
                        $drop[] = $column;
                    }
                }
                if ($drop !== []) {
                    $table->dropColumn($drop);
                }
            });
        }

        if (Schema::hasTable('tournaments') && Schema::hasColumn('tournaments', 'venue_names')) {
            Schema::table('tournaments', function (Blueprint $table) {
                $table->dropColumn('venue_names');
            });
        }
    }
};
