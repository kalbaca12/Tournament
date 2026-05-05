<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('users')) {
            Schema::create('users', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('email')->unique();
                $table->timestamp('email_verified_at')->nullable();
                $table->string('password');
                $table->string('role', 20)->default('manager');
                $table->rememberToken();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('teams')) {
            Schema::create('teams', function (Blueprint $table) {
                $table->id();
                $table->string('name', 150);
                $table->string('city', 100)->nullable();
                $table->unsignedBigInteger('manager_id')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('tournaments')) {
            Schema::create('tournaments', function (Blueprint $table) {
                $table->id();
                $table->string('name', 150);
                $table->date('start_date')->nullable();
                $table->date('end_date');
                $table->string('format', 40);
                $table->string('status', 20)->default('draft');
                $table->unsignedBigInteger('created_by')->nullable();
                $table->unsignedInteger('max_teams')->nullable();
                $table->unsignedInteger('duration_weeks')->default(1);
                $table->json('allowed_days')->nullable();
                $table->json('time_slots')->nullable();
                $table->string('venue_name', 150)->nullable();
                $table->unsignedInteger('venues_count')->default(1);
                $table->json('venue_names')->nullable();
                $table->unsignedInteger('playoff_round_gap_days')->default(1);
                $table->unsignedInteger('groups_to_playoffs_gap_days')->default(1);
                $table->unsignedInteger('group_games_per_day')->nullable();
                $table->unsignedInteger('stage_day_gap_days')->default(0);
                $table->date('registration_deadline')->nullable();
                $table->boolean('participants_locked')->default(false);
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('players')) {
            Schema::create('players', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('team_id');
                $table->string('first_name');
                $table->string('last_name');
                $table->unsignedInteger('jersey_number')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('venues')) {
            Schema::create('venues', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('address')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('matches')) {
            Schema::create('matches', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('tournament_id');
                $table->unsignedBigInteger('home_team_id')->nullable();
                $table->unsignedBigInteger('away_team_id')->nullable();
                $table->unsignedBigInteger('venue_id')->nullable();
                $table->unsignedInteger('venue_slot')->nullable();
                $table->string('venue_name', 150)->nullable();
                $table->string('stage', 50)->nullable();
                $table->string('group_code', 10)->nullable();
                $table->unsignedInteger('round_number')->default(1);
                $table->timestamp('scheduled_at')->nullable();
                $table->unsignedInteger('home_score')->nullable();
                $table->unsignedInteger('away_score')->nullable();
                $table->string('status', 20)->default('scheduled');
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('tournament_teams')) {
            Schema::create('tournament_teams', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('tournament_id');
                $table->unsignedBigInteger('team_id');
                $table->string('group_code', 10)->nullable();
                $table->unsignedInteger('seed')->nullable();
                $table->timestamps();
                $table->unique(['tournament_id', 'team_id']);
            });
        }

        if (!Schema::hasTable('tournament_team_players')) {
            Schema::create('tournament_team_players', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('tournament_id');
                $table->unsignedBigInteger('team_id');
                $table->unsignedBigInteger('player_id');
                $table->timestamps();
                $table->unique(['tournament_id', 'team_id', 'player_id']);
            });
        }

        if (!Schema::hasTable('match_player_stats')) {
            Schema::create('match_player_stats', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('match_id');
                $table->unsignedBigInteger('player_id');
                $table->unsignedBigInteger('team_id');
                $table->unsignedInteger('minutes')->default(0);
                $table->boolean('dnp')->default(false);
                $table->boolean('fouled_out')->default(false);
                $table->unsignedInteger('points')->default(0);
                $table->unsignedInteger('rebounds')->default(0);
                $table->unsignedInteger('assists')->default(0);
                $table->unsignedInteger('steals')->default(0);
                $table->unsignedInteger('blocks')->default(0);
                $table->unsignedInteger('fouls')->default(0);
                $table->unsignedInteger('turnovers')->default(0);
                $table->unsignedInteger('fgm')->default(0);
                $table->unsignedInteger('fga')->default(0);
                $table->unsignedInteger('tpm')->default(0);
                $table->unsignedInteger('tpa')->default(0);
                $table->unsignedInteger('ftm')->default(0);
                $table->unsignedInteger('fta')->default(0);
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        foreach ([
            'match_player_stats',
            'tournament_team_players',
            'tournament_participation_requests',
            'tournament_teams',
            'matches',
            'venues',
            'players',
            'tournaments',
            'teams',
            'users',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
