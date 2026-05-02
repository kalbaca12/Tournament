<?php

namespace Tests\Unit;

use App\Support\TournamentStandings;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

class TournamentStandingsTest extends TestCase
{
    #[Test]
    public function finished_matches_update_points_wins_losses_and_score_difference(): void
    {
        $table = $this->invokeStandingsMethod('emptyTable', [[1, 2]]);

        $this->invokeStandingsMethod('applyMatchesToTable', [
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

        $this->invokeStandingsMethod('sortRows', [&$rows]);
        $rankedRows = $this->invokeStandingsMethod('withRanks', [$rows]);

        self::assertSame([3, 2, 1], array_column($rankedRows, 'team_id'));
        self::assertSame([1, 2, 3], array_column($rankedRows, 'rank'));
    }

    #[Test]
    public function matches_with_teams_outside_the_table_are_ignored(): void
    {
        $table = $this->invokeStandingsMethod('emptyTable', [[1, 2]]);

        $this->invokeStandingsMethod('applyMatchesToTable', [
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
        $table = $this->invokeStandingsMethod('emptyTable', [[1, 2]]);

        $this->invokeStandingsMethod('applyMatchesToTable', [
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
                1 => ['name' => 'Wolves', 'city' => 'Kaunas'],
                2 => ['name' => 'Falcons', 'city' => 'Vilnius'],
                3 => ['name' => 'Bulls', 'city' => 'Klaipeda'],
            ],
        );

        self::assertSame([3, 1, 2], array_column($rows, 'team_id'));
        self::assertSame([3, 3, 3], array_column($rows, 'points'));
        self::assertSame('Bulls', $rows[0]['team_name']);
        self::assertSame('Klaipeda', $rows[0]['city']);
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
                1 => ['name' => 'Wolves', 'city' => 'Kaunas'],
                2 => ['name' => 'Falcons', 'city' => 'Vilnius'],
                3 => ['name' => 'Bulls', 'city' => 'Klaipeda'],
                4 => ['name' => 'Lions', 'city' => 'Siauliai'],
            ],
        );

        self::assertSame(['A', 'B'], array_column($groups, 'group_code'));
        self::assertSame(1, $groups[0]['rows'][0]['team_id']);
        self::assertSame('Wolves', $groups[0]['rows'][0]['team_name']);
        self::assertSame(1, $groups[0]['rows'][0]['played']);
        self::assertSame(2, $groups[0]['rows'][0]['points']);
        self::assertSame(4, $groups[1]['rows'][0]['team_id']);
        self::assertSame('Lions', $groups[1]['rows'][0]['team_name']);
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
