<?php

namespace Tests\Unit;

use App\Models\Game;
use App\Models\Team;
use App\Models\Tournament;
use App\Models\TournamentTeam;
use App\Support\TournamentStandings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class TournamentStandingsTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function finished_matches_update_points_wins_losses_and_score_difference(): void
    {
        $table = $this->invokeStandingsMethod('initTable', [[1, 2]]);

        $this->invokeStandingsMethod('applyMatches', [
            &$table,
            [
                (object) [
                    'home_team_id' => 1,
                    'away_team_id' => 2,
                    'home_score' => 81,
                    'away_score' => 77,
                ],
            ],
        ]);

        self::assertSame(1, $table[1]['played']);
        self::assertSame(1, $table[1]['wins']);
        self::assertSame(0, $table[1]['losses']);
        self::assertSame(81, $table[1]['points_for']);
        self::assertSame(77, $table[1]['points_against']);
        self::assertSame(4, $table[1]['diff']);
        self::assertSame(2, $table[1]['points']);

        self::assertSame(1, $table[2]['played']);
        self::assertSame(0, $table[2]['wins']);
        self::assertSame(1, $table[2]['losses']);
        self::assertSame(-4, $table[2]['diff']);
        self::assertSame(1, $table[2]['points']);
    }

    #[Test]
    public function rows_are_sorted_by_points_then_difference_then_points_scored(): void
    {
        $rows = [
            [
                'team_id' => 1,
                'played' => 2,
                'wins' => 1,
                'losses' => 1,
                'points_for' => 140,
                'points_against' => 130,
                'diff' => 10,
                'points' => 3,
            ],
            [
                'team_id' => 2,
                'played' => 2,
                'wins' => 1,
                'losses' => 1,
                'points_for' => 150,
                'points_against' => 140,
                'diff' => 10,
                'points' => 3,
            ],
            [
                'team_id' => 3,
                'played' => 2,
                'wins' => 2,
                'losses' => 0,
                'points_for' => 135,
                'points_against' => 120,
                'diff' => 15,
                'points' => 4,
            ],
        ];

        $this->invokeStandingsMethod('sortTable', [&$rows]);
        $rankedRows = $this->invokeStandingsMethod('ranked', [$rows]);

        self::assertSame([3, 2, 1], array_column($rankedRows, 'team_id'));
        self::assertSame([1, 2, 3], array_column($rankedRows, 'rank'));
    }

    #[Test]
    public function matches_with_teams_outside_the_table_are_ignored(): void
    {
        $table = $this->invokeStandingsMethod('initTable', [[1, 2]]);

        $this->invokeStandingsMethod('applyMatches', [
            &$table,
            [
                (object) [
                    'home_team_id' => 1,
                    'away_team_id' => 99,
                    'home_score' => 90,
                    'away_score' => 70,
                ],
            ],
        ]);

        self::assertSame(0, $table[1]['played']);
        self::assertSame(0, $table[1]['points']);
        self::assertSame(0, $table[2]['played']);
        self::assertSame(0, $table[2]['points']);
    }

    #[Test]
    public function tied_match_updates_played_scores_and_difference_without_wins_or_losses(): void
    {
        $table = $this->invokeStandingsMethod('initTable', [[1, 2]]);

        $this->invokeStandingsMethod('applyMatches', [
            &$table,
            [
                (object) [
                    'home_team_id' => 1,
                    'away_team_id' => 2,
                    'home_score' => 75,
                    'away_score' => 75,
                ],
            ],
        ]);

        self::assertSame(1, $table[1]['played']);
        self::assertSame(0, $table[1]['wins']);
        self::assertSame(0, $table[1]['losses']);
        self::assertSame(0, $table[1]['points']);
        self::assertSame(0, $table[1]['diff']);
        self::assertSame(75, $table[2]['points_for']);
        self::assertSame(75, $table[2]['points_against']);
    }

    #[Test]
    public function calculate_overall_rows_accepts_plain_data_and_returns_ranked_team_rows(): void
    {
        $rows = TournamentStandings::calculateOverallRows(
            [1, 2, 3],
            [
                ['home_team_id' => 1, 'away_team_id' => 2, 'home_score' => 90, 'away_score' => 80],
                ['home_team_id' => 3, 'away_team_id' => 1, 'home_score' => 70, 'away_score' => 60],
                ['home_team_id' => 2, 'away_team_id' => 3, 'home_score' => 75, 'away_score' => 72],
            ],
            [
                1 => ['name' => 'Wolves', 'city' => 'Kaunas', 'logo_url' => 'https://example.com/wolves.svg'],
                2 => ['name' => 'Falcons', 'city' => 'Vilnius'],
                3 => ['name' => 'Bulls', 'city' => 'Klaipeda', 'logo_url' => 'https://example.com/bulls.svg'],
            ],
        );

        self::assertSame([3, 1, 2], array_column($rows, 'team_id'));
        self::assertSame([3, 3, 3], array_column($rows, 'points'));
        self::assertSame('Bulls', $rows[0]['team_name']);
        self::assertSame('Klaipeda', $rows[0]['city']);
        self::assertSame('https://example.com/bulls.svg', $rows[0]['logo_url']);
        self::assertSame(1, $rows[0]['rank']);
    }

    #[Test]
    public function calculate_grouped_rows_builds_separate_ranked_tables_and_ignores_unfinished_results(): void
    {
        $groups = TournamentStandings::calculateGroupedRows(
            [
                ['group_code' => 'B', 'home_team_id' => 3, 'away_team_id' => 4, 'home_score' => 60, 'away_score' => 66, 'status' => 'finished'],
                ['group_code' => 'A', 'home_team_id' => 1, 'away_team_id' => 2, 'home_score' => 80, 'away_score' => 70, 'status' => 'finished'],
                ['group_code' => 'A', 'home_team_id' => 1, 'away_team_id' => 2, 'home_score' => 50, 'away_score' => 40, 'status' => 'scheduled'],
            ],
            [
                1 => ['name' => 'Wolves', 'city' => 'Kaunas', 'logo_url' => 'https://example.com/wolves.svg'],
                2 => ['name' => 'Falcons', 'city' => 'Vilnius'],
                3 => ['name' => 'Bulls', 'city' => 'Klaipeda'],
                4 => ['name' => 'Lions', 'city' => 'Siauliai', 'logo_url' => 'https://example.com/lions.svg'],
            ],
        );

        self::assertSame(['A', 'B'], array_column($groups, 'group_code'));
        self::assertSame(1, $groups[0]['rows'][0]['team_id']);
        self::assertSame('Wolves', $groups[0]['rows'][0]['team_name']);
        self::assertSame(1, $groups[0]['rows'][0]['played']);
        self::assertSame(2, $groups[0]['rows'][0]['points']);
        self::assertSame('https://example.com/wolves.svg', $groups[0]['rows'][0]['logo_url']);
        self::assertSame(4, $groups[1]['rows'][0]['team_id']);
        self::assertSame('Lions', $groups[1]['rows'][0]['team_name']);
    }

    #[Test]
    public function overall_loads_finished_non_playoff_matches_from_the_database(): void
    {
        $tournament = Tournament::create([
            'name' => 'City Cup',
            'format' => 'round_robin',
            'status' => 'active',
            'start_date' => '2026-04-01',
            'end_date' => '2026-04-07',
        ]);
        $wolves = Team::create(['name' => 'Wolves', 'city' => 'Kaunas', 'logo_url' => 'https://example.com/wolves.svg']);
        $falcons = Team::create(['name' => 'Falcons', 'city' => 'Vilnius']);
        $bulls = Team::create(['name' => 'Bulls', 'city' => 'Klaipeda']);

        foreach ([$wolves, $falcons, $bulls] as $team) {
            TournamentTeam::create(['tournament_id' => $tournament->id, 'team_id' => $team->id]);
        }

        Game::create([
            'tournament_id' => $tournament->id,
            'home_team_id' => $wolves->id,
            'away_team_id' => $falcons->id,
            'stage' => 'regular',
            'home_score' => 82,
            'away_score' => 75,
            'status' => 'finished',
        ]);
        Game::create([
            'tournament_id' => $tournament->id,
            'home_team_id' => $bulls->id,
            'away_team_id' => $wolves->id,
            'stage' => 'regular',
            'home_score' => 70,
            'away_score' => 77,
            'status' => 'finished',
        ]);
        Game::create([
            'tournament_id' => $tournament->id,
            'home_team_id' => $falcons->id,
            'away_team_id' => $bulls->id,
            'stage' => 'playoffs',
            'home_score' => 91,
            'away_score' => 88,
            'status' => 'finished',
        ]);

        $rows = TournamentStandings::overall($tournament);

        self::assertSame([$wolves->id, $falcons->id, $bulls->id], array_column($rows, 'team_id'));
        self::assertSame([4, 1, 1], array_column($rows, 'points'));
        self::assertSame('Wolves', $rows[0]['team_name']);
        self::assertSame('Kaunas', $rows[0]['city']);
        self::assertSame('https://example.com/wolves.svg', $rows[0]['logo_url']);
    }

    #[Test]
    public function grouped_loads_group_stage_matches_from_the_database(): void
    {
        $tournament = Tournament::create([
            'name' => 'Group Cup',
            'format' => 'groups_playoffs',
            'status' => 'active',
            'start_date' => '2026-04-01',
            'end_date' => '2026-04-09',
        ]);
        $wolves = Team::create(['name' => 'Wolves', 'city' => 'Kaunas']);
        $falcons = Team::create(['name' => 'Falcons', 'city' => 'Vilnius']);
        $bulls = Team::create(['name' => 'Bulls', 'city' => 'Klaipeda']);
        $lions = Team::create(['name' => 'Lions', 'city' => 'Siauliai', 'logo_url' => 'https://example.com/lions.svg']);

        Game::create([
            'tournament_id' => $tournament->id,
            'home_team_id' => $wolves->id,
            'away_team_id' => $falcons->id,
            'stage' => 'group',
            'group_code' => 'A',
            'round_number' => 1,
            'home_score' => 80,
            'away_score' => 71,
            'status' => 'finished',
        ]);
        Game::create([
            'tournament_id' => $tournament->id,
            'home_team_id' => $bulls->id,
            'away_team_id' => $lions->id,
            'stage' => 'group',
            'group_code' => 'B',
            'round_number' => 1,
            'home_score' => 66,
            'away_score' => 72,
            'status' => 'finished',
        ]);
        Game::create([
            'tournament_id' => $tournament->id,
            'home_team_id' => $wolves->id,
            'away_team_id' => $falcons->id,
            'stage' => 'group',
            'group_code' => 'A',
            'round_number' => 2,
            'home_score' => 65,
            'away_score' => 60,
            'status' => 'scheduled',
        ]);

        $groups = TournamentStandings::grouped($tournament);

        self::assertSame(['A', 'B'], array_column($groups, 'group_code'));
        self::assertSame($wolves->id, $groups[0]['rows'][0]['team_id']);
        self::assertSame(2, $groups[0]['rows'][0]['points']);
        self::assertSame($lions->id, $groups[1]['rows'][0]['team_id']);
        self::assertSame('Lions', $groups[1]['rows'][0]['team_name']);
        self::assertSame('https://example.com/lions.svg', $groups[1]['rows'][0]['logo_url']);
    }

    private function invokeStandingsMethod(string $method, array $args): mixed
    {
        $invoker = \Closure::bind(
            function (string $method, array $args): mixed {
                return self::{$method}(...$args);
            },
            null,
            TournamentStandings::class,
        );

        return $invoker($method, $args);
    }
}
