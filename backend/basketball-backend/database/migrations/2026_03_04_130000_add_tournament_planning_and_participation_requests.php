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
                if (!Schema::hasColumn('tournaments', 'max_teams')) {
                    $table->unsignedInteger('max_teams')->nullable()->after('status');
                }
                if (!Schema::hasColumn('tournaments', 'duration_weeks')) {
                    $table->unsignedInteger('duration_weeks')->default(1)->after('max_teams');
                }
                if (!Schema::hasColumn('tournaments', 'allowed_days')) {
                    $table->json('allowed_days')->nullable()->after('duration_weeks');
                }
                if (!Schema::hasColumn('tournaments', 'time_slots')) {
                    $table->json('time_slots')->nullable()->after('allowed_days');
                }
                if (!Schema::hasColumn('tournaments', 'venues_count')) {
                    $table->unsignedInteger('venues_count')->default(1)->after('time_slots');
                }
                if (!Schema::hasColumn('tournaments', 'registration_deadline')) {
                    $table->date('registration_deadline')->nullable()->after('venues_count');
                }
                if (!Schema::hasColumn('tournaments', 'participants_locked')) {
                    $table->boolean('participants_locked')->default(false)->after('registration_deadline');
                }
            });
        }

        if (!Schema::hasTable('tournament_participation_requests')) {
            Schema::create('tournament_participation_requests', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('tournament_id');
                $table->unsignedBigInteger('team_id');
                $table->unsignedBigInteger('manager_id');
                $table->string('status', 20)->default('pending');
                $table->text('note')->nullable();
                $table->unsignedBigInteger('reviewed_by')->nullable();
                $table->timestamp('reviewed_at')->nullable();
                $table->timestamps();

                $table->index(['tournament_id', 'status']);
                $table->unique(['tournament_id', 'team_id']);
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('tournament_participation_requests')) {
            Schema::dropIfExists('tournament_participation_requests');
        }

        if (Schema::hasTable('tournaments')) {
            Schema::table('tournaments', function (Blueprint $table) {
                $drop = [];
                foreach (['max_teams', 'duration_weeks', 'allowed_days', 'time_slots', 'venues_count', 'registration_deadline', 'participants_locked'] as $col) {
                    if (Schema::hasColumn('tournaments', $col)) {
                        $drop[] = $col;
                    }
                }
                if ($drop !== []) {
                    $table->dropColumn($drop);
                }
            });
        }
    }
};
