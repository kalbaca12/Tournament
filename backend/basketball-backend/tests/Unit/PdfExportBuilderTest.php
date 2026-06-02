<?php

namespace Tests\Unit;

use App\Models\Game;
use App\Models\MatchPlayerStat;
use App\Models\Player;
use App\Models\Team;
use App\Models\Tournament;
use App\Support\PdfExportBuilder;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

class PdfExportBuilderTest extends TestCase
{
    #[Test]
    public function match_export_returns_pdf_binary(): void
    {
        $tournament = new Tournament([
            'id' => 9,
            'name' => 'Spring Cup',
        ]);

        $homeTeam = new Team([
            'id' => 1,
            'name' => 'Wolves',
        ]);

        $awayTeam = new Team([
            'id' => 2,
            'name' => 'Falcons',
        ]);

        $game = new Game([
            'id' => 15,
            'tournament_id' => 9,
            'home_team_id' => 1,
            'away_team_id' => 2,
            'round_number' => 3,
            'scheduled_at' => '2026-04-18 18:30:00',
            'status' => 'finished',
            'home_score' => 81,
            'away_score' => 77,
        ]);
        $game->setRelation('tournament', $tournament);
        $game->setRelation('homeTeam', $homeTeam);
        $game->setRelation('awayTeam', $awayTeam);

        $player = new Player([
            'id' => 10,
            'first_name' => 'Jonas',
            'last_name' => 'Stone',
        ]);

        $stat = new MatchPlayerStat([
            'id' => 1,
            'player_id' => 10,
            'team_id' => 1,
            'points' => 24,
            'rebounds' => 8,
            'assists' => 5,
            'steals' => 2,
            'blocks' => 1,
            'fouls' => 3,
        ]);
        $stat->setRelation('player', $player);

        $game->setRelation('stats', collect([$stat]));

        $pdf = PdfExportBuilder::match($game);

        self::assertStringStartsWith('%PDF-1.4', $pdf);
        self::assertStringContainsString('/Type /Catalog', $pdf);
        self::assertStringContainsString('Match Export', $pdf);
        self::assertStringContainsString('Wolves vs Falcons', $pdf);
    }

    #[Test]
    public function match_export_can_limit_rendered_sections(): void
    {
        $tournament = new Tournament([
            'id' => 9,
            'name' => 'Spring Cup',
        ]);

        $homeTeam = new Team([
            'id' => 1,
            'name' => 'Wolves',
        ]);

        $awayTeam = new Team([
            'id' => 2,
            'name' => 'Falcons',
        ]);

        $game = new Game([
            'id' => 15,
            'tournament_id' => 9,
            'home_team_id' => 1,
            'away_team_id' => 2,
            'round_number' => 3,
            'scheduled_at' => '2026-04-18 18:30:00',
            'status' => 'finished',
            'home_score' => 81,
            'away_score' => 77,
        ]);
        $game->setRelation('tournament', $tournament);
        $game->setRelation('homeTeam', $homeTeam);
        $game->setRelation('awayTeam', $awayTeam);

        $player = new Player([
            'id' => 10,
            'first_name' => 'Jonas',
            'last_name' => 'Stone',
        ]);

        $stat = new MatchPlayerStat([
            'id' => 1,
            'player_id' => 10,
            'team_id' => 1,
            'points' => 24,
            'rebounds' => 8,
            'assists' => 5,
            'steals' => 2,
            'blocks' => 1,
            'fouls' => 3,
        ]);
        $stat->setRelation('player', $player);

        $game->setRelation('stats', collect([$stat]));

        $pdf = PdfExportBuilder::match($game, ['leaders']);

        self::assertStringContainsString('Match Leaders', $pdf);
        self::assertStringNotContainsString('Team Box Scores', $pdf);
        self::assertStringNotContainsString('Recorded Players', $pdf);
    }

    #[Test]
    public function match_export_with_requested_stat_sections_handles_empty_stats(): void
    {
        $game = new Game([
            'id' => 16,
            'tournament_id' => 9,
            'home_team_id' => 1,
            'away_team_id' => 2,
            'scheduled_at' => '2026-04-18 19:00:00',
            'status' => 'scheduled',
        ]);
        $game->setRelation('tournament', new Tournament(['id' => 9, 'name' => 'Spring Cup']));
        $game->setRelation('homeTeam', new Team(['id' => 1, 'name' => 'Wolves']));
        $game->setRelation('awayTeam', new Team(['id' => 2, 'name' => 'Falcons']));
        $game->setRelation('stats', collect());

        $pdf = PdfExportBuilder::match($game, ['players']);

        self::assertStringStartsWith('%PDF-1.4', $pdf);
        self::assertStringContainsString('No player stats are saved for this match yet.', $pdf);
    }

