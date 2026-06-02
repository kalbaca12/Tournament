<?php

namespace Tests\Unit;

use App\Models\Game;
use App\Models\Team;
use App\Models\Tournament;
use App\Models\TournamentTeam;
use App\Support\TournamentProgression;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class TournamentProgressionTest extends TestCase
{
    use RefreshDatabase;

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
    #[DataProvider('winnerCases')]
    public function winner_team_id_returns_the_expected_winner(object|array $match, ?int $expectedWinner): void
    {
        self::assertSame($expectedWinner, TournamentProgression::winnerFromMatch($match));
    }

    #[Test]
    public function round_one_pairings_are_empty_without_groups(): void
    {
        self::assertSame([], TournamentProgression::roundOnePairings([], 4));
    }

    #[Test]
    public function round_one_pairings_are_empty_without_enough_qualifiers(): void
    {
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
    #[DataProvider('groupsPlayoffsQualifierCountCases')]
    public function groups_playoffs_qualifier_count_is_calculated_from_team_count(int $teamCount, int $expected): void
    {
        self::assertSame($expected, TournamentProgression::playoffQualifiedCountForTeamCount($teamCount));
    }

    #[Test]
    public function groups_playoffs_qualifier_count_uses_group_rules(): void
    {
        self::assertSame(4, TournamentProgression::playoffQualifiedCountForTeamCount(16, 8, 2));
        self::assertSame(8, TournamentProgression::playoffQualifiedCountForTeamCount(16, 4, 2));
        self::assertSame(0, TournamentProgression::playoffQualifiedCountForTeamCount(16, 8, 3));
    }

    #[Test]
    public function group_playoff_options_only_return_clean_bracket_setups(): void
    {
        self::assertTrue(TournamentProgression::validGroupPlayoffSetup(16, 8, 2));
        self::assertFalse(TournamentProgression::validGroupPlayoffSetup(16, 8, 3));
        self::assertFalse(TournamentProgression::validGroupPlayoffSetup(12, 4, 2));

        self::assertSame([
            ['group_size' => 4, 'group_advance_count' => 1, 'playoff_team_count' => 4],
            ['group_size' => 4, 'group_advance_count' => 2, 'playoff_team_count' => 8],
            ['group_size' => 8, 'group_advance_count' => 1, 'playoff_team_count' => 2],
            ['group_size' => 8, 'group_advance_count' => 2, 'playoff_team_count' => 4],
            ['group_size' => 8, 'group_advance_count' => 4, 'playoff_team_count' => 8],
        ], TournamentProgression::groupPlayoffOptions(16));

        self::assertSame([], TournamentProgression::groupPlayoffOptions(12));
    }

    #[Test]
    #[DataProvider('roundRobinQualifierCountCases')]
    public function round_robin_qualifier_count_is_calculated_from_team_count(int $teamCount, int $expected): void
    {
        self::assertSame($expected, TournamentProgression::roundRobinPlayoffQualifiedCountForTeamCount($teamCount));
    }

    #[Test]
    public function sync_updates_round_robin_playoff_participants_and_next_round_winners(): void
    {
        $tournament = Tournament::create([
            'name' => 'League Cup',
            'format' => 'round_robin',
            'status' => 'active',
            'start_date' => '2026-04-01',
            'end_date' => '2026-04-10',
        ]);
        $teams = collect(range(1, 8))->map(function (int $number) use ($tournament): Team {
            $team = Team::create(['name' => 'Team ' . $number, 'city' => 'City']);
            TournamentTeam::create(['tournament_id' => $tournament->id, 'team_id' => $team->id]);

            return $team;
        })->values();

        $firstSemi = Game::create([
            'tournament_id' => $tournament->id,
            'home_team_id' => $teams[0]->id,
            'away_team_id' => $teams[3]->id,
            'stage' => 'playoffs',
            'round_number' => 1,
            'home_score' => 80,
            'away_score' => 70,
            'status' => 'finished',
        ]);
        $secondSemi = Game::create([
            'tournament_id' => $tournament->id,
            'home_team_id' => $teams[1]->id,
            'away_team_id' => $teams[2]->id,
            'stage' => 'playoffs',
            'round_number' => 1,
            'home_score' => 63,
            'away_score' => 69,
            'status' => 'finished',
        ]);
        $final = Game::create([
            'tournament_id' => $tournament->id,
            'stage' => 'playoffs',
            'round_number' => 2,
            'status' => 'scheduled',
        ]);

        TournamentProgression::sync($tournament);

        $firstSemi->refresh();
        $secondSemi->refresh();
        $final->refresh();

        self::assertSame($teams[0]->id, $firstSemi->home_team_id);
        self::assertSame($teams[3]->id, $firstSemi->away_team_id);
        self::assertSame('finished', $firstSemi->status);
        self::assertSame($teams[1]->id, $secondSemi->home_team_id);
        self::assertSame($teams[2]->id, $secondSemi->away_team_id);
        self::assertSame($teams[0]->id, $final->home_team_id);
        self::assertSame($teams[2]->id, $final->away_team_id);
        self::assertSame('scheduled', $final->status);
    }

    #[Test]
    public function sync_updates_group_playoff_entrants_from_group_standings(): void
    {
        $tournament = Tournament::create([
            'name' => 'Groups Cup',
            'format' => 'groups_playoffs',
            'status' => 'active',
            'start_date' => '2026-04-01',
            'end_date' => '2026-04-10',
            'max_teams' => 8,
            'group_size' => 4,
            'group_advance_count' => 2,
        ]);

        $teams = collect(range(1, 8))->map(function (int $number) use ($tournament): Team {
            $team = Team::create(['name' => 'Team ' . $number, 'city' => 'City']);
            TournamentTeam::create([
                'tournament_id' => $tournament->id,
                'team_id' => $team->id,
                'group_code' => $number <= 4 ? 'A' : 'B',
            ]);

            return $team;
        })->values();

        $this->groupResult($tournament, $teams[0], $teams[1], 'A', 80, 70);
        $this->groupResult($tournament, $teams[0], $teams[2], 'A', 81, 70);
        $this->groupResult($tournament, $teams[0], $teams[3], 'A', 82, 70);
        $this->groupResult($tournament, $teams[1], $teams[2], 'A', 80, 70);
        $this->groupResult($tournament, $teams[1], $teams[3], 'A', 81, 70);
        $this->groupResult($tournament, $teams[2], $teams[3], 'A', 80, 70);

        $this->groupResult($tournament, $teams[4], $teams[5], 'B', 80, 70);
        $this->groupResult($tournament, $teams[4], $teams[6], 'B', 81, 70);
        $this->groupResult($tournament, $teams[4], $teams[7], 'B', 82, 70);
        $this->groupResult($tournament, $teams[5], $teams[6], 'B', 80, 70);
        $this->groupResult($tournament, $teams[5], $teams[7], 'B', 81, 70);
        $this->groupResult($tournament, $teams[6], $teams[7], 'B', 80, 70);

        $semiA = Game::create([
            'tournament_id' => $tournament->id,
            'stage' => 'playoffs',
            'round_number' => 1,
            'status' => 'scheduled',
        ]);
        $semiB = Game::create([
            'tournament_id' => $tournament->id,
            'stage' => 'playoffs',
            'round_number' => 1,
            'status' => 'scheduled',
        ]);

        TournamentProgression::sync($tournament);

        $semiA->refresh();
        $semiB->refresh();

        self::assertSame($teams[0]->id, $semiA->home_team_id);
        self::assertSame($teams[5]->id, $semiA->away_team_id);
        self::assertSame($teams[4]->id, $semiB->home_team_id);
        self::assertSame($teams[1]->id, $semiB->away_team_id);
    }

    public static function winnerCases(): array
    {
        return [
            'home team wins finished eloquent match' => [
                new \App\Models\Game([
                    'home_team_id' => 7,
                    'away_team_id' => 8,
                    'home_score' => 91,
                    'away_score' => 88,
                    'status' => 'finished',
                ]),
                7,
            ],
            'away team wins finished array match' => [
                [
                    'home_team_id' => 7,
                    'away_team_id' => 8,
                    'home_score' => 71,
                    'away_score' => 80,
                    'status' => 'finished',
                ],
                8,
            ],
            'tied match has no winner' => [
                new \App\Models\Game([
                    'home_team_id' => 7,
                    'away_team_id' => 8,
                    'home_score' => 80,
                    'away_score' => 80,
                    'status' => 'finished',
                ]),
                null,
            ],
            'scheduled match has no winner' => [
                new \App\Models\Game([
                    'home_team_id' => 7,
                    'away_team_id' => 8,
                    'home_score' => 91,
                    'away_score' => 88,
                    'status' => 'scheduled',
                ]),
                null,
            ],
        ];
    }

    public static function groupsPlayoffsQualifierCountCases(): array
    {
        return [
            'one team' => [1, 0],
            'two teams' => [2, 0],
            'four teams' => [4, 2],
            'eight teams' => [8, 4],
            'unsupported twelve teams' => [12, 0],
            'sixteen teams' => [16, 8],
            'thirty two teams' => [32, 16],
        ];
    }

    public static function roundRobinQualifierCountCases(): array
    {
        return [
            'three teams' => [3, 0],
            'four teams' => [4, 2],
            'eight teams' => [8, 4],
            'ten teams' => [10, 4],
        ];
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

    private function groupResult(Tournament $tournament, Team $home, Team $away, string $group, int $homeScore, int $awayScore): void
    {
        Game::create([
            'tournament_id' => $tournament->id,
            'home_team_id' => $home->id,
            'away_team_id' => $away->id,
            'stage' => 'group',
            'group_code' => $group,
            'round_number' => 1,
            'home_score' => $homeScore,
            'away_score' => $awayScore,
            'status' => 'finished',
        ]);
    }
}
