<?php

namespace Tests\Feature;

use App\Models\Game;
use App\Models\Player;
use App\Models\Team;
use App\Models\Tournament;
use App\Models\TournamentParticipationRequest;
use App\Models\TournamentTeam;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\Attributes\TestDox;
use Tests\TestCase;

class ApiIntegrationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->rebuildSchema();
    }

    #[Test]
    #[TestDox('POST /api/auth/login returns token for valid credentials')]
    public function post_api_auth_login_returns_token_for_valid_credentials(): void
    {
        $user = $this->createUser('manager');

        $response = $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'password',
        ]);

        $response
            ->assertOk()
            ->assertJsonStructure(['token', 'user' => ['id', 'name', 'email', 'role']])
            ->assertJsonPath('user.role', 'manager');
    }

    #[Test]
    #[TestDox('POST /api/auth/login returns 401 for invalid credentials')]
    public function post_api_auth_login_returns_401_for_invalid_credentials(): void
    {
        $user = $this->createUser('manager');

        $response = $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'wrong-password',
        ]);

        $response
            ->assertStatus(401)
            ->assertJsonPath('message', 'Invalid credentials.');
    }

    #[Test]
    #[TestDox('POST /api/tournaments returns 403 for manager role')]
    public function post_api_tournaments_returns_403_for_manager_role(): void
    {
        Sanctum::actingAs($this->createUser('manager'));

        $response = $this->postJson('/api/tournaments', $this->validTournamentPayload());

        $response
            ->assertStatus(403)
            ->assertJsonPath('message', 'Forbidden for your role.');
    }

    #[Test]
    #[TestDox('POST /api/tournaments returns 201 for admin')]
    public function post_api_tournaments_returns_201_for_admin(): void
    {
        $admin = $this->createUser('admin');
        Sanctum::actingAs($admin);

        $response = $this->postJson('/api/tournaments', $this->validTournamentPayload([
            'name' => 'Kaunas Cup',
        ]));

        $response
            ->assertCreated()
            ->assertJsonPath('name', 'Kaunas Cup')
            ->assertJsonPath('status', 'draft')
            ->assertJsonPath('created_by', $admin->id);

        $this->assertDatabaseHas('tournaments', [
            'name' => 'Kaunas Cup',
            'created_by' => $admin->id,
            'status' => 'draft',
        ]);
    }

    #[Test]
    #[TestDox('POST /api/teams returns 201, duplicate POST /api/teams returns 409')]
    public function post_api_teams_returns_201_then_409_for_duplicate_manager_team(): void
    {
        $manager = $this->createUser('manager');
        Sanctum::actingAs($manager);

        $firstResponse = $this->postJson('/api/teams', [
            'name' => 'Wolves',
            'city' => 'Kaunas',
        ]);

        $firstResponse
            ->assertCreated()
            ->assertJsonPath('name', 'Wolves')
            ->assertJsonPath('manager_id', $manager->id);

        $secondResponse = $this->postJson('/api/teams', [
            'name' => 'Falcons',
            'city' => 'Vilnius',
        ]);

        $secondResponse
            ->assertStatus(409)
            ->assertJsonPath('message', 'Manager can only own one team.');
    }

    #[Test]
    #[TestDox('POST /api/teams returns 422 when name is missing')]
    public function post_api_teams_returns_422_when_name_is_missing(): void
    {
        Sanctum::actingAs($this->createUser('manager'));

        $response = $this->postJson('/api/teams', [
            'city' => 'Kaunas',
        ]);

        $response
            ->assertStatus(422)
            ->assertJsonValidationErrors(['name']);
    }

    #[Test]
    #[TestDox('POST /api/tournaments/{id}/participation-requests and POST /api/participation-requests/{id}/approve return expected statuses')]
    public function post_api_tournaments_participation_requests_and_post_api_participation_requests_approve_return_expected_statuses(): void
    {
        $admin = $this->createUser('admin');
        $manager = $this->createUser('manager');
        $team = $this->createTeam($manager, ['name' => 'Wolves']);
        $tournament = $this->createTournament($admin);

        Sanctum::actingAs($manager);
        $requestResponse = $this->postJson("/api/tournaments/{$tournament->id}/participation-requests", [
            'team_id' => $team->id,
            'note' => 'Ready to play',
        ]);

        $requestResponse
            ->assertCreated()
            ->assertJsonPath('status', 'pending')
            ->assertJsonPath('team_id', $team->id);

        $requestRow = TournamentParticipationRequest::firstOrFail();

        Sanctum::actingAs($admin);
        $approvalResponse = $this->postJson("/api/participation-requests/{$requestRow->id}/approve");

        $approvalResponse
            ->assertOk()
            ->assertJsonPath('status', 'approved')
            ->assertJsonPath('reviewed_by', $admin->id);

        $this->assertDatabaseHas('tournament_teams', [
            'tournament_id' => $tournament->id,
            'team_id' => $team->id,
        ]);
    }

    #[Test]
    #[TestDox('POST /api/tournaments/{id}/generate-schedule returns 201 for locked tournament')]
    public function post_api_tournaments_generate_schedule_returns_201_for_locked_tournament(): void
    {
        $admin = $this->createUser('admin');
        $teams = [
            $this->createTeam($this->createUser('manager'), ['name' => 'Wolves']),
            $this->createTeam($this->createUser('manager'), ['name' => 'Falcons']),
        ];
        $tournament = $this->createTournament($admin, [
            'format' => 'single_elimination',
            'participants_locked' => true,
            'end_date' => '2026-06-07',
            'time_slots' => ['18:00', '20:00'],
        ]);

        foreach ($teams as $index => $team) {
            TournamentTeam::create([
                'tournament_id' => $tournament->id,
                'team_id' => $team->id,
                'seed' => $index + 1,
            ]);
        }

        Sanctum::actingAs($admin);
        $response = $this->postJson("/api/tournaments/{$tournament->id}/generate-schedule");

        $response
            ->assertCreated()
            ->assertJsonPath('message', 'Schedule generated')
            ->assertJsonPath('matches_created', 1);

        $this->assertDatabaseHas('matches', [
            'tournament_id' => $tournament->id,
            'home_team_id' => $teams[0]->id,
            'away_team_id' => $teams[1]->id,
            'status' => 'scheduled',
        ]);
    }

    #[Test]
    #[TestDox('POST /api/matches/{id}/result and GET /api/tournaments/{id}/standings return ranked rows')]
    public function post_api_matches_result_and_get_standings_return_ranked_rows(): void
    {
        $admin = $this->createUser('admin');
        $homeTeam = $this->createTeam($this->createUser('manager'), ['name' => 'Wolves']);
        $awayTeam = $this->createTeam($this->createUser('manager'), ['name' => 'Falcons']);
        $tournament = $this->createTournament($admin, ['format' => 'round_robin']);

        foreach ([$homeTeam, $awayTeam] as $team) {
            TournamentTeam::create([
                'tournament_id' => $tournament->id,
                'team_id' => $team->id,
            ]);
        }

        $game = Game::create([
            'tournament_id' => $tournament->id,
            'home_team_id' => $homeTeam->id,
            'away_team_id' => $awayTeam->id,
            'stage' => 'group',
            'round_number' => 1,
            'scheduled_at' => '2026-06-01 18:00:00',
            'status' => 'scheduled',
        ]);

        Sanctum::actingAs($admin);
        $resultResponse = $this->postJson("/api/matches/{$game->id}/result", [
            'home_score' => 90,
            'away_score' => 80,
        ]);

        $resultResponse
            ->assertOk()
            ->assertJsonPath('home_score', 90)
            ->assertJsonPath('away_score', 80)
            ->assertJsonPath('status', 'finished');

        $standingsResponse = $this->getJson("/api/tournaments/{$tournament->id}/standings");

        $standingsResponse
            ->assertOk()
            ->assertJsonPath('rows.0.team_id', $homeTeam->id)
            ->assertJsonPath('rows.0.points', 2)
            ->assertJsonPath('rows.1.team_id', $awayTeam->id)
            ->assertJsonPath('rows.1.points', 1);
    }

    #[Test]
    #[TestDox('GET /api/auth/me and POST /api/auth/logout return 200')]
    public function get_api_auth_me_and_post_api_auth_logout_return_200(): void
    {
        $manager = $this->createUser('manager');
        Sanctum::actingAs($manager);

        $this->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('id', $manager->id)
            ->assertJsonPath('role', 'manager');

        $this->postJson('/api/auth/logout')
            ->assertOk()
            ->assertJsonPath('message', 'Logged out');
    }

    #[Test]
    #[TestDox('GET/PUT/DELETE /api/tournaments, POST lock/unlock, and GET PDF endpoints return expected statuses')]
    public function get_put_delete_api_tournaments_and_post_lock_unlock_and_get_pdf_return_expected_statuses(): void
    {
        $admin = $this->createUser('admin');
        $team = $this->createTeam($this->createUser('manager'), ['name' => 'Wolves']);
        $tournament = $this->createTournament($admin, [
            'name' => 'Original Cup',
            'participants_locked' => false,
        ]);
        TournamentTeam::create([
            'tournament_id' => $tournament->id,
            'team_id' => $team->id,
            'seed' => 1,
        ]);

        $this->getJson('/api/tournaments')
            ->assertOk()
            ->assertJsonFragment(['name' => 'Original Cup']);

        $this->getJson("/api/tournaments/{$tournament->id}")
            ->assertOk()
            ->assertJsonPath('id', $tournament->id);

        $this->getJson("/api/tournaments/{$tournament->id}/feasibility")
            ->assertOk()
            ->assertJsonPath('team_count', 1);

        $this->get("/api/tournaments/{$tournament->id}/export/pdf")
            ->assertOk()
            ->assertHeader('Content-Type', 'application/pdf');

        Sanctum::actingAs($admin);
        $this->putJson("/api/tournaments/{$tournament->id}", [
            'name' => 'Updated Cup',
            'format' => 'round_robin',
            'participants_locked' => true,
        ])
            ->assertOk()
            ->assertJsonPath('name', 'Updated Cup')
            ->assertJsonPath('format', 'round_robin');

        $this->postJson("/api/tournaments/{$tournament->id}/lock-participants")
            ->assertOk()
            ->assertJsonPath('message', 'Participants locked');

        $this->postJson("/api/tournaments/{$tournament->id}/unlock-participants")
            ->assertOk()
            ->assertJsonPath('message', 'Participants unlocked');

        $this->deleteJson("/api/tournaments/{$tournament->id}")
            ->assertOk()
            ->assertJsonPath('message', 'Deleted');
    }

    #[Test]
    #[TestDox('GET/PUT/DELETE /api/teams and GET /api/teams/{id}/matches return expected statuses')]
    public function get_put_delete_api_teams_and_get_api_teams_matches_return_expected_statuses(): void
    {
        $manager = $this->createUser('manager');
        $team = $this->createTeam($manager, ['name' => 'Wolves']);
        $opponent = $this->createTeam($this->createUser('manager'), ['name' => 'Falcons']);
        $tournament = $this->createTournament($this->createUser('admin'));
        Game::create([
            'tournament_id' => $tournament->id,
            'home_team_id' => $team->id,
            'away_team_id' => $opponent->id,
            'round_number' => 1,
            'scheduled_at' => '2026-06-01 18:00:00',
            'status' => 'scheduled',
        ]);

        $this->getJson('/api/teams')
            ->assertOk()
            ->assertJsonFragment(['name' => 'Wolves']);

        $this->getJson("/api/teams/{$team->id}")
            ->assertOk()
            ->assertJsonPath('id', $team->id);

        $this->getJson("/api/teams/{$team->id}/matches")
            ->assertOk()
            ->assertJsonPath('0.home_team_id', $team->id);

        Sanctum::actingAs($manager);
        $this->getJson('/api/teams/my')
            ->assertOk()
            ->assertJsonPath('id', $team->id);

        $this->putJson("/api/teams/{$team->id}", [
            'name' => 'Updated Wolves',
            'city' => 'Vilnius',
        ])
            ->assertOk()
            ->assertJsonPath('name', 'Updated Wolves');

        $this->deleteJson("/api/teams/{$team->id}")
            ->assertOk()
            ->assertJsonPath('message', 'Deleted');
    }

    #[Test]
    #[TestDox('GET/POST/PUT/DELETE /api/players return expected statuses')]
    public function get_post_put_delete_api_players_return_expected_statuses(): void
    {
        $manager = $this->createUser('manager');
        $team = $this->createTeam($manager);
        Sanctum::actingAs($manager);

        $created = $this->postJson('/api/players', [
            'team_id' => $team->id,
            'first_name' => 'Jonas',
            'last_name' => 'Stone',
            'jersey_number' => 12,
        ])
            ->assertCreated()
            ->assertJsonPath('first_name', 'Jonas')
            ->json();

        $playerId = $created['id'];

        $this->getJson("/api/players?team_id={$team->id}")
            ->assertOk()
            ->assertJsonPath('0.id', $playerId);

        $this->getJson("/api/players/{$playerId}")
            ->assertOk()
            ->assertJsonPath('id', $playerId);

        $this->putJson("/api/players/{$playerId}", [
            'last_name' => 'Lake',
            'jersey_number' => 8,
        ])
            ->assertOk()
            ->assertJsonPath('last_name', 'Lake');

        $this->deleteJson("/api/players/{$playerId}")
            ->assertOk()
            ->assertJsonPath('message', 'Deleted');
    }

    #[Test]
    #[TestDox('GET/POST/DELETE /api/tournaments/{id}/teams and roster endpoints return expected statuses')]
    public function get_post_delete_api_tournament_teams_and_roster_return_expected_statuses(): void
    {
        $admin = $this->createUser('admin');
        $manager = $this->createUser('manager');
        $team = $this->createTeam($manager);
        $player = $this->createPlayer($team);
        $tournament = $this->createTournament($admin);

        $this->getJson("/api/tournaments/{$tournament->id}/teams")
            ->assertOk()
            ->assertJsonCount(0);

        Sanctum::actingAs($admin);
        $this->postJson("/api/tournaments/{$tournament->id}/teams", [
            'team_id' => $team->id,
            'group_code' => 'A',
            'seed' => 1,
        ])
            ->assertCreated()
            ->assertJsonPath('team_id', $team->id);

        $this->getJson("/api/tournaments/{$tournament->id}/teams")
            ->assertOk()
            ->assertJsonPath('0.team_id', $team->id);

        $this->getJson("/api/tournaments/{$tournament->id}/teams/{$team->id}/players")
            ->assertOk()
            ->assertJsonCount(0);

        $this->postJson("/api/tournaments/{$tournament->id}/teams/{$team->id}/players", [
            'player_id' => $player->id,
        ])
            ->assertCreated()
            ->assertJsonPath('player_id', $player->id);

        $this->deleteJson("/api/tournaments/{$tournament->id}/teams/{$team->id}/players/{$player->id}")
            ->assertOk()
            ->assertJsonPath('message', 'Removed from roster');

        $this->deleteJson("/api/tournaments/{$tournament->id}/teams/{$team->id}")
            ->assertOk()
            ->assertJsonPath('message', 'Unregistered and related requests removed');
    }

    #[Test]
    #[TestDox('GET/POST/PUT/DELETE /api/matches, PDF, stats, and schedule clear endpoints return expected statuses')]
    public function get_post_put_delete_api_matches_and_pdf_stats_schedule_clear_return_expected_statuses(): void
    {
        $admin = $this->createUser('admin');
        $homeTeam = $this->createTeam($this->createUser('manager'), ['name' => 'Wolves']);
        $awayTeam = $this->createTeam($this->createUser('manager'), ['name' => 'Falcons']);
        $homePlayer = $this->createPlayer($homeTeam, ['first_name' => 'Jonas']);
        $tournament = $this->createTournament($admin);

        foreach ([$homeTeam, $awayTeam] as $team) {
            TournamentTeam::create([
                'tournament_id' => $tournament->id,
                'team_id' => $team->id,
            ]);
        }

        Sanctum::actingAs($admin);
        $created = $this->postJson("/api/tournaments/{$tournament->id}/matches", [
            'home_team_id' => $homeTeam->id,
            'away_team_id' => $awayTeam->id,
            'stage' => 'group',
            'round_number' => 1,
            'scheduled_at' => '2026-06-01 18:00:00',
            'venue_name' => 'Main Arena',
        ])
            ->assertCreated()
            ->assertJsonPath('home_team_id', $homeTeam->id)
            ->assertJsonPath('venue_name', 'Main Arena')
            ->json();

        $gameId = $created['id'];

        $this->getJson("/api/tournaments/{$tournament->id}/matches")
            ->assertOk()
            ->assertJsonPath('0.id', $gameId);

        $this->getJson("/api/matches/{$gameId}")
            ->assertOk()
            ->assertJsonPath('id', $gameId);

        $this->putJson("/api/matches/{$gameId}", [
            'scheduled_at' => '2026-06-01 20:00:00',
            'venue_name' => 'Practice Hall',
            'status' => 'live',
        ])
            ->assertOk()
            ->assertJsonPath('status', 'live')
            ->assertJsonPath('venue_name', 'Practice Hall');

        $this->postJson("/api/matches/{$gameId}/stats", [
            'stats' => [
                [
                    'player_id' => $homePlayer->id,
                    'team_id' => $homeTeam->id,
                    'minutes' => 30,
                    'points' => 24,
                    'rebounds' => 8,
                    'assists' => 5,
                    'fgm' => 9,
                    'fga' => 15,
                    'tpm' => 2,
                    'tpa' => 5,
                    'ftm' => 4,
                    'fta' => 6,
                ],
            ],
        ])
            ->assertCreated()
            ->assertJsonPath('message', 'Stats saved');

        $this->getJson("/api/matches/{$gameId}/stats")
            ->assertOk()
            ->assertJsonPath('0.points', 24);

        $this->get("/api/matches/{$gameId}/export/pdf")
            ->assertOk()
            ->assertHeader('Content-Type', 'application/pdf');

        $this->deleteJson("/api/matches/{$gameId}")
            ->assertOk()
            ->assertJsonPath('message', 'Deleted');

        Game::create([
            'tournament_id' => $tournament->id,
            'home_team_id' => $homeTeam->id,
            'away_team_id' => $awayTeam->id,
            'status' => 'scheduled',
        ]);

        $this->deleteJson("/api/tournaments/{$tournament->id}/schedule")
            ->assertOk()
            ->assertJsonPath('message', 'Schedule cleared');
    }

    #[Test]
    #[TestDox('GET/POST/DELETE participation request list, reject, and delete endpoints return expected statuses')]
    public function get_post_delete_api_participation_requests_list_reject_delete_return_expected_statuses(): void
    {
        $admin = $this->createUser('admin');
        $manager = $this->createUser('manager');
        $team = $this->createTeam($manager);
        $tournament = $this->createTournament($admin);
        $requestRow = TournamentParticipationRequest::create([
            'tournament_id' => $tournament->id,
            'team_id' => $team->id,
            'manager_id' => $manager->id,
            'status' => 'pending',
            'note' => 'Please approve',
        ]);

        Sanctum::actingAs($manager);
        $this->getJson("/api/tournaments/{$tournament->id}/participation-requests/mine")
            ->assertOk()
            ->assertJsonPath('0.id', $requestRow->id);

        Sanctum::actingAs($admin);
        $this->getJson("/api/tournaments/{$tournament->id}/participation-requests")
            ->assertOk()
            ->assertJsonPath('0.id', $requestRow->id);

        $this->postJson("/api/participation-requests/{$requestRow->id}/reject", [
            'note' => 'Not enough players',
        ])
            ->assertOk()
            ->assertJsonPath('status', 'rejected')
            ->assertJsonPath('note', 'Not enough players');

        $this->deleteJson("/api/participation-requests/{$requestRow->id}")
            ->assertOk()
            ->assertJsonPath('message', 'Request removed');
    }

    private function rebuildSchema(): void
    {
        foreach ([
            'personal_access_tokens',
            'match_player_stats',
            'tournament_participation_requests',
            'tournament_team_players',
            'tournament_teams',
            'matches',
            'players',
            'teams',
            'tournaments',
            'users',
        ] as $table) {
            Schema::dropIfExists($table);
        }

        Schema::create('users', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password');
            $table->string('role', 20)->default('manager');
            $table->rememberToken();
            $table->timestamps();
        });

        Schema::create('personal_access_tokens', function (Blueprint $table): void {
            $table->id();
            $table->morphs('tokenable');
            $table->text('name');
            $table->string('token', 64)->unique();
            $table->text('abilities')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
        });

        Schema::create('teams', function (Blueprint $table): void {
            $table->id();
            $table->string('name', 150);
            $table->string('city', 100)->nullable();
            $table->unsignedBigInteger('manager_id')->nullable();
            $table->timestamps();
        });

        Schema::create('tournaments', function (Blueprint $table): void {
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
            $table->unsignedInteger('venues_count')->default(1);
            $table->json('venue_names')->nullable();
            $table->string('venue_name', 150)->nullable();
            $table->unsignedInteger('playoff_round_gap_days')->default(1);
            $table->unsignedInteger('groups_to_playoffs_gap_days')->default(1);
            $table->unsignedInteger('group_games_per_day')->nullable();
            $table->unsignedInteger('stage_day_gap_days')->default(0);
            $table->date('registration_deadline')->nullable();
            $table->boolean('participants_locked')->default(false);
            $table->timestamps();
        });

        Schema::create('players', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('team_id');
            $table->string('first_name');
            $table->string('last_name');
            $table->unsignedInteger('jersey_number')->nullable();
            $table->timestamps();
        });

        Schema::create('matches', function (Blueprint $table): void {
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

        Schema::create('tournament_teams', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('tournament_id');
            $table->unsignedBigInteger('team_id');
            $table->string('group_code', 10)->nullable();
            $table->unsignedInteger('seed')->nullable();
            $table->timestamps();
            $table->unique(['tournament_id', 'team_id']);
        });

        Schema::create('tournament_participation_requests', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('tournament_id');
            $table->unsignedBigInteger('team_id');
            $table->unsignedBigInteger('manager_id');
            $table->string('status', 20)->default('pending');
            $table->text('note')->nullable();
            $table->unsignedBigInteger('reviewed_by')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
            $table->unique(['tournament_id', 'team_id']);
        });

        Schema::create('tournament_team_players', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('tournament_id');
            $table->unsignedBigInteger('team_id');
            $table->unsignedBigInteger('player_id');
            $table->timestamps();
            $table->unique(['tournament_id', 'team_id', 'player_id']);
        });

        Schema::create('match_player_stats', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('match_id');
            $table->unsignedBigInteger('player_id');
            $table->unsignedBigInteger('team_id');
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
            $table->boolean('dnp')->default(false);
            $table->boolean('fouled_out')->default(false);
            $table->unsignedInteger('minutes')->default(0);
            $table->unsignedInteger('played_seconds')->default(0);
            $table->timestamps();
        });
    }

    private function createUser(string $role): User
    {
        return User::create([
            'name' => ucfirst($role) . ' User ' . uniqid(),
            'email' => $role . uniqid() . '@example.com',
            'password' => Hash::make('password'),
            'role' => $role,
        ]);
    }

    private function createTeam(User $manager, array $attributes = []): Team
    {
        return Team::create(array_merge([
            'name' => 'Team ' . uniqid(),
            'city' => 'Kaunas',
            'manager_id' => $manager->id,
        ], $attributes));
    }

    private function createPlayer(Team $team, array $attributes = []): Player
    {
        return Player::create(array_merge([
            'team_id' => $team->id,
            'first_name' => 'Player',
            'last_name' => uniqid(),
            'jersey_number' => 10,
        ], $attributes));
    }

    private function createTournament(User $admin, array $attributes = []): Tournament
    {
        return Tournament::create(array_merge($this->validTournamentPayload(), [
            'created_by' => $admin->id,
            'status' => 'draft',
            'participants_locked' => false,
            'venue_name' => 'Main Arena',
        ], $attributes));
    }

    private function validTournamentPayload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Spring Cup',
            'start_date' => '2026-06-01',
            'end_date' => '2026-06-07',
            'format' => 'single_elimination',
            'max_teams' => 8,
            'duration_weeks' => 1,
            'allowed_days' => [1, 2, 3, 4, 5, 6, 7],
            'time_slots' => ['18:00', '20:00'],
            'venue_name' => 'Main Arena',
            'playoff_round_gap_days' => 1,
            'groups_to_playoffs_gap_days' => 1,
            'registration_deadline' => '2026-06-01',
        ], $overrides);
    }
}