    #[Test]
    public function match_export_renders_team_totals_and_box_score_sections(): void
    {
        $game = $this->makeMatchWithStats();

        $pdf = PdfExportBuilder::match($game, ['team_totals', 'box_score']);

        self::assertStringContainsString('Team Totals', $pdf);
        self::assertStringContainsString('Team Box Scores', $pdf);
        self::assertStringContainsString('Team total', $pdf);
        self::assertStringContainsString('#12 Jonas Stone', $pdf);
    }

    #[Test]
    public function tournament_export_renders_teams_schedule_and_feasibility_sections(): void
    {
        $tournament = $this->makeTournamentWithTeamsAndMatches();

        $pdf = PdfExportBuilder::tournament($tournament, ['teams', 'schedule', 'feasibility']);

        self::assertStringStartsWith('%PDF-1.4', $pdf);
        self::assertStringContainsString('Tournament Export', $pdf);
        self::assertStringContainsString('Scheduling Feasibility', $pdf);
        self::assertStringContainsString('Approved Teams', $pdf);
        self::assertStringContainsString('Matches By Day', $pdf);
        self::assertStringContainsString('Required matches', $pdf);
        self::assertStringContainsString('Wolves', $pdf);
        self::assertStringContainsString('Falcons', $pdf);
    }

    #[Test]
    public function tournament_export_renders_playoff_rounds(): void
    {
        $tournament = $this->makeTournamentWithTeamsAndMatches();

        $pdf = PdfExportBuilder::tournament($tournament, ['playoffs']);

        self::assertStringContainsString('Playoff Rounds', $pdf);
        self::assertStringContainsString('Final', $pdf);
        self::assertStringContainsString('Wolves', $pdf);
        self::assertStringContainsString('Falcons', $pdf);
    }

    #[Test]
    public function tournament_export_renders_empty_section_notes(): void
    {
        $tournament = new Tournament([
            'id' => 21,
            'name' => 'Empty Cup',
            'format' => 'round_robin',
            'status' => 'draft',
            'start_date' => '2026-05-01',
            'end_date' => '2026-05-02',
            'participants_locked' => false,
        ]);
        $tournament->setRelation('teams', collect());
        $tournament->setRelation('matches', collect());

        $pdf = PdfExportBuilder::tournament($tournament, ['teams', 'schedule', 'playoffs']);

        self::assertStringContainsString('No approved teams are registered for this tournament yet.', $pdf);
        self::assertStringContainsString('No day-based matches are available yet.', $pdf);
        self::assertStringContainsString('No playoff matches are available for this tournament.', $pdf);
    }

    #[Test]
    public function team_stat_tables_group_players_by_team_and_calculate_totals(): void
    {
        $game = new Game([
            'home_team_id' => 1,
            'away_team_id' => 2,
            'home_score' => 81,
            'away_score' => 77,
        ]);
        $game->setRelation('homeTeam', new Team(['id' => 1, 'name' => 'Wolves']));
        $game->setRelation('awayTeam', new Team(['id' => 2, 'name' => 'Falcons']));

        $homePlayer = new Player([
            'id' => 10,
            'first_name' => 'Jonas',
            'last_name' => 'Stone',
            'jersey_number' => 12,
        ]);

        $awayPlayer = new Player([
            'id' => 11,
            'first_name' => 'Mantas',
            'last_name' => 'Lake',
            'jersey_number' => 8,
        ]);

        $homeStat = new MatchPlayerStat([
            'player_id' => 10,
            'team_id' => 1,
            'points' => 24,
            'rebounds' => 8,
            'assists' => 5,
            'steals' => 2,
            'blocks' => 1,
            'fouls' => 3,
            'fgm' => 9,
            'fga' => 15,
            'tpm' => 2,
            'tpa' => 5,
            'ftm' => 4,
            'fta' => 6,
        ]);
        $homeStat->setRelation('player', $homePlayer);

        $awayStat = new MatchPlayerStat([
            'player_id' => 11,
            'team_id' => 2,
            'points' => 18,
            'rebounds' => 6,
            'assists' => 7,
            'steals' => 1,
            'blocks' => 0,
            'fouls' => 2,
            'fgm' => 7,
            'fga' => 13,
            'tpm' => 1,
            'tpa' => 4,
            'ftm' => 3,
            'fta' => 4,
        ]);
        $awayStat->setRelation('player', $awayPlayer);

        $tables = $this->invokePdfMethod('teamStatTables', [$game, collect([$homeStat, $awayStat])]);

        self::assertSame('Wolves', $tables[0]['team_name']);
        self::assertSame('#12 Jonas Stone', $tables[0]['rows'][0]['player']);
        self::assertSame(24, $tables[0]['footer']['points']);
        self::assertSame(8, $tables[0]['footer']['rebounds']);
        self::assertSame(9, $tables[0]['footer']['fgm']);

        self::assertSame('Falcons', $tables[1]['team_name']);
        self::assertSame('#8 Mantas Lake', $tables[1]['rows'][0]['player']);
        self::assertSame(18, $tables[1]['footer']['points']);
        self::assertSame(7, $tables[1]['footer']['assists']);
    }

