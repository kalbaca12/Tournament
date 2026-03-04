<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('matches')) {
            return;
        }

        $driver = DB::getDriverName();
        if ($driver === 'mysql') {
            DB::statement('ALTER TABLE matches MODIFY home_team_id BIGINT UNSIGNED NULL');
            DB::statement('ALTER TABLE matches MODIFY away_team_id BIGINT UNSIGNED NULL');
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('matches')) {
            return;
        }

        $driver = DB::getDriverName();
        if ($driver === 'mysql') {
            DB::statement('ALTER TABLE matches MODIFY home_team_id BIGINT UNSIGNED NOT NULL');
            DB::statement('ALTER TABLE matches MODIFY away_team_id BIGINT UNSIGNED NOT NULL');
        }
    }
};

