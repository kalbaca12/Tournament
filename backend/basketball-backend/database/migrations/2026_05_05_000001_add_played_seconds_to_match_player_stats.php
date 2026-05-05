<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('match_player_stats') || Schema::hasColumn('match_player_stats', 'played_seconds')) {
            return;
        }

        Schema::table('match_player_stats', function (Blueprint $table): void {
            $table->unsignedInteger('played_seconds')->default(0);
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('match_player_stats') || !Schema::hasColumn('match_player_stats', 'played_seconds')) {
            return;
        }

        Schema::table('match_player_stats', function (Blueprint $table): void {
            $table->dropColumn('played_seconds');
        });
    }
};
