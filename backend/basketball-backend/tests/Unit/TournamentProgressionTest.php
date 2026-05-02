<?php

namespace Tests\Unit;

use App\Support\TournamentProgression;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class TournamentProgressionTest extends TestCase
{
    #[Test]
    public function seeded_round_one_pairings_match_highest_seed_against_lowest_seed(): void
    {
        $rows = [
            ['team_id' => 11, 'rank' => 1, 'points' => 14, 'diff' => 30, 'points_for' => 500],
            ['team_id' => 12, 'rank' => 2, 'points' => 13, 'diff' => 20, 'points_for' => 490],
            ['team_id' => 13, 'rank' => 3, 'points' => 12, 'diff' => 10, 'points_for' => 480],
            ['team_id' => 14, 'rank' => 4, 'points' => 11, 'diff' => 0, 'points_for' => 470],
        ];

        $pairings = TournamentProgression::roundOnePairings([['rows' => $rows]], 4);

        self::assertSame(11, $pairings[0]['home']['team_id']);
        self::assertSame(14, $pairings[0]['away']['team_id']);
        self::assertSame(12, $pairings[1]['home']['team_id']);
        self::assertSame(13, $pairings[1]['away']['team_id']);
    }

    #[Test]
    public function paired_group_crossovers_match_group_winners_against_other_group_runner_ups(): void
    {
        $groups = [
            [
                'rows' => [
                    ['team_id' => 1, 'rank' => 1, 'points' => 6, 'diff' => 20, 'points_for' => 180],
                    ['team_id' => 2, 'rank' => 2, 'points' => 5, 'diff' => 10, 'points_for' => 170],
                ],
            ],
            [
                'rows' => [
                    ['team_id' => 3, 'rank' => 1, 'points' => 6, 'diff' => 18, 'points_for' => 175],
                    ['team_id' => 4, 'rank' => 2, 'points' => 5, 'diff' => 8, 'points_for' => 165],
                ],
            ],
        ];

        $pairings = TournamentProgression::roundOnePairings($groups, 4);

        self::assertSame(1, $pairings[0]['home']['team_id']);
        self::assertSame(4, $pairings[0]['away']['team_id']);
        self::assertSame(3, $pairings[1]['home']['team_id']);
        self::assertSame(2, $pairings[1]['away']['team_id']);
    }

    #[Test]
    public function round_one_pairings_fall_back_to_seeded_order_when_groups_do_not_pair_evenly(): void
    {
        $groups = [
            ['rows' => [['team_id' => 1, 'rank' => 1, 'points' => 8, 'diff' => 30, 'points_for' => 220]]],
            ['rows' => [['team_id' => 2, 'rank' => 1, 'points' => 7, 'diff' => 25, 'points_for' => 210]]],
            [
                'rows' => [
                    ['team_id' => 3, 'rank' => 1, 'points' => 6, 'diff' => 20, 'points_for' => 200],
                    ['team_id' => 4, 'rank' => 2, 'points' => 5, 'diff' => 15, 'points_for' => 190],
                ],
            ],
        ];

        $pairings = TournamentProgression::roundOnePairings($groups, 4);

        self::assertSame(1, $pairings[0]['home']['team_id']);
        self::assertSame(4, $pairings[0]['away']['team_id']);
        self::assertSame(2, $pairings[1]['home']['team_id']);
        self::assertSame(3, $pairings[1]['away']['team_id']);
    }

    #[Test]
    public function winner_team_id_returns_the_winner_only_for_finished_non_tied_matches(): void
    {
        self::assertSame(7, TournamentProgression::winnerFromMatch(
            new \App\Models\Game([
                'home_team_id' => 7,
                'away_team_id' => 8,
                'home_score' => 91,
                'away_score' => 88,
                'status' => 'finished',
            ]),
        ));

        self::assertSame(8, TournamentProgression::winnerFromMatch(
            [
                'home_team_id' => 7,
                'away_team_id' => 8,
                'home_score' => 71,
                'away_score' => 80,
                'status' => 'finished',
            ],
        ));

        self::assertNull(TournamentProgression::winnerFromMatch(
            new \App\Models\Game([
                'home_team_id' => 7,
                'away_team_id' => 8,
                'home_score' => 80,
                'away_score' => 80,
                'status' => 'finished',
            ]),
        ));

        self::assertNull(TournamentProgression::winnerFromMatch(
            new \App\Models\Game([
                'home_team_id' => 7,
                'away_team_id' => 8,
                'home_score' => 91,
                'away_score' => 88,
                'status' => 'scheduled',
            ]),
        ));
    }

    #[Test]
    public function round_one_pairings_are_empty_without_enough_groups_or_qualifiers(): void
    {
        self::assertSame([], TournamentProgression::roundOnePairings([], 4));
        self::assertSame([], TournamentProgression::roundOnePairings(
            [
                ['rows' => [['team_id' => 1, 'rank' => 1, 'points' => 2, 'diff' => 3, 'points_for' => 80]]],
            ],
            1,
        ));
    }

    #[Test]
    public function seeded_fallback_uses_tiebreakers_before_building_bracket_pairs(): void
    {
        $groups = [
            [
                'rows' => [
                    ['team_id' => 1, 'rank' => 1, 'points' => 8, 'diff' => 10, 'points_for' => 210],
                    ['team_id' => 2, 'rank' => 1, 'points' => 8, 'diff' => 14, 'points_for' => 205],
                    ['team_id' => 3, 'rank' => 1, 'points' => 8, 'diff' => 14, 'points_for' => 220],
                    ['team_id' => 4, 'rank' => 2, 'points' => 7, 'diff' => 18, 'points_for' => 230],
                ],
            ],
        ];

        $pairings = TournamentProgression::roundOnePairings($groups, 4);

        self::assertSame(3, $pairings[0]['home']['team_id']);
        self::assertSame(4, $pairings[0]['away']['team_id']);
        self::assertSame(2, $pairings[1]['home']['team_id']);
        self::assertSame(1, $pairings[1]['away']['team_id']);
    }

    #[Test]
    public function next_round_participants_are_calculated_from_previous_match_winners(): void
    {
        $participants = TournamentProgression::nextRoundParticipants([
            [
                'home_team_id' => 1,
                'away_team_id' => 2,
                'home_score' => 91,
                'away_score' => 80,
                'status' => 'finished',
            ],
            [
                'home_team_id' => 3,
                'away_team_id' => 4,
                'home_score' => 77,
                'away_score' => 82,
                'status' => 'finished',
            ],
        ], 0);

        self::assertSame(['home_team_id' => 1, 'away_team_id' => 4], $participants);
    }

    #[Test]
    public function qualifier_counts_are_calculated_from_team_count_without_database(): void
    {
        self::assertSame(0, TournamentProgression::playoffQualifiedCountForTeamCount(1));
        self::assertSame(2, TournamentProgression::playoffQualifiedCountForTeamCount(2));
        self::assertSame(4, TournamentProgression::playoffQualifiedCountForTeamCount(4));
        self::assertSame(8, TournamentProgression::playoffQualifiedCountForTeamCount(12));

        self::assertSame(0, TournamentProgression::roundRobinPlayoffQualifiedCountForTeamCount(3));
        self::assertSame(2, TournamentProgression::roundRobinPlayoffQualifiedCountForTeamCount(4));
        self::assertSame(4, TournamentProgression::roundRobinPlayoffQualifiedCountForTeamCount(8));
        self::assertSame(4, TournamentProgression::roundRobinPlayoffQualifiedCountForTeamCount(10));
    }

    private function invokeProgressionMethod(string $method, array $args): mixed
    {
        $invoker = \Closure::bind(
            function (string $method, array $args): mixed {
                return self::{$method}(...$args);
            },
            null,
            TournamentProgression::class,
        );

        return $invoker($method, $args);
    }
}