    #[Test]
    #[DataProvider('labelizeCases')]
    public function labelize_returns_safe_display_values(?string $value, string $expected): void
    {
        self::assertSame($expected, $this->invokePdfMethod('labelize', [$value]));
    }

    #[Test]
    public function safe_value_replaces_empty_text_with_default_label(): void
    {
        self::assertSame('N/A', $this->invokePdfMethod('safeValue', ['']));
    }

    #[Test]
    #[DataProvider('dateTimeCases')]
    public function date_time_helpers_return_safe_display_values(?string $value, string $method, string $expected): void
    {
        self::assertSame($expected, $this->invokePdfMethod($method, [$value]));
    }

    #[Test]
    #[DataProvider('roundLabelCases')]
    public function round_label_formats_known_round_sizes(int $matchCount, string $expected): void
    {
        self::assertSame($expected, $this->invokePdfMethod('roundLabel', [$matchCount]));
    }

    #[Test]
    public function split_tournament_matches_separates_day_matches_and_playoff_rounds(): void
    {
        $tournament = new Tournament(['id' => 9]);
        $groupMatch = new Game([
            'stage' => 'group',
            'round_number' => 1,
            'scheduled_at' => '2026-04-18 18:30:00',
        ]);
        $groupMatch->id = 2;
        $playoffMatch = new Game([
            'stage' => 'playoffs',
            'round_number' => 2,
            'scheduled_at' => '2026-04-19 20:30:00',
        ]);
        $playoffMatch->id = 1;
        $unscheduledMatch = new Game([
            'stage' => 'group',
            'round_number' => 3,
            'scheduled_at' => null,
        ]);
        $unscheduledMatch->id = 3;
        $tournament->setRelation('matches', collect([$playoffMatch, $unscheduledMatch, $groupMatch]));

        [$dayMatches, $playoffRounds] = $this->invokePdfMethod('splitTournamentMatches', [$tournament]);

        self::assertArrayHasKey('2026-04-18', $dayMatches);
        self::assertArrayHasKey('Unscheduled', $dayMatches);
        self::assertSame(2, $dayMatches['2026-04-18'][0]->id);
        self::assertSame(1, $playoffRounds[2][0]->id);
    }

    #[Test]
    public function match_leaders_select_top_players_per_stat_category(): void
    {
        $game = new Game([
            'home_team_id' => 1,
            'away_team_id' => 2,
        ]);
        $game->setRelation('homeTeam', new Team(['id' => 1, 'name' => 'Wolves']));
        $game->setRelation('awayTeam', new Team(['id' => 2, 'name' => 'Falcons']));

        $scorer = new Player(['first_name' => 'Jonas', 'last_name' => 'Stone']);
        $rebounder = new Player(['first_name' => 'Mantas', 'last_name' => 'Lake']);

        $homeStat = new MatchPlayerStat([
            'player_id' => 10,
            'team_id' => 1,
            'points' => 30,
            'rebounds' => 5,
            'assists' => 2,
            'steals' => 1,
            'blocks' => 0,
        ]);
        $homeStat->setRelation('player', $scorer);

        $awayStat = new MatchPlayerStat([
            'player_id' => 11,
            'team_id' => 2,
            'points' => 12,
            'rebounds' => 14,
            'assists' => 9,
            'steals' => 3,
            'blocks' => 2,
        ]);
        $awayStat->setRelation('player', $rebounder);

        $leaders = $this->invokePdfMethod('matchLeaders', [$game, collect([$homeStat, $awayStat])]);

        self::assertSame('Points', $leaders[0]['category']);
        self::assertSame('Jonas Stone', $leaders[0]['player']);
        self::assertSame('30', $leaders[0]['value']);
        self::assertSame('Rebounds', $leaders[1]['category']);
        self::assertSame('Mantas Lake', $leaders[1]['player']);
        self::assertSame('Falcons', $leaders[1]['team']);
    }

    #[Test]
    public function playoff_participant_uses_previous_round_placeholder_for_missing_home_team(): void
    {
        $game = new Game([
            'home_team_id' => null,
            'away_team_id' => 5,
            'home_score' => 88,
            'away_score' => 91,
        ]);
        $game->setRelation('homeTeam', null);
        $game->setRelation('awayTeam', null);

        self::assertSame('Winner of Semifinals 1', $this->invokePdfMethod('playoffParticipantName', [
            $game,
            'home',
            [1 => 2],
            2,
            0,
        ]));
    }

    #[Test]
    public function playoff_participant_uses_team_id_when_relation_is_missing(): void
    {
        $game = new Game([
            'home_team_id' => null,
            'away_team_id' => 5,
            'home_score' => 88,
            'away_score' => 91,
        ]);
        $game->setRelation('homeTeam', null);
        $game->setRelation('awayTeam', null);

        self::assertSame('Team 5', $this->invokePdfMethod('playoffParticipantName', [
            $game,
            'away',
            [1 => 2],
            2,
            0,
        ]));
    }

    #[Test]
    public function playoff_winner_helper_detects_winning_side(): void
    {
        $game = new Game([
            'home_team_id' => null,
            'away_team_id' => 5,
            'home_score' => 88,
            'away_score' => 91,
        ]);

        self::assertFalse($this->invokePdfMethod('isWinner', [$game, 'home']));
        self::assertTrue($this->invokePdfMethod('isWinner', [$game, 'away']));
    }

    #[Test]
    public function score_helpers_format_recorded_and_missing_scores(): void
    {
        $game = new Game([
            'home_score' => 88,
            'away_score' => 91,
        ]);

        self::assertSame('88-91', $this->invokePdfMethod('resultLabel', [$game]));
        self::assertSame('-', $this->invokePdfMethod('scoreDisplay', [null]));
    }

    #[Test]
    public function section_normalizer_keeps_only_requested_allowed_sections(): void
    {
        self::assertSame(['leaders'], $this->invokePdfMethod('normalizeSections', [
            ['leaders', 'unknown', 'LEADERS'],
            ['players', 'leaders'],
        ]));
    }

    #[Test]
    public function tournament_subtitle_uses_fallback_values(): void
    {
        $tournament = new Tournament([
            'format' => 'round_robin',
            'status' => 'draft',
            'start_date' => null,
            'end_date' => '2026-04-19',
        ]);

        self::assertSame('Round Robin | Draft | N/A | 2026-04-19', $this->invokePdfMethod('tournamentSubtitle', [$tournament]));
    }

    #[Test]
    public function team_name_uses_fallback_values_when_relation_is_missing(): void
    {
        $game = new Game([
            'home_team_id' => null,
            'away_team_id' => 7,
            'home_score' => null,
            'away_score' => null,
        ]);
        $game->setRelation('homeTeam', null);
        $game->setRelation('awayTeam', null);

        self::assertSame('Team N/A', $this->invokePdfMethod('teamName', [$game, 'home']));
        self::assertSame('Team 7', $this->invokePdfMethod('teamName', [$game, 'away']));
    }

    #[Test]
    public function result_label_returns_not_recorded_without_scores(): void
    {
        $game = new Game([
            'home_score' => null,
            'away_score' => null,
        ]);

        self::assertSame('Not recorded', $this->invokePdfMethod('resultLabel', [$game]));
    }

    #[Test]
    public function date_helpers_leave_invalid_values_readable(): void
    {
        self::assertSame('not-a-date', $this->invokePdfMethod('formatDateTime', ['not-a-date']));
        self::assertSame('TBD', $this->invokePdfMethod('timeOnly', [null]));
    }

    #[Test]
    public function unknown_round_size_uses_generic_round_label(): void
    {
        self::assertSame('Round (3 matches)', $this->invokePdfMethod('roundLabel', [3]));
    }

    public static function labelizeCases(): array
    {
        return [
            'snake case value' => ['single_elimination', 'Single Elimination'],
            'null value' => [null, 'N/A'],
        ];
    }

    public static function dateTimeCases(): array
    {
        return [
            'format full date time' => ['2026-04-18 18:30:00', 'formatDateTime', '2026-04-18 18:30'],
            'format time only' => ['2026-04-18 18:30:00', 'timeOnly', '18:30'],
        ];
    }

    public static function roundLabelCases(): array
    {
        return [
            'final' => [1, 'Final'],
            'quarterfinals' => [4, 'Quarterfinals'],
        ];
    }

    private function makeMatchWithStats(): Game
    {
        $tournament = new Tournament([
            'id' => 9,
            'name' => 'Spring Cup',
            'venue_name' => 'Main Arena',
        ]);

        $homeTeam = new Team([
            'id' => 1,
            'name' => 'Wolves',
        ]);

        $awayTeam = new Team([
            'id' => 2,
            'name' => 'Falcons',
        ]);

        $game = new Game([
            'id' => 15,
            'tournament_id' => 9,
            'home_team_id' => 1,
            'away_team_id' => 2,
            'round_number' => 3,
            'stage' => 'regular',
            'scheduled_at' => '2026-04-18 18:30:00',
            'status' => 'finished',
            'home_score' => 81,
            'away_score' => 77,
        ]);
        $game->setRelation('tournament', $tournament);
        $game->setRelation('homeTeam', $homeTeam);
        $game->setRelation('awayTeam', $awayTeam);

        $homePlayer = new Player([
            'id' => 10,
            'first_name' => 'Jonas',
            'last_name' => 'Stone',
            'jersey_number' => 12,
        ]);

        $awayPlayer = new Player([
            'id' => 11,
            'first_name' => 'Mantas',
            'last_name' => 'Lake',
            'jersey_number' => 8,
        ]);

        $homeStat = new MatchPlayerStat([
            'player_id' => 10,
            'team_id' => 1,
            'points' => 24,
            'rebounds' => 8,
            'assists' => 5,
            'steals' => 2,
            'blocks' => 1,
            'fouls' => 3,
            'turnovers' => 2,
            'fgm' => 9,
            'fga' => 15,
            'tpm' => 2,
            'tpa' => 5,
            'ftm' => 4,
            'fta' => 6,
        ]);
        $homeStat->setRelation('player', $homePlayer);

        $awayStat = new MatchPlayerStat([
            'player_id' => 11,
            'team_id' => 2,
            'points' => 18,
            'rebounds' => 6,
            'assists' => 7,
            'steals' => 1,
            'blocks' => 0,
            'fouls' => 2,
            'turnovers' => 3,
            'fgm' => 7,
            'fga' => 13,
            'tpm' => 1,
            'tpa' => 4,
            'ftm' => 3,
            'fta' => 4,
        ]);
        $awayStat->setRelation('player', $awayPlayer);

        $game->setRelation('stats', collect([$homeStat, $awayStat]));

        return $game;
    }

    private function makeTournamentWithTeamsAndMatches(): Tournament
    {
        $tournament = new Tournament([
            'id' => 21,
            'name' => 'Spring Cup',
            'format' => 'round_robin',
            'status' => 'active',
            'start_date' => '2026-04-18',
            'end_date' => '2026-04-20',
            'registration_deadline' => '2026-04-10',
            'venue_name' => 'Main Arena',
            'participants_locked' => true,
            'allowed_days' => ['saturday', 'sunday'],
            'time_slots' => ['18:00', '20:00'],
        ]);

        $homeTeam = new Team(['id' => 1, 'name' => 'Wolves', 'city' => 'Kaunas']);
        $awayTeam = new Team(['id' => 2, 'name' => 'Falcons', 'city' => 'Vilnius']);

        $dayMatch = new Game([
            'id' => 31,
            'tournament_id' => 21,
            'home_team_id' => 1,
            'away_team_id' => 2,
            'stage' => 'regular',
            'round_number' => 1,
            'scheduled_at' => '2026-04-18 18:00:00',
            'status' => 'finished',
            'home_score' => 81,
            'away_score' => 77,
        ]);
        $dayMatch->setRelation('homeTeam', $homeTeam);
        $dayMatch->setRelation('awayTeam', $awayTeam);
        $dayMatch->setRelation('tournament', $tournament);

        $playoffMatch = new Game([
            'id' => 32,
            'tournament_id' => 21,
            'home_team_id' => 1,
            'away_team_id' => 2,
            'stage' => 'playoffs',
            'round_number' => 1,
            'scheduled_at' => '2026-04-20 20:00:00',
            'status' => 'finished',
            'home_score' => 88,
            'away_score' => 84,
        ]);
        $playoffMatch->setRelation('homeTeam', $homeTeam);
        $playoffMatch->setRelation('awayTeam', $awayTeam);
        $playoffMatch->setRelation('tournament', $tournament);

        $tournament->setRelation('teams', collect([$homeTeam, $awayTeam]));
        $tournament->setRelation('matches', collect([$dayMatch, $playoffMatch]));

        return $tournament;
    }

    private function invokePdfMethod(string $method, array $args): mixed
    {
        $invoker = \Closure::bind(
            function (string $method, array $args): mixed {
                return self::{$method}(...$args);
            },
            null,
            PdfExportBuilder::class,
        );

        return $invoker($method, $args);
    }
}
